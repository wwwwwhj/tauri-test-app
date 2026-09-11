import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Branches from "./Branches";
import CommitDetail from "./CommitDetail";
import GitInfo from "./GitInfo";
import RepositorySidebar from "./RepositorySidebar";
import UiPreferences from "./UiPreferences";
import WorkingTree from "./WorkingTree";
import { useI18n } from "./i18n";
import type {
  GitBranchesResult,
  GitCommit,
  GitLogResult,
  GitRefInfo,
} from "./gitTypes";
import {
  createDefaultRepositorySession,
  EMPTY_LOG_FILTERS,
  loadRepositorySessions,
  saveRepositorySessions,
  type AppView,
  type LogFilters,
  type RepositorySession,
} from "./repositorySession";
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

const REPOSITORIES_STORAGE_KEY = "tauri-git-client.repositories.v1";
const ACTIVE_REPOSITORY_STORAGE_KEY = "tauri-git-client.active-repository.v1";

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

function repositoryName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "Git Workbench";
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
  const { t, formatDate } = useI18n();
  const initialRepositories = useMemo(() => readSavedRepositories(), []);
  const initialRepoPath = useMemo(
    () => readSavedActiveRepository(initialRepositories),
    [initialRepositories],
  );
  const initialSessions = useMemo(() => loadRepositorySessions(), []);

  const [repositories, setRepositories] = useState<string[]>(initialRepositories);
  const [repoPath, setRepoPath] = useState(initialRepoPath);
  const [branch, setBranch] = useState("");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [activeView, setActiveView] = useState<AppView>(
    initialRepoPath ? initialSessions[initialRepoPath]?.activeView ?? "log" : "log",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logFilters, setLogFilters] = useState<LogFilters>(
    initialRepoPath
      ? initialSessions[initialRepoPath]?.logFilters ?? { ...EMPTY_LOG_FILTERS }
      : { ...EMPTY_LOG_FILTERS },
  );
  const [appliedFilters, setAppliedFilters] = useState<LogFilters>(
    initialRepoPath
      ? initialSessions[initialRepoPath]?.appliedFilters ?? { ...EMPTY_LOG_FILTERS }
      : { ...EMPTY_LOG_FILTERS },
  );
  const [logBranches, setLogBranches] = useState<GitBranchesResult>({
    currentBranch: "",
    local: [],
    remote: [],
  });

  const sessionsRef = useRef(initialSessions);
  const activeRepositoryRef = useRef(initialRepoPath);
  const sessionPersistTimerRef = useRef<number | null>(null);
  const startupLoadedRef = useRef(false);
  const logListRef = useRef<HTMLDivElement>(null);

  const title = repoPath ? repositoryName(repoPath) : t("app.name");
  const graph = useMemo(() => buildGraph(commits), [commits]);
  const filtersActive = hasActiveFilters(appliedFilters);
  const currentSession = repoPath
    ? sessionsRef.current[repoPath] ?? createDefaultRepositorySession()
    : createDefaultRepositorySession();

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
    if (startupLoadedRef.current || !repoPath) return;
    startupLoadedRef.current = true;
    void activateRepository(repoPath);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionPersistTimerRef.current !== null) {
        window.clearTimeout(sessionPersistTimerRef.current);
      }
      saveRepositorySessions(sessionsRef.current);
    };
  }, []);

  useEffect(() => {
    if (!repoPath || activeView !== "log" || loading || !logListRef.current) return;
    const element = logListRef.current;
    const scrollTop = getRepositorySession(repoPath).scroll.log;
    const frame = requestAnimationFrame(() => {
      element.scrollTop = scrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [repoPath, activeView, loading, commits.length]);

  function getRepositorySession(path: string): RepositorySession {
    const existing = sessionsRef.current[path];
    if (existing) return existing;

    const created = createDefaultRepositorySession();
    sessionsRef.current = {
      ...sessionsRef.current,
      [path]: created,
    };
    return created;
  }

  function persistSessions(deferred = false) {
    if (sessionPersistTimerRef.current !== null) {
      window.clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }

    if (!deferred) {
      saveRepositorySessions(sessionsRef.current);
      return;
    }

    sessionPersistTimerRef.current = window.setTimeout(() => {
      sessionPersistTimerRef.current = null;
      saveRepositorySessions(sessionsRef.current);
    }, 120);
  }

  function updateRepositorySession(
    path: string,
    updater: (session: RepositorySession) => RepositorySession,
    deferred = false,
  ) {
    const current = getRepositorySession(path);
    sessionsRef.current = {
      ...sessionsRef.current,
      [path]: updater(current),
    };
    persistSessions(deferred);
  }

  function updateLogFilter<K extends keyof LogFilters>(key: K, value: LogFilters[K]) {
    setLogFilters((current) => ({
      ...current,
      [key]: value,
    }));

    if (repoPath) {
      updateRepositorySession(repoPath, (session) => ({
        ...session,
        logFilters: {
          ...session.logFilters,
          [key]: value,
        },
      }));
    }
  }

  function changeView(view: AppView) {
    setActiveView(view);
    if (!repoPath) return;
    updateRepositorySession(repoPath, (session) => ({
      ...session,
      activeView: view,
    }));
  }

  function selectCommit(commit: GitCommit) {
    setSelectedCommit(commit);
    if (!repoPath) return;
    updateRepositorySession(repoPath, (session) => ({
      ...session,
      selectedCommitHash: commit.hash,
    }));
  }

  function saveLogScroll(scrollTop: number) {
    if (!repoPath) return;
    updateRepositorySession(
      repoPath,
      (session) => ({
        ...session,
        scroll: { ...session.scroll, log: scrollTop },
      }),
      true,
    );
  }

  function saveChangesScroll(scrollTop: number) {
    if (!repoPath) return;
    updateRepositorySession(
      repoPath,
      (session) => ({
        ...session,
        scroll: { ...session.scroll, changes: scrollTop },
      }),
      true,
    );
  }

  function saveBranchesScroll(position: { local: number; remote: number }) {
    if (!repoPath) return;
    updateRepositorySession(
      repoPath,
      (session) => ({
        ...session,
        scroll: {
          ...session.scroll,
          branchesLocal: position.local,
          branchesRemote: position.remote,
        },
      }),
      true,
    );
  }

  function clearVisibleRepositoryContext() {
    setBranch("");
    setCommits([]);
    setSelectedCommit(null);
    setLogBranches({ currentBranch: "", local: [], remote: [] });
    setError("");
  }

  async function loadLogBranches(path: string) {
    try {
      const result = await invoke<GitBranchesResult>("get_git_branches", { repoPath: path });
      if (activeRepositoryRef.current !== path) return;
      setLogBranches(result);
    } catch {
      if (activeRepositoryRef.current !== path) return;
      setLogBranches({ currentBranch: "", local: [], remote: [] });
    }
  }

  async function loadGitLog(
    path: string,
    filters: LogFilters,
    selectedHash: string | null = null,
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

      if (activeRepositoryRef.current !== path) return;

      setBranch(result.currentBranch);
      setCommits(result.commits);
      const restoredCommit = selectedHash
        ? result.commits.find((commit) => commit.hash === selectedHash) ?? null
        : null;
      setSelectedCommit(restoredCommit);

      if (selectedHash && !restoredCommit) {
        updateRepositorySession(path, (session) => ({
          ...session,
          selectedCommitHash: null,
        }));
      }
    } catch (err) {
      if (activeRepositoryRef.current !== path) return;
      setError(String(err));
      setCommits([]);
      setBranch("");
      setSelectedCommit(null);
    } finally {
      if (activeRepositoryRef.current === path) {
        setLoading(false);
      }
    }
  }

  async function activateRepository(path: string) {
    const session = getRepositorySession(path);
    activeRepositoryRef.current = path;
    setRepoPath(path);
    clearVisibleRepositoryContext();
    setActiveView(session.activeView);
    setLogFilters({ ...session.logFilters });
    setAppliedFilters({ ...session.appliedFilters });

    await Promise.all([
      loadGitLog(path, session.appliedFilters, session.selectedCommitHash),
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
      getRepositorySession(selected);
      persistSessions();
      await activateRepository(selected);
    } catch (err) {
      setError(String(err));
    }
  }

  async function switchRepository(path: string) {
    if (path === repoPath) return;
    await activateRepository(path);
  }

  function removeRepository(path: string) {
    const remaining = repositories.filter((item) => item !== path);
    setRepositories(remaining);

    const { [path]: _removed, ...remainingSessions } = sessionsRef.current;
    sessionsRef.current = remainingSessions;
    persistSessions();

    if (path !== repoPath) return;

    const next = remaining[0] ?? "";
    if (next) {
      void activateRepository(next);
      return;
    }

    activeRepositoryRef.current = "";
    clearVisibleRepositoryContext();
    setRepoPath("");
    setActiveView("log");
    setLogFilters({ ...EMPTY_LOG_FILTERS });
    setAppliedFilters({ ...EMPTY_LOG_FILTERS });
  }

  async function refresh() {
    if (!repoPath) return;
    const session = getRepositorySession(repoPath);
    await Promise.all([
      loadGitLog(repoPath, appliedFilters, selectedCommit?.hash ?? session.selectedCommitHash),
      loadLogBranches(repoPath),
    ]);
  }

  async function applyFilters() {
    if (!repoPath) return;
    const nextFilters: LogFilters = {
      message: logFilters.message.trim(),
      branch: logFilters.branch,
      author: logFilters.author.trim(),
      hash: logFilters.hash.trim(),
    };

    setLogFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setSelectedCommit(null);
    if (logListRef.current) logListRef.current.scrollTop = 0;

    updateRepositorySession(repoPath, (session) => ({
      ...session,
      logFilters: { ...nextFilters },
      appliedFilters: { ...nextFilters },
      selectedCommitHash: null,
      scroll: { ...session.scroll, log: 0 },
    }));

    await loadGitLog(repoPath, nextFilters, null);
  }

  async function clearFilters() {
    if (!repoPath) return;
    const cleared = { ...EMPTY_LOG_FILTERS };
    setLogFilters(cleared);
    setAppliedFilters(cleared);
    setSelectedCommit(null);
    if (logListRef.current) logListRef.current.scrollTop = 0;

    updateRepositorySession(repoPath, (session) => ({
      ...session,
      logFilters: { ...cleared },
      appliedFilters: { ...cleared },
      selectedCommitHash: null,
      scroll: { ...session.scroll, log: 0 },
    }));

    await loadGitLog(repoPath, cleared, null);
  }

  async function handleBranchChanged() {
    if (!repoPath) return;
    const nextFilters = { ...appliedFilters, branch: "" };
    const nextDraft = { ...logFilters, branch: "" };
    setLogFilters(nextDraft);
    setAppliedFilters(nextFilters);
    setSelectedCommit(null);

    updateRepositorySession(repoPath, (session) => ({
      ...session,
      logFilters: nextDraft,
      appliedFilters: nextFilters,
      selectedCommitHash: null,
    }));

    await Promise.all([
      loadGitLog(repoPath, nextFilters, null),
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
            <h1>{title}</h1>
            <div className="repo-meta">
              <span className="repo-path">
                {repoPath || t("repositories.emptyDescription")}
              </span>
              {branch && <span className="branch-badge">{branch}</span>}
            </div>
          </div>

          <div className="actions">
            {repoPath && activeView === "log" && (
              <button
                className="secondary-button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {t("common.refresh")}
              </button>
            )}
            <button
              className="primary-button"
              onClick={() => void addRepository()}
              disabled={loading}
            >
              {t("repositories.add")}
            </button>
            <UiPreferences />
          </div>
        </header>

        {error && <div className="error-panel">{error}</div>}

        {!repoPath && !error && (
          <section className="empty-state">
            <h2>{t("repositories.emptyTitle")}</h2>
            <p>{t("repositories.emptyDescription")}</p>
            <button className="primary-button" onClick={() => void addRepository()}>
              {t("repositories.add")}
            </button>
          </section>
        )}

        {repoPath && (
          <>
            <nav className="view-tabs" aria-label="Git">
              <button
                type="button"
                className={activeView === "log" ? "active" : ""}
                onClick={() => changeView("log")}
              >
                {t("nav.log")}
              </button>
              <button
                type="button"
                className={activeView === "changes" ? "active" : ""}
                onClick={() => changeView("changes")}
              >
                {t("nav.changes")}
              </button>
              <button
                type="button"
                className={activeView === "branches" ? "active" : ""}
                onClick={() => changeView("branches")}
              >
                {t("nav.branches")}
              </button>
              <button
                type="button"
                className={activeView === "info" ? "active" : ""}
                onClick={() => changeView("info")}
              >
                {t("nav.settings")}
              </button>
            </nav>

            {activeView === "log" && (
              <section className="workspace">
                <section className="history-panel">
                  <div className="history-header">
                    <div>
                      <strong>{t("log.title")}</strong>
                      <span>{t("log.count", { count: commits.length })}</span>
                      <span>{t("log.lanes", { count: graph.laneCount })}</span>
                      {filtersActive && <span className="filter-active-badge">{t("common.filtered")}</span>}
                    </div>
                    {loading && <span className="loading-text">{t("log.loading")}</span>}
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
                      <span>{t("log.message")}</span>
                      <input
                        type="search"
                        value={logFilters.message}
                        onChange={(event) =>
                          updateLogFilter("message", event.currentTarget.value)
                        }
                        placeholder={t("log.messagePlaceholder")}
                      />
                    </label>

                    <label>
                      <span>{t("log.branch")}</span>
                      <select
                        value={logFilters.branch}
                        onChange={(event) =>
                          updateLogFilter("branch", event.currentTarget.value)
                        }
                      >
                        <option value="">{t("log.allBranches")}</option>
                        <optgroup label={t("common.local")}>
                          {logBranches.local.map((item) => (
                            <option value={item.fullName} key={item.fullName}>
                              {item.current ? `● ${item.name}` : item.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t("common.remote")}>
                          {logBranches.remote.map((item) => (
                            <option value={item.fullName} key={item.fullName}>
                              {item.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

                    <label>
                      <span>{t("log.author")}</span>
                      <input
                        value={logFilters.author}
                        onChange={(event) =>
                          updateLogFilter("author", event.currentTarget.value)
                        }
                        placeholder={t("log.authorPlaceholder")}
                      />
                    </label>

                    <label>
                      <span>{t("log.hash")}</span>
                      <input
                        value={logFilters.hash}
                        onChange={(event) =>
                          updateLogFilter("hash", event.currentTarget.value)
                        }
                        placeholder={t("log.hashPlaceholder")}
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
                        {t("common.apply")}
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => void clearFilters()}
                        disabled={
                          loading || (!hasActiveFilters(logFilters) && !filtersActive)
                        }
                      >
                        {t("common.clear")}
                      </button>
                    </div>
                  </div>

                  {!loading && commits.length === 0 ? (
                    <div className="empty-history">
                      {filtersActive ? t("log.noFilteredResults") : t("log.noCommits")}
                    </div>
                  ) : (
                    <div
                      ref={logListRef}
                      className="commit-list"
                      onScroll={(event) => saveLogScroll(event.currentTarget.scrollTop)}
                    >
                      {graph.rows.map((row) => {
                        const commit = row.commit;
                        const selected = selectedCommit?.hash === commit.hash;

                        return (
                          <button
                            type="button"
                            className={`commit-row${selected ? " selected" : ""}`}
                            key={commit.hash}
                            onClick={() => selectCommit(commit)}
                          >
                            <span className="graph-column">
                              <CommitGraph row={row} laneCount={graph.laneCount} />
                            </span>

                            <span className="commit-content">
                              <span className="commit-title-row">
                                <span className="commit-message">
                                  {commit.message || t("common.noCommitMessage")}
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
                                    {t("log.mergeParents", { count: commit.parents.length })}
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
                initialScrollTop={currentSession.scroll.changes}
                onScrollTopChange={saveChangesScroll}
                onCommitted={() => loadGitLog(repoPath, appliedFilters, null)}
              />
            )}

            {activeView === "branches" && (
              <Branches
                repoPath={repoPath}
                initialScrollPosition={{
                  local: currentSession.scroll.branchesLocal,
                  remote: currentSession.scroll.branchesRemote,
                }}
                onScrollPositionChange={saveBranchesScroll}
                onBranchChanged={handleBranchChanged}
              />
            )}

            {activeView === "info" && <GitInfo repoPath={repoPath} />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
