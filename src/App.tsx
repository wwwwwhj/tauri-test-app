import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Branches from "./Branches";
import CommitDetail from "./CommitDetail";
import RepositorySidebar from "./RepositorySidebar";
import WorkingTree from "./WorkingTree";
import type {
  GitBranchesResult,
  GitCommit,
  GitLogResult,
  GitRefInfo,
} from "./gitTypes";
import "./App.css";
import "./LogFilters.css";
import "./RepositorySidebar.css";

interface GraphRow {
  commit: GitCommit;
  lane: number;
  incomingLanes: number[];
  parentLanes: number[];
}

interface GraphResult {
  rows: GraphRow[];
  laneCount: number;
}

interface LogFilters {
  message: string;
  branch: string;
  author: string;
  hash: string;
}

type AppView = "log" | "changes" | "branches";

const REPOSITORIES_STORAGE_KEY = "tauri-git-client.repositories.v1";
const ACTIVE_REPOSITORY_STORAGE_KEY = "tauri-git-client.active-repository.v1";

const EMPTY_LOG_FILTERS: LogFilters = {
  message: "",
  branch: "",
  author: "",
  hash: "",
};

const LANE_WIDTH = 20;
const GRAPH_SIDE_PADDING = 12;
const GRAPH_NODE_Y = 26;
const GRAPH_ROW_HEIGHT = 76;
const GRAPH_COLORS = [
  "#8250df",
  "#0969da",
  "#1a7f37",
  "#bf8700",
  "#cf222e",
  "#0550ae",
  "#953800",
  "#116329",
];

function readSavedRepositories(): string[] {
  try {
    const raw = localStorage.getItem(REPOSITORIES_STORAGE_KEY);
    if (!raw) return [];

    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    return Array.from(
      new Set(
        value.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        ),
      ),
    );
  } catch {
    return [];
  }
}

function readSavedActiveRepository(repositories: string[]) {
  const active = localStorage.getItem(ACTIVE_REPOSITORY_STORAGE_KEY);
  if (active && repositories.includes(active)) {
    return active;
  }
  return repositories[0] ?? "";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function repositoryName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "Git Client";
}

