import { useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./GitInfo.css";

interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

interface GitConfigEntry {
  key: string;
  value: string;
  origin: string | null;
}

interface GitWorkingState {
  clean: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

interface GitRepositoryInfo {
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
  config: GitConfigEntry[];
}

interface GitInfoProps {
  repoPath: string;
}

function Value({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <span className={mono ? "git-info-value mono" : "git-info-value"}>{children}</span>;
}

export default function GitInfo({ repoPath }: GitInfoProps) {
  const [info, setInfo] = useState<GitRepositoryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const syncLabel = useMemo(() => {
    if (!info?.upstream) return "No upstream";
    if (info.ahead === 0 && info.behind === 0) return "Up to date";
    return `↑ ${info.ahead}  ↓ ${info.behind}`;
  }, [info]);

  async function loadInfo() {
    setLoading(true);
    setError("");

    try {
      const result = await invoke<GitRepositoryInfo>("get_git_repository_info", {
        repoPath,
      });
      setInfo(result);
    } catch (err) {
      setError(String(err));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInfo();
  }, [repoPath]);

  if (loading && !info) {
    return <section className="git-info-shell git-info-state">Reading Git information…</section>;
  }

  if (error && !info) {
    return (
      <section className="git-info-shell git-info-state git-info-error">
        <strong>Unable to read Git information.</strong>
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={() => void loadInfo()}>
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
          <strong>Git Information</strong>
          <span>{info.gitVersion}</span>
        </div>
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={loading}
          onClick={() => void loadInfo()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && <div className="detail-error">{error}</div>}

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
            <span>Effective Git Config</span>
            <small>{info.config.length} safe entries</small>
          </div>

          <div className="git-config-note">
            Sensitive keys such as HTTP authorization headers and raw credential values are not read.
          </div>

          {info.config.length === 0 ? (
            <div className="git-info-empty">No matching configuration entries.</div>
          ) : (
            <div className="git-config-table-wrap">
              <table className="git-config-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Effective value</th>
                    <th>Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {info.config.map((entry) => (
                    <tr key={entry.key}>
                      <td><code>{entry.key}</code></td>
                      <td><code>{entry.value}</code></td>
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
