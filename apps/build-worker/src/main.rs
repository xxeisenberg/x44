use std::{io::BufRead, path::Path, process::Command};
use aws_sdk_s3 as s3;
use walkdir::WalkDir;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {

    let deployment_id = format!("deploy-{}", uuid::Uuid::new_v4().to_string()[..5].to_string());
    println!("Starting deployment with ID: {}", deployment_id);

    let mut child = Command::new("docker")
        .args(["run", "--rm", "--memory=1g", "--cpus=1.0", "-e", "REPO_URL=https://github.com/xxeisenberg/test", "-v", "./output:/workspace", "custom-builder"]) 
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

    println!("Build complete. Syncing output to R2...");

    let r2_client = setup_r2_client().await;
    let bucket_name = "x44-deployments";

    if let Err(e) = upload_dir_to_r2(&r2_client, bucket_name, "./output", &deployment_id).await {
        eprintln!("Error uploading to R2: {}", e);
    } else {
        println!("Deployment {} uploaded successfully to R2 bucket {}", deployment_id, bucket_name);
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


async fn setup_r2_client() -> s3::Client {
    let endpoint = std::env::var("R2_ENDPOINT").unwrap_or_default();
    let access_key = std::env::var("R2_ACCESS_KEY").unwrap_or_default();
    let secret_key = std::env::var("R2_SECRET_KEY").unwrap_or_default();

    let config = aws_config::from_env()
        .endpoint_url(endpoint)
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            access_key, secret_key, None, None, "R2"))
        .region("auto")
        .load()
        .await;

    s3::Client::new(&config)
}

async fn upload_dir_to_r2(client: &s3::Client, bucket: &str, dir: &str, deployment_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let base_path = Path::new(dir);

    for entry in WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let file_path = entry.path();
            
            let relative_path = file_path.strip_prefix(base_path)?;
            let r2_key = format!("deployments/{}/{}", deployment_id, relative_path.display()).replace("\\", "/");

            let content_type = mime_guess::from_path(file_path).first_or_octet_stream().to_string();

            println!("Uploading {}({}) to R2 as {}", file_path.display(), content_type, r2_key);

            let body = s3::primitives::ByteStream::from_path(file_path).await.unwrap();
            
            match client.put_object()
                .bucket(bucket)
                .key(r2_key)
                .body(body)
                .content_type(content_type)
                .send()
                .await {
                    Ok(_) => println!("Successfully uploaded {}", file_path.display()),
                    Err(e) => eprintln!("Failed to upload {}: {}", file_path.display(), e),
                };
        }
    }
    Ok(())
}