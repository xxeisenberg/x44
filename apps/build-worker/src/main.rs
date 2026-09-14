use aws_sdk_s3 as s3;
use axum::{
    Json, Router,
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
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenvy::dotenv().expect("Failed to load .env file");
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/build-it", post(build_handler))
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(auth_middleware));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    println!("Listening on http://0.0.0.0:8080");

    axum::serve(listener, app).await.unwrap();

    Ok(())
}

async fn build_handler(Json(payload): Json<models::Payload>) -> StatusCode {
    tokio::spawn(async move {
        let deployment_id = payload.deployment_id.clone();

        let success = match run_build_process(
            &payload.deployment_id,
            &payload.github_token,
            &payload.repo_url,
            &payload.branch,
            &payload.output_dir,
            &payload.root_dir,
            &payload.build_command,
        )
        .await
        {
            Ok(_) => match upload_build_output(&payload.deployment_id).await {
                Ok(_) => true,
                Err(e) => {
                    eprintln!("Failed to upload build output: {}", e);
                    false
                }
            },
            Err(e) => {
                eprintln!("Build process failed: {}", e);
                false
            }
        };

        let status = if success { "success" } else { "failed" };
        send_callback(&deployment_id, status).await;
    });

    StatusCode::ACCEPTED
}

async fn send_callback(deployment_id: &str, status: &str) {
    let api_url =
        std::env::var("CONTROL_PLANE_URL").unwrap_or_else(|_| "https://api.x44.diy".to_string());
    let callback_url = format!("{}/api/deployments/callback", api_url.trim_end_matches('/'));
    let auth_token = std::env::var("X44_AUTH_TOKEN").unwrap_or_default();

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "deployment_id": deployment_id,
        "status": status
    });

    let _ = client
        .post(&callback_url)
        .header("Content-Type", "application/json")
        .header("x44-auth", auth_token)
        .json(&body)
        .send()
        .await;
}

async fn upload_build_output(
    deployment_id: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Syncing output to R2...");

    let r2_client = setup_r2_client().await;
    let bucket_name = "x44-deployments";

    if let Err(e) = upload_dir_to_r2(&r2_client, bucket_name, "./output", deployment_id).await {
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
    github_token: &str,
    repo_url: &str,
    branch: &str,
    output_dir: &str,
    root_dir: &str,
    build_command: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Starting deployment with ID: {}", deployment_id);
    let output_path = std::env::current_dir()?.join("output");
    std::fs::create_dir_all(&output_path)?;

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
            "-e",
            &format!("BUILD_COMMAND={}", build_command),
            "-e",
            &format!("ROOT_DIR={}", root_dir),
            "-e",
            &format!("GITHUB_TOKEN={}", github_token),
            "-v",
            &format!("{}:/workspace/{}", output_path.display(), output_dir),
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
        return Err(format!("Build process failed {}", status).into());
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
    let endpoint =
        std::env::var("R2_ENDPOINT").expect("R2_ENDPOINT environment variable must be set");
    let access_key =
        std::env::var("R2_ACCESS_KEY").expect("R2_ACCESS_KEY environment variable must be set");
    let secret_key =
        std::env::var("R2_SECRET_KEY").expect("R2_SECRET_KEY environment variable must be set");

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
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
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
                Err(e) => {
                    return Err(format!("Failed to upload {}: {}", file_path.display(), e).into());
                }
            };
        }
    }
    Ok(())
}
