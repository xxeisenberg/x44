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
