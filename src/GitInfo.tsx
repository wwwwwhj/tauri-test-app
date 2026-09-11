import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GIT_INFO_AUTO_REFRESH_MS,
  isGitInfoCacheStale,
  readGitInfoCache,
  writeGitInfoCache,
  type GitRepositoryInfo,
} from "./gitInfoCache";
import "./GitInfo.css";

interface GitInfoProps {
  repoPath: string;
}

type ConfigScope = "effective" | "local" | "global";

const SCOPE_META: Record<
  ConfigScope,
  { label: string; description: string }
> = {
  effective: {
    label: "Effective",
    description: "最终生效值。Local、Global、System、includes 等作用域合并后，Git 实际读取到的配置。",
  },
  local: {
    label: "Local",
    description: "仅当前仓库的配置层，通常来自 .git/config。它可以覆盖 Global 配置。",
  },
  global: {
    label: "Global",
    description: "当前操作系统用户的 Git 配置层，通常来自 ~/.gitconfig 或用户级 include 文件。",
  },
};

function Value({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <span className={mono ? "git-info-value mono" : "git-info-value"}>{children}</span>;
}

function scopeLabel(scope: string) {
  if (scope === "local") return "Local";
  if (scope === "global") return "Global";
  if (scope === "system") return "System";
  if (scope === "worktree") return "Worktree";
  if (scope === "command") return "Command";
  return scope || "Other";
}

function formatLastUpdated(timestamp: number | null) {
  if (!timestamp) return "Not cached";
  return `Updated ${new Date(timestamp).toLocaleString()}`;
}

export default function GitInfo({ repoPath }: GitInfoProps) {
  const initialCache = readGitInfoCache(repoPath);
  const [info, setInfo] = useState<GitRepositoryInfo | null>(initialCache?.info ?? null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(
    initialCache?.updatedAt ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configScope, setConfigScope] = useState<ConfigScope>("effective");
  const activeRepoRef = useRef(repoPath);
  const requestRef = useRef(0);

  const syncLabel = useMemo(() => {
    if (!info?.upstream) return "No upstream";
    if (info.ahead === 0 && info.behind === 0) return "Up to date";
    return `↑ ${info.ahead}  ↓ ${info.behind}`;
  }, [info]);

  const visibleConfig = info?.config[configScope] ?? [];

  async function fetchInfo(path: string) {
    const request = ++requestRef.current;
    setLoading(true);
    setError("");

    try {
      const result = await invoke<GitRepositoryInfo>("get_git_repository_info", {
        repoPath: path,
      });

      if (requestRef.current !== request || activeRepoRef.current !== path) return;

      const updatedAt = Date.now();
      writeGitInfoCache(path, result, updatedAt);
      setInfo(result);
      setLastUpdatedAt(updatedAt);
    } catch (err) {
      if (requestRef.current !== request || activeRepoRef.current !== path) return;
      // Keep an existing cached snapshot visible when a refresh fails.
      setError(String(err));
    } finally {
      if (requestRef.current === request && activeRepoRef.current === path) {
        setLoading(false);
      }
    }
  }

  function refreshIfStale(path: string) {
    const cached = readGitInfoCache(path);
    if (isGitInfoCacheStale(cached)) {
      void fetchInfo(path);
    }
  }

  useEffect(() => {
    activeRepoRef.current = repoPath;
    ++requestRef.current;
    setConfigScope("effective");
    setError("");

    const cached = readGitInfoCache(repoPath);
    setInfo(cached?.info ?? null);
    setLastUpdatedAt(cached?.updatedAt ?? null);
    setLoading(false);

    if (isGitInfoCacheStale(cached)) {
      void fetchInfo(repoPath);
    }
  }, [repoPath]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshIfStale(repoPath);
      }
    }, GIT_INFO_AUTO_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfStale(repoPath);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [repoPath]);

  if (loading && !info) {
    return <section className="git-info-shell git-info-state">Reading repository settings…</section>;
  }

  if (error && !info) {
    return (
      <section className="git-info-shell git-info-state git-info-error">
        <strong>Unable to read repository settings.</strong>
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={() => void fetchInfo(repoPath)}>
          Retry
        </button>
      </section>
    );
  }

  if (!info) return null;

  const working = info.workingState;

  return (
    <section className="git-info-shell">
      <header className="git-info-toolbar">
        <div>
          <strong>Repository Settings</strong>
          <span>{info.gitVersion}</span>
          <span className="settings-readonly-badge">READ ONLY</span>
        </div>

        <div className="settings-toolbar-actions">
          <div className="settings-cache-meta" title="Repository settings are cached per repository">
            <span className="settings-cache-dot" />
            <span>{formatLastUpdated(lastUpdatedAt)}</span>
            <span>Auto refresh · 10 min</span>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={loading}
            onClick={() => void fetchInfo(repoPath)}
          >
            {loading ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </header>

      {error && (
        <div className="detail-error">
          Refresh failed. Showing the last cached snapshot. {error}
        </div>
      )}

      <div className="git-info-content">
        <section className="git-info-card git-info-overview-card">
          <div className="git-info-card-title">Repository</div>
          <div className="git-info-grid">
            <div className="git-info-row">
              <span>Repository root</span>
              <Value mono>{info.repositoryPath}</Value>
            </div>
            <div className="git-info-row">
              <span>Git directory</span>
              <Value mono>{info.gitDir}</Value>
            </div>
            <div className="git-info-row">
              <span>Current branch</span>
              <Value>{info.detachedHead ? "DETACHED HEAD" : info.currentBranch}</Value>
            </div>
            <div className="git-info-row">
              <span>HEAD</span>
              <Value mono>
                {info.headShortHash && info.headHash
                  ? `${info.headShortHash} · ${info.headHash}`
                  : "No commits yet"}
              </Value>
            </div>
            <div className="git-info-row">
              <span>Upstream</span>
              <Value>{info.upstream ?? "Not configured"}</Value>
            </div>
            <div className="git-info-row">
              <span>Sync status</span>
              <Value>{syncLabel}</Value>
            </div>
          </div>

          <div className="git-state-strip">
            <span className={working.clean ? "clean" : "dirty"}>
              {working.clean ? "Working tree clean" : "Working tree has changes"}
            </span>
            <span>Staged {working.staged}</span>
            <span>Unstaged {working.unstaged}</span>
            <span>Untracked {working.untracked}</span>
            <span className={working.conflicted > 0 ? "conflict" : ""}>
              Conflicts {working.conflicted}
            </span>
          </div>
        </section>

        <section className="git-info-card">
          <div className="git-info-card-title">
            <span>Remotes</span>
            <small>{info.remotes.length}</small>
          </div>

          {info.remotes.length === 0 ? (
            <div className="git-info-empty">No remotes configured.</div>
          ) : (
            <div className="git-remote-list">
              {info.remotes.map((remote) => (
                <div className="git-remote-item" key={remote.name}>
                  <strong>{remote.name}</strong>
                  <div>
                    <span>Fetch</span>
                    <code>{remote.fetchUrl || "—"}</code>
                  </div>
                  <div>
                    <span>Push</span>
                    <code>{remote.pushUrl || "—"}</code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="git-info-card git-config-card">
          <div className="git-info-card-title">
            <span>Git Configuration</span>
            <small>Safe keys only · read only</small>
          </div>

          <div className="config-scope-summary">
            {(["effective", "local", "global"] as const).map((scope) => (
              <button
                type="button"
                key={scope}
                className={configScope === scope ? "active" : ""}
                onClick={() => setConfigScope(scope)}
              >
                <strong>{SCOPE_META[scope].label}</strong>
                <span>{info.config[scope].length} entries</span>
              </button>
            ))}
          </div>

          <div className="config-scope-explainer">
            <strong>{SCOPE_META[configScope].label}</strong>
            <span>{SCOPE_META[configScope].description}</span>
          </div>

          <div className="git-config-note">
            当前页面只读取配置，不执行 git config 写入。HTTP authorization headers、raw credentials 等敏感配置不会被读取。当前快照按仓库缓存，过期后才后台刷新，也可使用 Refresh now 强制读取。
          </div>

          {visibleConfig.length === 0 ? (
            <div className="git-info-empty">
              No matching {SCOPE_META[configScope].label.toLowerCase()} configuration entries.
            </div>
          ) : (
            <div className="git-config-table-wrap">
              <table className="git-config-table repository-settings-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Source scope</th>
                    <th>Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConfig.map((entry, index) => (
                    <tr key={`${entry.key}-${entry.origin ?? ""}-${index}`}>
                      <td><code>{entry.key}</code></td>
                      <td><code>{entry.value}</code></td>
                      <td>
                        <span className={`config-scope-badge scope-${entry.sourceScope}`}>
                          {scopeLabel(entry.sourceScope)}
                        </span>
                      </td>
                      <td><code>{entry.origin ?? "—"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
