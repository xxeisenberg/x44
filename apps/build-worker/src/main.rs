use aws_sdk_s3::{self as s3};
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{Request, StatusCode, header},
    middleware::{self, Next},
    response::{
        IntoResponse, Response, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use std::{collections::HashMap, convert::Infallible, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{RwLock, broadcast},
};
use tokio_stream::{StreamExt, wrappers::BroadcastStream};
use tower_http::trace::TraceLayer;
use walkdir::WalkDir;

mod models;

#[derive(Clone, Debug)]
struct BuildSession {
    sender: tokio::sync::broadcast::Sender<String>,
    history: Arc<RwLock<Vec<String>>>,
}

impl BuildSession {
    async fn record(&self, msg: impl Into<String>) {
        let msg = msg.into();
        let _ = self.sender.send(msg.clone());
        self.history.write().await.push(msg);
    }
}

#[derive(Clone, Default)]
struct BuildState {
    build_sessions: Arc<RwLock<HashMap<String, BuildSession>>>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenvy::dotenv().expect("Failed to load .env file");
    tracing_subscriber::fmt::init();

    let state = BuildState::default();

    let app = Router::new()
        .route(
            "/build-it",
            post(build_handler).layer(middleware::from_fn(auth_middleware)),
        )
        .route("/logs/{deployment_id}", get(log_handler))
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();

    println!("Listening on http://0.0.0.0:8080");

    axum::serve(listener, app).await.unwrap();

    Ok(())
}

async fn log_handler(
    State(state): State<BuildState>,
    Path(deployment_id): Path<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let session = {
        let sessions = state.build_sessions.read().await;
        sessions.get(&deployment_id).cloned()
    };

    let Some(session) = session else {
        return Err(StatusCode::NOT_FOUND);
    };

    let past_lines = session.history.read().await.clone();
    let history_stream =
        tokio_stream::iter(past_lines).map(|line| Ok::<_, Infallible>(Event::default().data(line)));

    let rx = session.sender.subscribe();
    let live_stream = BroadcastStream::new(rx).filter_map(|res| match res {
        Ok(line) => Some(Ok::<_, Infallible>(Event::default().data(line))),
        Err(_) => None,
    });

    let combined_stream = history_stream.chain(live_stream);

    let sse = Sse::new(combined_stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(3))
            .text("ping"),
    );

    let headers = [
        (header::CACHE_CONTROL, "no-cache, no-transform"),
        (header::HeaderName::from_static("x-accel-buffering"), "no"),
    ];

    Ok((headers, sse))
}

async fn build_handler(
    State(state): State<BuildState>,
    Json(payload): Json<models::Payload>,
) -> StatusCode {
    let deployment_id = payload.deployment_id.clone();
    let (sender, _) = broadcast::channel::<String>(1000);

    let build_session = BuildSession {
        sender,
        history: Arc::new(RwLock::new(Vec::<String>::new())),
    };

    state
        .build_sessions
        .write()
        .await
        .insert(deployment_id.clone(), build_session.clone());

    let state_clone = state.clone();
    tokio::spawn(async move {
        let build_res = run_build_process(
            &payload.deployment_id,
            &payload.github_token,
            &payload.repo_url,
            &payload.branch,
            &payload.output_dir,
            &payload.root_dir,
            &payload.build_command,
            build_session.clone(),
        )
        .await;

        let success = match build_res {
            Ok(_) => {
                // --- Step 5: Upload ---
                build_session.record("[x44:step:start] Upload").await;
                let upload_start = std::time::Instant::now();

                let upload_res = upload_build_output(&payload.deployment_id).await;
                let upload_dur = upload_start.elapsed().as_secs();

                match upload_res {
                    Ok(_) => {
                        build_session
                            .record(format!("[x44:step:end] Upload ({}s)", upload_dur))
                            .await;
                        true
                    }
                    Err(e) => {
                        eprintln!("Failed to upload build output: {}", e);
                        build_session
                            .record(format!("[x44 BUILD ERROR] Upload failed: {}", e))
                            .await;
                        false
                    }
                }
            }
            Err(e) => {
                eprintln!("Build process failed: {}", e);
                false
            }
        };

        let status = if success { "success" } else { "failed" };

        // --- Step 6: Deploy ---
        build_session.record("[x44:step:start] Deploy").await;
        let deploy_start = std::time::Instant::now();

        send_callback(&deployment_id, status).await;

        let deploy_dur = deploy_start.elapsed().as_secs();
        build_session
            .record(format!("[x44:step:end] Deploy ({}s)", deploy_dur))
            .await;

        // Terminal exit signal
        build_session
            .record(format!("[x44] Build finished with status: {}", status))
            .await;

        // Sync complete log buffer to R2
        let all_logs = build_session.history.read().await.join("\n");
        let s3client = setup_r2_client().await;
        let log_bytestream = aws_sdk_s3::primitives::ByteStream::from(all_logs.into_bytes());

        match s3client
            .put_object()
            .bucket("x44-deployments")
            .key(format!("deployments/{}/build.log", deployment_id))
            .body(log_bytestream)
            .content_type("text/plain; charset=utf-8")
            .send()
            .await
        {
            Ok(_) => println!("Logs uploaded successfully to R2 for {}", deployment_id),
            Err(e) => eprintln!("Failed to upload logs to R2: {}", e),
        };

        // Clean up in-memory session from RAM
        state_clone
            .build_sessions
            .write()
            .await
            .remove(&deployment_id);
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
    session: BuildSession,
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
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to execute docker run command");

    let stdout = child.stdout.take().expect("failed to take stdout");
    let stderr = child.stderr.take().expect("failed to take stderr");

    let session_clone = session.clone();
    let stdout_reader = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            let _ = session_clone.sender.send(line.clone());
            session_clone.history.write().await.push(line);
        }
    });

    let stderr_reader = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            let _ = session.sender.send(line.clone());
            session.history.write().await.push(line);
        }
    });

    let status = child.wait().await?;
    let _ = tokio::join!(stdout_reader, stderr_reader);
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
    let base_path = std::path::Path::new(dir);

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
