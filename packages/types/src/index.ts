export type ProjectBody = {
  buildCommand: string;
  name: string;
  outputDirectory: string;
  repoName: string;
  rootDirectory: string;
  branch: string;
  username: string;
};

export type BranchResponse = {
  name: string;
};

export type Repo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
};

export type CommitInfo = {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
    };
  };
};

export type QueueMessage = {
  repo_url: string;
  branch: string;
  deployment_id: string;
  root_dir: string;
  output_dir: string;
  build_command: string;
};

export interface ProjectSettingsProps {
  project: any;
  onUpdate?: (updated: Record<string, any>) => void;
}

export type Project = {
  id: string;
  user_id: string;
  name: string;
  repo_url: string;
  build_command: string;
  root_dir: string;
  output_directory: string;
  subdomain: string;
  branches: string;
  current_deployment_id: string;
  createdAt: number | string | Date;
  updatedAt: number | string | Date;
};

export type Deployment = {
  id: string;
  project_id: string;
  branch: string;
  commit_hash: string;
  commit_message: string;
  commit_author: string;
  status: "queued" | "building" | "success" | "failed" | "cancelled";
  createdAt: number | string | Date;
  updatedAt: number | string | Date;
};
