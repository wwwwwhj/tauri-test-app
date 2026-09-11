import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type GitRefKind = "branch" | "remote" | "tag" | "head" | "ref";

interface GitRefInfo {
  name: string;
  kind: GitRefKind;
  current: boolean;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  refs: GitRefInfo[];
}

interface GitLogResult {
  repositoryPath: string;
  currentBranch: string;
  commits: GitCommit[];
}

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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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

function App() {
  const [repoPath, setRepoPath] = useState("");
  const [branch, setBranch] = useState("");
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (!repoPath) {
      return "Git 提交记录";
    }

    const normalized = repoPath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : "Git 提交记录";
  }, [repoPath]);

  const graph = useMemo(() => buildGraph(commits), [commits]);

  async function loadGitLog(path: string) {
    setLoading(true);
    setError("");

    try {
      const result = await invoke<GitLogResult>("get_git_log", {
        repoPath: path,
        skip: 0,
        limit: 100,
      });

      setRepoPath(result.repositoryPath);
      setBranch(result.currentBranch);
      setCommits(result.commits);
    } catch (err) {
      setError(String(err));
      setCommits([]);
      setBranch("");
    } finally {
      setLoading(false);
    }
  }

  async function selectRepository() {
    setError("");

    try {
      const selected = await invoke<string | null>("pick_git_repository");
      if (!selected) {
        return;
      }

      await loadGitLog(selected);
    } catch (err) {
      setError(String(err));
    }
  }

  async function refresh() {
    if (!repoPath) {
      return;
    }

    await loadGitLog(repoPath);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">TAURI GIT VIEWER</div>
          <h1>{title}</h1>
          <div className="repo-meta">
            <span className="repo-path">
              {repoPath || "请选择一个本地 Git 仓库"}
            </span>
            {branch && <span className="branch-badge">{branch}</span>}
          </div>
        </div>

        <div className="actions">
          {repoPath && (
            <button className="secondary-button" onClick={refresh} disabled={loading}>
              刷新
            </button>
          )}
          <button className="primary-button" onClick={selectRepository} disabled={loading}>
            {repoPath ? "更换仓库" : "选择 Git 仓库"}
          </button>
        </div>
      </header>

      {error && <div className="error-panel">{error}</div>}

      {!repoPath && !error && (
        <section className="empty-state">
          <div className="empty-icon">⌘</div>
          <h2>选择一个本地 Git 仓库</h2>
          <p>程序会读取所有分支的拓扑历史，并绘制 branch / merge Git Graph。</p>
          <button className="primary-button" onClick={selectRepository}>
            选择目录
          </button>
        </section>
      )}

      {repoPath && (
        <section className="history-panel">
          <div className="history-header">
            <div>
              <strong>提交记录</strong>
              <span>{commits.length} 条</span>
              <span>{graph.laneCount} 条活动图轨</span>
            </div>
            {loading && <span className="loading-text">正在读取 Git...</span>}
          </div>

          {!loading && commits.length === 0 ? (
            <div className="empty-history">当前仓库没有可显示的提交记录。</div>
          ) : (
            <div className="commit-list">
              {graph.rows.map((row) => {
                const commit = row.commit;

                return (
                  <article className="commit-row" key={commit.hash}>
                    <div className="graph-column">
                      <CommitGraph row={row} laneCount={graph.laneCount} />
                    </div>

                    <div className="commit-content">
                      <div className="commit-title-row">
                        <div className="commit-message">
                          {commit.message || "(无提交说明)"}
                        </div>
                        {commit.refs.length > 0 && (
                          <div className="commit-refs">
                            {commit.refs.map((gitRef, index) => (
                              <RefBadge
                                key={`${gitRef.kind}-${gitRef.name}-${index}`}
                                gitRef={gitRef}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="commit-details">
                        <code title={commit.hash}>{commit.shortHash}</code>
                        <span>{commit.authorName}</span>
                        <span title={commit.authorEmail}>{commit.authorEmail}</span>
                        <span>{formatDate(commit.date)}</span>
                        {commit.parents.length > 1 && (
                          <span className="merge-badge">
                            merge · {commit.parents.length} parents
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
