export type AppView = "log" | "changes" | "branches" | "info";

export interface LogFilters {
  message: string;
  branch: string;
  author: string;
  hash: string;
}

export interface RepositoryScrollPositions {
  log: number;
  changes: number;
  branchesLocal: number;
  branchesRemote: number;
}

export interface RepositorySession {
  activeView: AppView;
  logFilters: LogFilters;
  appliedFilters: LogFilters;
  selectedCommitHash: string | null;
  scroll: RepositoryScrollPositions;
}

export type RepositorySessions = Record<string, RepositorySession>;

const REPOSITORY_SESSIONS_STORAGE_KEY = "tauri-git-client.repository-sessions.v1";

export const EMPTY_LOG_FILTERS: LogFilters = {
  message: "",
  branch: "",
  author: "",
  hash: "",
};

export function createDefaultRepositorySession(): RepositorySession {
  return {
    activeView: "log",
    logFilters: { ...EMPTY_LOG_FILTERS },
    appliedFilters: { ...EMPTY_LOG_FILTERS },
    selectedCommitHash: null,
    scroll: {
      log: 0,
      changes: 0,
      branchesLocal: 0,
      branchesRemote: 0,
    },
  };
}

function normalizeFilters(value: unknown): LogFilters {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    message: typeof record.message === "string" ? record.message : "",
    branch: typeof record.branch === "string" ? record.branch : "",
    author: typeof record.author === "string" ? record.author : "",
    hash: typeof record.hash === "string" ? record.hash : "",
  };
}

function normalizeScroll(value: unknown): RepositoryScrollPositions {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const number = (key: string) => {
    const candidate = record[key];
    return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
      ? candidate
      : 0;
  };

  return {
    log: number("log"),
    changes: number("changes"),
    branchesLocal: number("branchesLocal"),
    branchesRemote: number("branchesRemote"),
  };
}

function normalizeSession(value: unknown): RepositorySession {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const activeView = record.activeView;

  return {
    activeView:
      activeView === "changes" ||
      activeView === "branches" ||
      activeView === "info" ||
      activeView === "log"
        ? activeView
        : "log",
    logFilters: normalizeFilters(record.logFilters),
    appliedFilters: normalizeFilters(record.appliedFilters),
    selectedCommitHash:
      typeof record.selectedCommitHash === "string" && record.selectedCommitHash.length > 0
        ? record.selectedCommitHash
        : null,
    scroll: normalizeScroll(record.scroll),
  };
}

export function loadRepositorySessions(): RepositorySessions {
  try {
    const raw = localStorage.getItem(REPOSITORY_SESSIONS_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([path]) => path.trim().length > 0)
        .map(([path, session]) => [path, normalizeSession(session)]),
    );
  } catch {
    return {};
  }
}

export function saveRepositorySessions(sessions: RepositorySessions) {
  localStorage.setItem(REPOSITORY_SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}
