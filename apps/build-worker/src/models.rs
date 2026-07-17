use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueResponse {
    pub success: bool,
    pub errors: Vec<String>,
    pub messages: Vec<String>,
    pub result: QueueResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueResult {
    pub metadata: QueueMetadata,
    pub message_backlog_count: u64,
    pub messages: Vec<QueueMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueMetadata {
    pub metrics: QueueMetrics,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueMetrics {
    pub backlog_count: u64,
    pub backlog_bytes: u64,
    pub oldest_message_timestamp_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueMessage {
    pub id: String,
    pub timestamp_ms: u64,
    pub body: Payload,
    pub attempts: u32,
    pub metadata: HashMap<String, String>,
    pub lease_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Payload {
    pub repo_url: String,
    pub deployment_id: String,
    pub branch: String,
    pub root_dir: String,
    pub output_dir: String,
    pub build_command: String,
}
