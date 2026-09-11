import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}

interface GitLogResult {
  repositoryPath: string;
  currentBranch: string;
  commits: GitCommit[];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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
    return normalized.split("/").filter(Boolean).at(-1) ?? "Git 提交记录";
  }, [repoPath]);

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
          <p>程序会调用你系统中的 Git，读取当前分支和最近的提交记录。</p>
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
            </div>
            {loading && <span className="loading-text">正在读取 Git...</span>}
          </div>

          {!loading && commits.length === 0 ? (
            <div className="empty-history">当前仓库没有可显示的提交记录。</div>
          ) : (
            <div className="commit-list">
              {commits.map((commit, index) => (
                <article className="commit-row" key={commit.hash}>
                  <div className="graph-column" aria-hidden="true">
                    <span className="commit-dot" />
                    {index !== commits.length - 1 && <span className="commit-line" />}
                  </div>

                  <div className="commit-content">
                    <div className="commit-message">{commit.message || "(无提交说明)"}</div>
                    <div className="commit-details">
                      <code title={commit.hash}>{commit.shortHash}</code>
                      <span>{commit.authorName}</span>
                      <span title={commit.authorEmail}>{commit.authorEmail}</span>
                      <span>{formatDate(commit.date)}</span>
                      {commit.parents.length > 1 && (
                        <span className="merge-badge">merge</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
