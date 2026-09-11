import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "./i18n";
import type { GitBranch, GitBranchesResult } from "./gitTypes";

interface BranchesScrollPosition {
  local: number;
  remote: number;
}

interface BranchesProps {
  repoPath: string;
  onBranchChanged: () => void | Promise<void>;
  initialScrollPosition?: BranchesScrollPosition;
  onScrollPositionChange?: (position: BranchesScrollPosition) => void;
}

function shortHash(hash: string) {
  return hash.slice(0, 8);
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
  const { t, formatDate } = useI18n();

  return (
    <div className={`branch-row${branch.current ? " current" : ""}`}>
      <div className="branch-main">
        <div className="branch-name-line">
          {branch.current && <span className="branch-current-dot" />}
          <strong>{branch.name}</strong>
          {branch.upstream && <span className="branch-upstream">→ {branch.upstream}</span>}
        </div>
        <div className="branch-subject">{branch.subject || t("branches.noMessage")}</div>
        <div className="branch-meta">
          <code>{shortHash(branch.hash)}</code>
          <span>{formatDate(branch.date)}</span>
        </div>
      </div>

      <div className="branch-actions">
        {!branch.current && (
          <button type="button" disabled={busy} onClick={() => onCheckout(branch)}>
            {t("branches.checkout")}
          </button>
        )}
        {!branch.remote && !branch.current && onDelete && (
          <button
            type="button"
            className="danger-link"
            disabled={busy}
            onClick={() => onDelete(branch)}
          >
            {t("branches.delete")}
          </button>
        )}
        {branch.current && <span className="current-label">{t("branches.current")}</span>}
      </div>
    </div>
  );
}

export default function Branches({
  repoPath,
  onBranchChanged,
  initialScrollPosition = { local: 0, remote: 0 },
  onScrollPositionChange,
}: BranchesProps) {
  const { t } = useI18n();
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
  const localListRef = useRef<HTMLDivElement>(null);
  const remoteListRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => {
      if (localListRef.current) localListRef.current.scrollTop = initialScrollPosition.local;
      if (remoteListRef.current) remoteListRef.current.scrollTop = initialScrollPosition.remote;
    });
    return () => cancelAnimationFrame(frame);
  }, [repoPath, loading, initialScrollPosition.local, initialScrollPosition.remote]);

  function reportScroll(local?: number, remote?: number) {
    onScrollPositionChange?.({
      local: local ?? localListRef.current?.scrollTop ?? 0,
      remote: remote ?? remoteListRef.current?.scrollTop ?? 0,
    });
  }

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
      setNotice(result.trim() || t("branches.checkedOut", { name: branch.name }));
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
      setNotice(result.trim() || t("branches.created", { name: branchName }));
      await loadBranches();
      await onBranchChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteBranch(branch: GitBranch) {
    if (!window.confirm(t("branches.deleteConfirm", { name: branch.name }))) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await invoke<string>("delete_git_branch", {
        repoPath,
        branchName: branch.name,
        force: false,
      });
      setNotice(result.trim() || t("branches.deleted", { name: branch.name }));
      await loadBranches();
      await onBranchChanged();
    } catch (err) {
      setError(`${String(err)}\n\n${t("branches.unmergedHint")}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="branches-shell">
      <header className="branches-toolbar">
        <div>
          <strong>{t("branches.title")}</strong>
          <span>{data.currentBranch || "DETACHED HEAD"}</span>
        </div>
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={loading || busy}
          onClick={() => void loadBranches()}
        >
          {t("common.refresh")}
        </button>
      </header>

      {error && <div className="detail-error branch-message">{error}</div>}
      {notice && <div className="changes-notice branch-message">{notice}</div>}

      <div className="branches-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t("branches.filter")}
        />
        <div className="new-branch-form">
          <input
            value={newBranch}
            onChange={(event) => setNewBranch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createBranch();
            }}
            placeholder={t("branches.newName")}
          />
          <button
            type="button"
            className="primary-button"
            disabled={busy || !newBranch.trim()}
            onClick={() => void createBranch()}
          >
            {t("branches.createCheckout")}
          </button>
        </div>
      </div>

      <div className="branches-columns">
        <section className="branch-section">
          <div className="branch-section-title">
            <strong>{t("common.local")}</strong>
            <span>{filteredLocal.length}</span>
          </div>
          <div
            ref={localListRef}
            className="branch-list"
            onScroll={(event) => reportScroll(event.currentTarget.scrollTop, undefined)}
          >
            {filteredLocal.length === 0 && <div className="detail-empty">{t("branches.noLocal")}</div>}
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
            <strong>{t("common.remote")}</strong>
            <span>{filteredRemote.length}</span>
          </div>
          <div
            ref={remoteListRef}
            className="branch-list"
            onScroll={(event) => reportScroll(undefined, event.currentTarget.scrollTop)}
          >
            {filteredRemote.length === 0 && <div className="detail-empty">{t("branches.noRemote")}</div>}
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
