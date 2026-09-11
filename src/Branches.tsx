import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitBranch, GitBranchesResult } from "./gitTypes";

interface BranchesProps {
  repoPath: string;
  onBranchChanged: () => void | Promise<void>;
}

function shortHash(hash: string) {
  return hash.slice(0, 8);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function BranchRow({
  branch,
  busy,
  onCheckout,
  onDelete,
}: {
  branch: GitBranch;
  busy: boolean;
  onCheckout: (branch: GitBranch) => void;
  onDelete?: (branch: GitBranch) => void;
}) {
  return (
    <div className={`branch-row${branch.current ? " current" : ""}`}>
      <div className="branch-main">
        <div className="branch-name-line">
          {branch.current && <span className="branch-current-dot" />}
          <strong>{branch.name}</strong>
          {branch.upstream && <span className="branch-upstream">→ {branch.upstream}</span>}
        </div>
        <div className="branch-subject">{branch.subject || "(no commit message)"}</div>
        <div className="branch-meta">
          <code>{shortHash(branch.hash)}</code>
          <span>{formatDate(branch.date)}</span>
        </div>
      </div>

      <div className="branch-actions">
        {!branch.current && (
          <button type="button" disabled={busy} onClick={() => onCheckout(branch)}>
            Checkout
          </button>
        )}
        {!branch.remote && !branch.current && onDelete && (
          <button type="button" className="danger-link" disabled={busy} onClick={() => onDelete(branch)}>
            Delete
          </button>
        )}
        {branch.current && <span className="current-label">CURRENT</span>}
      </div>
    </div>
  );
}

export default function Branches({ repoPath, onBranchChanged }: BranchesProps) {
  const [data, setData] = useState<GitBranchesResult>({
    currentBranch: "",
    local: [],
    remote: [],
  });
  const [query, setQuery] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.local;
    return data.local.filter((branch) =>
      `${branch.name} ${branch.subject} ${branch.upstream ?? ""}`.toLowerCase().includes(q),
    );
  }, [data.local, query]);

  const filteredRemote = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.remote;
    return data.remote.filter((branch) =>
      `${branch.name} ${branch.subject}`.toLowerCase().includes(q),
    );
  }, [data.remote, query]);

  async function loadBranches() {
    setLoading(true);
    setError("");
    try {
      const result = await invoke<GitBranchesResult>("get_git_branches", { repoPath });
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setQuery("");
    setNewBranch("");
    setNotice("");
    void loadBranches();
  }, [repoPath]);

  async function checkout(branch: GitBranch) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = branch.remote
        ? await invoke<string>("checkout_remote_git_branch", {
            repoPath,
            remoteBranch: branch.name,
          })
        : await invoke<string>("checkout_git_branch", {
            repoPath,
            branchName: branch.name,
          });
      setNotice(result.trim() || `Checked out ${branch.name}`);
      await loadBranches();
      await onBranchChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createBranch() {
    const branchName = newBranch.trim();
    if (!branchName) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await invoke<string>("create_git_branch", {
        repoPath,
        branchName,
        checkout: true,
      });
      setNewBranch("");
      setNotice(result.trim() || `Created ${branchName}`);
      await loadBranches();
      await onBranchChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteBranch(branch: GitBranch) {
    if (!window.confirm(`Delete local branch?\n\n${branch.name}`)) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await invoke<string>("delete_git_branch", {
        repoPath,
        branchName: branch.name,
        force: false,
      });
      setNotice(result.trim() || `Deleted ${branch.name}`);
      await loadBranches();
      await onBranchChanged();
    } catch (err) {
      setError(`${String(err)}\n\n未合并分支不会被强制删除。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="branches-shell">
      <header className="branches-toolbar">
        <div>
          <strong>Branches</strong>
          <span>{data.currentBranch || "DETACHED HEAD"}</span>
        </div>
        <button type="button" className="secondary-button compact-button" disabled={loading || busy} onClick={() => void loadBranches()}>
          Refresh
        </button>
      </header>

      {error && <div className="detail-error branch-message">{error}</div>}
      {notice && <div className="changes-notice branch-message">{notice}</div>}

      <div className="branches-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter branches"
        />
        <div className="new-branch-form">
          <input
            value={newBranch}
            onChange={(event) => setNewBranch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createBranch();
            }}
            placeholder="New branch name"
          />
          <button type="button" className="primary-button" disabled={busy || !newBranch.trim()} onClick={() => void createBranch()}>
            Create & Checkout
          </button>
        </div>
      </div>

      <div className="branches-columns">
        <section className="branch-section">
          <div className="branch-section-title">
            <strong>Local</strong>
            <span>{filteredLocal.length}</span>
          </div>
          <div className="branch-list">
            {filteredLocal.length === 0 && <div className="detail-empty">No local branches.</div>}
            {filteredLocal.map((branch) => (
              <BranchRow
                key={branch.fullName}
                branch={branch}
                busy={busy}
                onCheckout={(item) => void checkout(item)}
                onDelete={(item) => void deleteBranch(item)}
              />
            ))}
          </div>
        </section>

        <section className="branch-section">
          <div className="branch-section-title">
            <strong>Remote</strong>
            <span>{filteredRemote.length}</span>
          </div>
          <div className="branch-list">
            {filteredRemote.length === 0 && <div className="detail-empty">No remote branches.</div>}
            {filteredRemote.map((branch) => (
              <BranchRow
                key={branch.fullName}
                branch={branch}
                busy={busy}
                onCheckout={(item) => void checkout(item)}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
