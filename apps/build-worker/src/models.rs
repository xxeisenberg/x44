use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct Payload {
    pub repo_url: String,
    pub github_token: String,
    pub deployment_id: String,
    pub branch: String,
    pub root_dir: String,
    pub output_dir: String,
    pub build_command: String,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
}
