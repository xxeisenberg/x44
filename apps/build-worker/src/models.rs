use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Payload {
    pub repo_url: String,
    pub deployment_id: String,
    pub branch: String,
    pub root_dir: String,
    pub output_dir: String,
    pub build_command: String,
}
