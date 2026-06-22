use aws_sdk_s3 as s3;
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::post,
};
use std::{io::BufRead, path::Path, process::Command};
use tower_http::trace::TraceLayer;
use walkdir::WalkDir;

mod models;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().expect("Failed to load .env file");
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/build-it", post(build_handler))
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(auth_middleware));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:1844").await.unwrap();

    println!("Listening on http://0.0.0.0:1844");

    axum::serve(listener, app).await.unwrap();

    Ok(())
}

async fn build_handler() {
    match get_job_from_queue().await {
        Ok(queue_response) => {
            if !queue_response.success {
                eprintln!("Failed to pull message from queue: {:?}", queue_response.errors);
                return;
            }

            if let Some(message) = queue_response.result.messages.first() {
                println!("Received job with ID: {}", message.id);
                println!("Message body: {:?}", message.body);
                
                let repo_url = &message.body.repo_url;
                let deployment_id = &message.body.deployment_id;
                let branch = &message.body.branch;

                if let Err(e) = run_build_process(&deployment_id, &repo_url, &branch, "output").await {
                    eprintln!("Build process failed: {}", e);
                    return;
                }

                if let Err(e) = upload_build_output(&deployment_id).await {
                    eprintln!("Failed to upload build output: {}", e);
                    return;
                }

                if let Err(e) = acknowledge_message(&message.lease_id).await {
                    eprintln!("Failed to acknowledge message: {}", e);
                }

            } else {
                println!("No messages in the queue.");
            }
        }
        Err(e) => eprintln!("Error fetching job from queue: {}", e),
    }
}

async fn acknowledge_message(lease_id: &str) -> Result<(), reqwest::Error> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("https://api.cloudflare.com/client/v4/accounts/{}/queues/{}/messages/ack", std::env::var("CLOUDFLARE_ACCOUNT_ID").expect("Cloudflare Account ID is not set."), std::env::var("QUEUE_ID").expect("Cloudflare Queue ID is not set.")))
        .header("Authorization", format!("Bearer {}", std::env::var("CLOUDFLARE_API_TOKEN").expect("Cloudflare API Token is not set.")))
        .json(&serde_json::json!({ "lease_id": lease_id }))
        .send()
        .await?;

    if response.status().is_success() {
        println!("Message with lease ID {} acknowledged successfully.", lease_id);
    } else {
        eprintln!("Failed to acknowledge message with lease ID {}. Status: {}", lease_id, response.status());
    }

    Ok(())
}

async fn get_job_from_queue() -> Result<models::QueueResponse, reqwest::Error> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("https://api.cloudflare.com/client/v4/accounts/{}/queues/{}/messages/pull", std::env::var("CLOUDFLARE_ACCOUNT_ID").expect("Cloudflare Account ID is not set."), std::env::var("QUEUE_ID").expect("Cloudflare Queue ID is not set.")))
        .header("Authorization", format!("Bearer {}", std::env::var("CLOUDFLARE_API_TOKEN").expect("Cloudflare API Token is not set.")))
        .send()
        .await?;

    let data : models::QueueResponse = response.json().await?;

    Ok(data)
}

async fn upload_build_output(deployment_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("Syncing output to R2...");

    let r2_client = setup_r2_client().await;
    let bucket_name = "x44-deployments";

    if let Err(e) = upload_dir_to_r2(&r2_client, bucket_name, "./output", &deployment_id).await {
        eprintln!("Error uploading to R2: {}", e);
    } else {
        println!(
            "Deployment {} uploaded successfully to R2 bucket {}",
            deployment_id, bucket_name
        );
    }

    println!("Cleaning up local output directory...");
    if let Err(e) = std::fs::remove_dir_all("./output") {
        eprintln!("Error cleaning up output directory: {}", e);
    } else {
        println!("Output directory cleaned up successfully.");
    }

    std::fs::create_dir("./output")?;
    println!("Deployment process completed for ID: {}", deployment_id);
    Ok(())
}

async fn run_build_process(
    deployment_id: &str,
    repo_url: &str,
    branch: &str,
    output_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting deployment with ID: {}", deployment_id);

    let mut child = Command::new("docker")
        .args([
            "run",
            "--rm",
            "--memory=1g",
            "--cpus=1.0",
            "-e",
            &format!("REPO_URL={}", repo_url),
            "-e",
            &format!("BRANCH={}", branch),
            "-v",
            &format!("output:/workspace/{}", output_dir),
            "custom-builder",
        ])
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to execute docker run command");

    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => println!("{}", line),
                Err(e) => eprintln!("Error reading line: {}", e),
            }
        }
    }

    let status = child.wait().expect("Failed to wait on child process");
    if !status.success() {
        eprintln!("Docker build process failed with status: {}", status);
        return Ok(());
    }

    Ok(())
}

async fn auth_middleware(request: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get("x44-auth")
        .and_then(|h| h.to_str().ok());

    match auth_header {
        Some(token) if token == std::env::var("X44_AUTH_TOKEN").unwrap_or_default() => {
            Ok(next.run(request).await)
        }
        _ => {
            eprintln!("Unauthorized access attempt.");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn setup_r2_client() -> s3::Client {
    let endpoint = std::env::var("R2_ENDPOINT").unwrap_or_default();
    let access_key = std::env::var("R2_ACCESS_KEY").unwrap_or_default();
    let secret_key = std::env::var("R2_SECRET_KEY").unwrap_or_default();

    let config = aws_config::from_env()
        .endpoint_url(endpoint)
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            access_key, secret_key, None, None, "R2",
        ))
        .region("auto")
        .load()
        .await;

    s3::Client::new(&config)
}

async fn upload_dir_to_r2(
    client: &s3::Client,
    bucket: &str,
    dir: &str,
    deployment_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let base_path = Path::new(dir);

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let file_path = entry.path();

            let relative_path = file_path.strip_prefix(base_path)?;
            let r2_key = format!("deployments/{}/{}", deployment_id, relative_path.display())
                .replace("\\", "/");

            let content_type = mime_guess::from_path(file_path)
                .first_or_octet_stream()
                .to_string();

            println!(
                "Uploading {}({}) to R2 as {}",
                file_path.display(),
                content_type,
                r2_key
            );

            let body = s3::primitives::ByteStream::from_path(file_path)
                .await
                .unwrap();

            match client
                .put_object()
                .bucket(bucket)
                .key(r2_key)
                .body(body)
                .content_type(content_type)
                .send()
                .await
            {
                Ok(_) => println!("Successfully uploaded {}", file_path.display()),
                Err(e) => eprintln!("Failed to upload {}: {}", file_path.display(), e),
            };
        }
    }
    Ok(())
}
