export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitConfigEntry {
  key: string;
  value: string;
  origin: string | null;
  sourceScope: string;
}

export interface GitConfigLayers {
  global: GitConfigEntry[];
  local: GitConfigEntry[];
  effective: GitConfigEntry[];
}

export interface GitWorkingState {
  clean: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export interface GitRepositoryInfo {
  repositoryPath: string;
  gitDir: string;
  gitVersion: string;
  currentBranch: string;
  detachedHead: boolean;
  headHash: string | null;
  headShortHash: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  workingState: GitWorkingState;
  remotes: GitRemoteInfo[];
  config: GitConfigLayers;
}

export interface GitInfoCacheEntry {
  updatedAt: number;
  info: GitRepositoryInfo;
}

const CACHE_STORAGE_KEY = "tauri-git-client.repository-info-cache.v1";

export const GIT_INFO_CACHE_TTL_MS = 10 * 60 * 1000;
export const GIT_INFO_AUTO_REFRESH_MS = 10 * 60 * 1000;

function readCacheMap(): Record<string, GitInfoCacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return parsed as Record<string, GitInfoCacheEntry>;
  } catch {
    return {};
  }
}

function writeCacheMap(cache: Record<string, GitInfoCacheEntry>) {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Cache persistence is best-effort. Repository settings can always be re-read from Git.
  }
}

export function readGitInfoCache(repoPath: string): GitInfoCacheEntry | null {
  const entry = readCacheMap()[repoPath];
  if (!entry || typeof entry.updatedAt !== "number" || !entry.info) return null;
  return entry;
}

export function writeGitInfoCache(repoPath: string, info: GitRepositoryInfo, updatedAt = Date.now()) {
  const cache = readCacheMap();
  cache[repoPath] = { updatedAt, info };
  writeCacheMap(cache);
}

export function isGitInfoCacheStale(entry: GitInfoCacheEntry | null, now = Date.now()) {
  return !entry || now - entry.updatedAt >= GIT_INFO_CACHE_TTL_MS;
}
