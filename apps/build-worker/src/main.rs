use std::{io::BufRead, process::Command};

fn main() {
    let mut child = Command::new("docker")
        .arg("build")
        .arg("-t")
        .arg("custom-builder")
        .arg("../../build-runner")
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to execute docker command");

    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => println!("{}", line),
                Err(e) => eprintln!("Error reading line: {}", e),
            }
        }
    }

    let mut run_child = Command::new("docker")
        .arg("run")
        .arg("--rm")
        .arg("--memory=1g")
        .arg("--cpus=1.0")
        .arg("-e")
        .arg("REPO_URL=https://github.com/xxeisenberg/4-digit-frontend")
        .arg("-v")
        .arg(format!("{}/output:/workspace", std::env::current_dir().unwrap().display()))
        .arg("custom-builder")
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to execute docker run command");

    if let Some(stdout) = run_child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => println!("{}", line),
                Err(e) => eprintln!("Error reading line: {}", e),
            }
        }
    }
}
