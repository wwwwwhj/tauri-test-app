export type GitRefKind = "branch" | "remote" | "tag" | "head" | "ref";

export interface GitRefInfo {
  name: string;
  kind: GitRefKind;
  current: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  refs: GitRefInfo[];
}

export interface GitLogResult {
  repositoryPath: string;
  currentBranch: string;
  commits: GitCommit[];
}

export interface GitChangedFile {
  path: string;
  oldPath: string | null;
  status: string;
}

export interface GitFileDiff {
  path: string;
  content: string;
  truncated: boolean;
}