function laneX(lane: number) {
  return GRAPH_SIDE_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function laneColor(lane: number) {
  return GRAPH_COLORS[lane % GRAPH_COLORS.length];
}

function allocateLane(lanes: Array<string | null>, preferredLane?: number) {
  if (
    preferredLane !== undefined &&
    preferredLane >= 0 &&
    (lanes[preferredLane] === null || lanes[preferredLane] === undefined)
  ) {
    return preferredLane;
  }

  const freeLane = lanes.findIndex((value) => value === null);
  return freeLane >= 0 ? freeLane : lanes.length;
}

function buildGraph(commits: GitCommit[]): GraphResult {
  let lanes: Array<string | null> = [];
  let maxLaneCount = 1;

  const rows = commits.map((commit) => {
    const incomingLanes = lanes
      .map((value, index) => (value ? index : -1))
      .filter((index) => index >= 0);

    let lane = lanes.indexOf(commit.hash);

    if (lane < 0) {
      lane = allocateLane(lanes);
      lanes[lane] = commit.hash;
    }

    const nextLanes = [...lanes];
    nextLanes[lane] = null;

    const parentLanes: number[] = [];

    commit.parents.forEach((parentHash, parentIndex) => {
      let parentLane = nextLanes.indexOf(parentHash);

      if (parentLane < 0) {
        const preferredLane = parentIndex === 0 ? lane : undefined;
        parentLane = allocateLane(nextLanes, preferredLane);
        nextLanes[parentLane] = parentHash;
      }

      parentLanes.push(parentLane);
    });

    while (nextLanes.length > 0 && nextLanes[nextLanes.length - 1] === null) {
      nextLanes.pop();
    }

    maxLaneCount = Math.max(
      maxLaneCount,
      lane + 1,
      nextLanes.length,
      ...parentLanes.map((parentLane) => parentLane + 1),
    );

    lanes = nextLanes;

    return {
      commit,
      lane,
      incomingLanes,
      parentLanes,
    };
  });

  return {
    rows,
    laneCount: maxLaneCount,
  };
}

function graphPath(fromLane: number, toLane: number) {
  const fromX = laneX(fromLane);
  const toX = laneX(toLane);
  const controlY = GRAPH_NODE_Y + 24;

  if (fromLane === toLane) {
    return `M ${fromX} ${GRAPH_NODE_Y} L ${toX} ${GRAPH_ROW_HEIGHT}`;
  }

  return `M ${fromX} ${GRAPH_NODE_Y} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${GRAPH_ROW_HEIGHT}`;
}

function CommitGraph({ row, laneCount }: { row: GraphRow; laneCount: number }) {
  const width = GRAPH_SIDE_PADDING * 2 + laneCount * LANE_WIDTH;

  return (
    <svg
      className="commit-graph"
      width={width}
      height={GRAPH_ROW_HEIGHT}
      viewBox={`0 0 ${width} ${GRAPH_ROW_HEIGHT}`}
      aria-hidden="true"
    >
      {row.incomingLanes.map((incomingLane) => {
        const x = laneX(incomingLane);
        const endY = incomingLane === row.lane ? GRAPH_NODE_Y : GRAPH_ROW_HEIGHT;

        return (
          <line
            key={`incoming-${incomingLane}`}
            x1={x}
            y1={0}
            x2={x}
            y2={endY}
            stroke={laneColor(incomingLane)}
            strokeWidth="2"
          />
        );
      })}

      {row.parentLanes.map((parentLane, index) => (
        <path
          key={`parent-${parentLane}-${index}`}
          d={graphPath(row.lane, parentLane)}
          fill="none"
          stroke={laneColor(parentLane)}
          strokeWidth="2"
        />
      ))}

      <circle
        cx={laneX(row.lane)}
        cy={GRAPH_NODE_Y}
        r="5.5"
        fill={laneColor(row.lane)}
        stroke="var(--graph-node-border)"
        strokeWidth="2"
      />
    </svg>
  );
}

function RefBadge({ gitRef }: { gitRef: GitRefInfo }) {
  return (
    <span
      className={`ref-badge ref-${gitRef.kind}${gitRef.current ? " ref-current" : ""}`}
      title={`${gitRef.kind}: ${gitRef.name}`}
    >
      {gitRef.current && <span className="ref-current-dot" />}
      {gitRef.name}
    </span>
  );
}

function hasActiveFilters(filters: LogFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function App() {
  const initialRepositories = useMemo(() => readSavedRepositories(), []);
  const [repositories, setRepositories] = useState<string[]>(initialRepositories);
  const [repoPath, setRepoPath] = useState(() =>
    readSavedActiveRepository(initialRepositories),
  );
  const [branch, setBranch] = useState("");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [activeView, setActiveView] = useState<AppView>("log");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logFilters, setLogFilters] = useState<LogFilters>(EMPTY_LOG_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<LogFilters>(EMPTY_LOG_FILTERS);
  const [logBranches, setLogBranches] = useState<GitBranchesResult>({
    currentBranch: "",
    local: [],
    remote: [],
  });

  const title = repoPath ? repositoryName(repoPath) : "Git Client";
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const filtersActive = hasActiveFilters(appliedFilters);

  useEffect(() => {
    localStorage.setItem(REPOSITORIES_STORAGE_KEY, JSON.stringify(repositories));
  }, [repositories]);

  useEffect(() => {
    if (repoPath) {
      localStorage.setItem(ACTIVE_REPOSITORY_STORAGE_KEY, repoPath);
    } else {
      localStorage.removeItem(ACTIVE_REPOSITORY_STORAGE_KEY);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath) {
      void activateRepository(repoPath);
    }
  }, []);

  function updateLogFilter<K extends keyof LogFilters>(key: K, value: LogFilters[K]) {
    setLogFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetRepositoryContext() {
    setBranch("");
    setCommits([]);
    setSelectedCommit(null);
    setLogFilters(EMPTY_LOG_FILTERS);
    setAppliedFilters(EMPTY_LOG_FILTERS);
    setLogBranches({ currentBranch: "", local: [], remote: [] });
    setError("");
  }

  async function loadLogBranches(path: string) {
    try {
      const result = await invoke<GitBranchesResult>("get_git_branches", { repoPath: path });
      setLogBranches(result);
    } catch {
      setLogBranches({ currentBranch: "", local: [], remote: [] });
    }
  }

  async function loadGitLog(
    path: string,
    preserveSelection = false,
    filters: LogFilters = appliedFilters,
  ) {
    setLoading(true);
    setError("");

    try {
      const result = await invoke<GitLogResult>("get_git_log", {
        repoPath: path,
        skip: 0,
        limit: 100,
        branchFilter: filters.branch || null,
        authorFilter: filters.author || null,
        messageFilter: filters.message || null,
        hashFilter: filters.hash || null,
      });

      setRepoPath(result.repositoryPath);
      setBranch(result.currentBranch);
      setCommits(result.commits);
      setSelectedCommit((current) => {
        if (!preserveSelection || !current) return null;
        return result.commits.find((commit) => commit.hash === current.hash) ?? null;
      });
    } catch (err) {
      setError(String(err));
      setCommits([]);
      setBranch("");
      setSelectedCommit(null);
    } finally {
      setLoading(false);
    }
  }

  async function activateRepository(path: string) {
    resetRepositoryContext();
    setRepoPath(path);
    setActiveView("log");

    await Promise.all([
      loadGitLog(path, false, EMPTY_LOG_FILTERS),
      loadLogBranches(path),
    ]);
  }

  async function addRepository() {
    setError("");

    try {
      const selected = await invoke<string | null>("pick_git_repository");
      if (!selected) return;

      setRepositories((current) =>
        current.includes(selected) ? current : [...current, selected],
      );
      await activateRepository(selected);
    } catch (err) {
      setError(String(err));
    }
  }

  async function switchRepository(path: string) {
    if (path === repoPath && commits.length > 0) return;
    await activateRepository(path);
  }

  function removeRepository(path: string) {
    const remaining = repositories.filter((item) => item !== path);
    setRepositories(remaining);

    if (path !== repoPath) return;

    const next = remaining[0] ?? "";
    if (next) {
      void activateRepository(next);
      return;
    }

    resetRepositoryContext();
    setRepoPath("");
    setActiveView("log");
  }

  async function refresh() {
    if (!repoPath) return;
    await Promise.all([
      loadGitLog(repoPath, true, appliedFilters),
      loadLogBranches(repoPath),
    ]);
  }

  async function applyFilters() {
    if (!repoPath) return;
    const nextFilters = {
      message: logFilters.message.trim(),
      branch: logFilters.branch,
      author: logFilters.author.trim(),
      hash: logFilters.hash.trim(),
    };
    setAppliedFilters(nextFilters);
    await loadGitLog(repoPath, false, nextFilters);
  }

  async function clearFilters() {
    if (!repoPath) return;
    setLogFilters(EMPTY_LOG_FILTERS);
    setAppliedFilters(EMPTY_LOG_FILTERS);
    await loadGitLog(repoPath, false, EMPTY_LOG_FILTERS);
  }

  async function handleBranchChanged() {
    const nextFilters = { ...appliedFilters, branch: "" };
    setLogFilters((current) => ({ ...current, branch: "" }));
    setAppliedFilters(nextFilters);
    await Promise.all([
      loadGitLog(repoPath, false, nextFilters),
      loadLogBranches(repoPath),
    ]);
  }

  return (
    <div className="app-frame">
      <RepositorySidebar
        repositories={repositories}
        activePath={repoPath}
        loading={loading}
        onAdd={() => void addRepository()}
        onSelect={(path) => void switchRepository(path)}
        onRemove={removeRepository}
      />

      <main className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">TAURI GIT CLIENT</div>
            <h1>{title}</h1>
            <div className="repo-meta">
              <span className="repo-path">
                {repoPath || "请从左侧添加一个本地 Git 仓库"}
              </span>
              {branch && <span className="branch-badge">{branch}</span>}
            </div>
          </div>

          <div className="actions">
            {repoPath && activeView === "log" && (
              <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>
                刷新
              </button>
            )}
            <button className="primary-button" onClick={() => void addRepository()} disabled={loading}>
              Add Repository
            </button>
          </div>
        </header>

        {error && <div className="error-panel">{error}</div>}

        {!repoPath && !error && (
          <section className="empty-state">
            <div className="empty-icon">⌘</div>
            <h2>添加本地 Git 仓库</h2>
            <p>可以保存多个仓库，并从左侧列表随时切换。</p>
            <button className="primary-button" onClick={() => void addRepository()}>
              Add Repository
            </button>
          </section>
        )}

        {repoPath && (
          <>
            <nav className="view-tabs" aria-label="Git views">
              <button
                type="button"
                className={activeView === "log" ? "active" : ""}
                onClick={() => setActiveView("log")}
              >
                Log
              </button>
              <button
                type="button"
                className={activeView === "changes" ? "active" : ""}
                onClick={() => setActiveView("changes")}
              >
                Local Changes
              </button>
              <button
                type="button"
                className={activeView === "branches" ? "active" : ""}
                onClick={() => setActiveView("branches")}
              >
                Branches
              </button>
            </nav>

            {activeView === "log" && (
              <section className="workspace">
                <section className="history-panel">
                  <div className="history-header">
                    <div>
                      <strong>提交记录</strong>
                      <span>{commits.length} 条</span>
                      <span>{graph.laneCount} 条活动图轨</span>
                      {filtersActive && <span className="filter-active-badge">FILTERED</span>}
                    </div>
                    {loading && <span className="loading-text">正在读取 Git...</span>}
                  </div>

                  <div
                    className="log-filter-bar"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void applyFilters();
                      }
                    }}
                  >
                    <label>
                      <span>Message</span>
                      <input
                        type="search"
                        value={logFilters.message}
                        onChange={(event) =>
                          updateLogFilter("message", event.currentTarget.value)
                        }
                        placeholder="Search commit message"
                      />
                    </label>

                    <label>
                      <span>Branch</span>
                      <select
                        value={logFilters.branch}
                        onChange={(event) =>
                          updateLogFilter("branch", event.currentTarget.value)
                        }
                      >
                        <option value="">All branches</option>
                        <optgroup label="Local">
                          {logBranches.local.map((item) => (
                            <option value={item.fullName} key={item.fullName}>
                              {item.current ? `● ${item.name}` : item.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Remote">
                          {logBranches.remote.map((item) => (
                            <option value={item.fullName} key={item.fullName}>
                              {item.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

                    <label>
                      <span>Author</span>
                      <input
                        value={logFilters.author}
                        onChange={(event) =>
                          updateLogFilter("author", event.currentTarget.value)
                        }
                        placeholder="Name or email"
                      />
                    </label>

                    <label>
                      <span>Commit Hash</span>
                      <input
                        value={logFilters.hash}
                        onChange={(event) =>
                          updateLogFilter("hash", event.currentTarget.value)
                        }
                        placeholder="e.g. a1b2c3d"
                        spellCheck={false}
                      />
                    </label>

                    <div className="log-filter-actions">
                      <button
                        type="button"
                        className="primary-button compact-button"
                        onClick={() => void applyFilters()}
                        disabled={loading}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => void clearFilters()}
                        disabled={loading || (!hasActiveFilters(logFilters) && !filtersActive)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {!loading && commits.length === 0 ? (
                    <div className="empty-history">
                      {filtersActive
                        ? "没有符合当前筛选条件的提交。"
                        : "当前仓库没有可显示的提交记录。"}
                    </div>
                  ) : (
                    <div className="commit-list">
                      {graph.rows.map((row) => {
                        const commit = row.commit;
                        const selected = selectedCommit?.hash === commit.hash;

                        return (
                          <button
                            type="button"
                            className={`commit-row${selected ? " selected" : ""}`}
                            key={commit.hash}
                            onClick={() => setSelectedCommit(commit)}
                          >
                            <span className="graph-column">
                              <CommitGraph row={row} laneCount={graph.laneCount} />
                            </span>

                            <span className="commit-content">
                              <span className="commit-title-row">
                                <span className="commit-message">
                                  {commit.message || "(无提交说明)"}
                                </span>
                                {commit.refs.length > 0 && (
                                  <span className="commit-refs">
                                    {commit.refs.map((gitRef, index) => (
                                      <RefBadge
                                        key={`${gitRef.kind}-${gitRef.name}-${index}`}
                                        gitRef={gitRef}
                                      />
                                    ))}
                                  </span>
                                )}
                              </span>

                              <span className="commit-details">
                                <code title={commit.hash}>{commit.shortHash}</code>
                                <span>{commit.authorName}</span>
                                <span title={commit.authorEmail}>{commit.authorEmail}</span>
                                <span>{formatDate(commit.date)}</span>
                                {commit.parents.length > 1 && (
                                  <span className="merge-badge">
                                    merge · {commit.parents.length} parents
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <CommitDetail repoPath={repoPath} commit={selectedCommit} />
              </section>
            )}

            {activeView === "changes" && (
              <WorkingTree
                repoPath={repoPath}
                onCommitted={() => loadGitLog(repoPath, false, appliedFilters)}
              />
            )}

            {activeView === "branches" && (
              <Branches repoPath={repoPath} onBranchChanged={handleBranchChanged} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
