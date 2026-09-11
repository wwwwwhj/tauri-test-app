import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  WorkingFileDiff,
  WorkingTreeArea,
  WorkingTreeFile,
  WorkingTreeStatus,
} from "./gitTypes";

interface WorkingTreeProps {
  repoPath: string;
  onCommitted: () => void | Promise<void>;
}

interface FileSelection {
  area: WorkingTreeArea;
  file: WorkingTreeFile;
}

const EMPTY_STATUS: WorkingTreeStatus = {
  staged: [],
  unstaged: [],
  untracked: [],
};

function diffLineClass(line: string) {
  if (line.startsWith("@@")) return "diff-hunk";
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to")
  ) {
    return "diff-meta";
  }
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-delete";
  return "diff-context";
}

function statusClass(status: string) {
  return status === "?" ? "status-u" : `status-${status.toLowerCase()}`;
}

function findFile(
  status: WorkingTreeStatus,
  area: WorkingTreeArea,
  path: string,
): FileSelection | null {
  const file = status[area].find((item) => item.path === path);
  return file ? { area, file } : null;
}

function firstFile(status: WorkingTreeStatus): FileSelection | null {
  if (status.staged[0]) return { area: "staged", file: status.staged[0] };
  if (status.unstaged[0]) return { area: "unstaged", file: status.unstaged[0] };
  if (status.untracked[0]) return { area: "untracked", file: status.untracked[0] };
  return null;
}

function FileGroup({
  title,
  area,
  files,
  selected,
  busy,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  title: string;
  area: WorkingTreeArea;
  files: WorkingTreeFile[];
  selected: FileSelection | null;
  busy: boolean;
  onSelect: (area: WorkingTreeArea, file: WorkingTreeFile) => void;
  onStage: (file: WorkingTreeFile) => void;
  onUnstage: (file: WorkingTreeFile) => void;
  onDiscard: (area: WorkingTreeArea, file: WorkingTreeFile) => void;
}) {
  return (
    <section className="changes-group">
      <div className="changes-group-title">
        <strong>{title}</strong>
        <span>{files.length}</span>
      </div>

      {files.length === 0 ? (
        <div className="changes-group-empty">No files</div>
      ) : (
        <div className="changes-file-list">
          {files.map((file) => {
            const active = selected?.area === area && selected.file.path === file.path;

            return (
              <div className={`changes-file-row${active ? " selected" : ""}`} key={`${area}-${file.oldPath ?? ""}-${file.path}`}>
                <button
                  type="button"
                  className="changes-file-main"
                  onClick={() => onSelect(area, file)}
                  title={file.path}
                >
                  <span className={`file-status ${statusClass(file.status)}`}>
                    {file.status}
                  </span>
                  <span className="file-path">
                    {file.path}
                    {file.oldPath && file.oldPath !== file.path && (
                      <small>← {file.oldPath}</small>
                    )}
                  </span>
                </button>

                <div className="changes-file-actions">
                  {area === "staged" ? (
                    <button type="button" disabled={busy} onClick={() => onUnstage(file)}>
                      Unstage
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => onStage(file)}>
                      Stage
                    </button>
                  )}
                  {area !== "staged" && (
                    <button
                      type="button"
                      className="danger-link"
                      disabled={busy}
                      onClick={() => onDiscard(area, file)}
                    >
                      Discard
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function WorkingTree({ repoPath, onCommitted }: WorkingTreeProps) {
  const [status, setStatus] = useState<WorkingTreeStatus>(EMPTY_STATUS);
  const [selected, setSelected] = useState<FileSelection | null>(null);
  const [diff, setDiff] = useState<WorkingFileDiff | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const diffRequestRef = useRef(0);

  const diffLines = useMemo(() => (diff ? diff.content.split("\n") : []), [diff]);
  const totalChanges = status.staged.length + status.unstaged.length + status.untracked.length;

  async function loadDiff(selection: FileSelection) {
    const request = ++diffRequestRef.current;
    setSelected(selection);
    setLoadingDiff(true);
    setDiff(null);
    setError("");

    try {
      const result = await invoke<WorkingFileDiff>("get_working_file_diff", {
        repoPath,
        filePath: selection.file.path,
        oldPath: selection.file.oldPath,
        area: selection.area,
      });
      if (diffRequestRef.current === request) {
        setDiff(result);
      }
    } catch (err) {
      if (diffRequestRef.current === request) {
        setError(String(err));
      }
    } finally {
      if (diffRequestRef.current === request) {
        setLoadingDiff(false);
      }
    }
  }

  async function loadStatus(preferred?: { area: WorkingTreeArea; path: string }) {
    setLoadingStatus(true);
    setError("");

    try {
      const result = await invoke<WorkingTreeStatus>("get_working_tree", { repoPath });
      setStatus(result);

      const nextSelection = preferred
        ? findFile(result, preferred.area, preferred.path) ?? firstFile(result)
        : selected
          ? findFile(result, selected.area, selected.file.path) ?? firstFile(result)
          : firstFile(result);

      if (nextSelection) {
        await loadDiff(nextSelection);
      } else {
        ++diffRequestRef.current;
        setSelected(null);
        setDiff(null);
        setLoadingDiff(false);
      }
    } catch (err) {
      setError(String(err));
      setStatus(EMPTY_STATUS);
      setSelected(null);
      setDiff(null);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    setStatus(EMPTY_STATUS);
    setSelected(null);
    setDiff(null);
    setNotice("");
    setCommitMessage("");
    void loadStatus();
  }, [repoPath]);

  async function stage(file: WorkingTreeFile) {
    setBusy(true);
    setNotice("");
    try {
      await invoke("stage_working_file", {
        repoPath,
        filePath: file.path,
        oldPath: file.oldPath,
      });
      await loadStatus({ area: "staged", path: file.path });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function unstage(file: WorkingTreeFile) {
    setBusy(true);
    setNotice("");
    try {
      await invoke("unstage_working_file", {
        repoPath,
        filePath: file.path,
        oldPath: file.oldPath,
      });
      await loadStatus({ area: "unstaged", path: file.path });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function discard(area: WorkingTreeArea, file: WorkingTreeFile) {
    const warning = area === "untracked"
      ? `Delete untracked file permanently?\n\n${file.path}`
      : `Discard local changes permanently?\n\n${file.path}`;

    if (!window.confirm(warning)) return;

    setBusy(true);
    setNotice("");
    try {
      await invoke("discard_working_file", {
        repoPath,
        filePath: file.path,
        oldPath: file.oldPath,
        untracked: area === "untracked",
      });
      await loadStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    const message = commitMessage.trim();
    if (!message || status.staged.length === 0) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await invoke<string>("commit_staged_changes", {
        repoPath,
        message,
      });
      setCommitMessage("");
      setNotice(result.trim() || "Commit created.");
      await loadStatus();
      await onCommitted();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="working-tree-shell">
      <aside className="changes-panel">
        <div className="changes-toolbar">
          <div>
            <strong>Local Changes</strong>
            <span>{loadingStatus ? "Reading…" : `${totalChanges} files`}</span>
          </div>
          <button type="button" className="secondary-button compact-button" disabled={busy || loadingStatus} onClick={() => void loadStatus()}>
            Refresh
          </button>
        </div>

        {error && <div className="detail-error">{error}</div>}
        {notice && <div className="changes-notice">{notice}</div>}

        <div className="changes-groups-scroll">
          <FileGroup
            title="Staged Changes"
            area="staged"
            files={status.staged}
            selected={selected}
            busy={busy}
            onSelect={(area, file) => void loadDiff({ area, file })}
            onStage={(file) => void stage(file)}
            onUnstage={(file) => void unstage(file)}
            onDiscard={(area, file) => void discard(area, file)}
          />
          <FileGroup
            title="Unstaged Changes"
            area="unstaged"
            files={status.unstaged}
            selected={selected}
            busy={busy}
            onSelect={(area, file) => void loadDiff({ area, file })}
            onStage={(file) => void stage(file)}
            onUnstage={(file) => void unstage(file)}
            onDiscard={(area, file) => void discard(area, file)}
          />
          <FileGroup
            title="Untracked Files"
            area="untracked"
            files={status.untracked}
            selected={selected}
            busy={busy}
            onSelect={(area, file) => void loadDiff({ area, file })}
            onStage={(file) => void stage(file)}
            onUnstage={(file) => void unstage(file)}
            onDiscard={(area, file) => void discard(area, file)}
          />
        </div>

        <div className="commit-box">
          <textarea
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.currentTarget.value)}
            placeholder="Commit message"
            rows={3}
          />
          <div className="commit-box-footer">
            <span>{status.staged.length} staged</span>
            <button
              type="button"
              className="primary-button"
              disabled={busy || status.staged.length === 0 || commitMessage.trim().length === 0}
              onClick={() => void commit()}
            >
              Commit
            </button>
          </div>
        </div>
      </aside>

      <section className="working-diff-panel">
        <div className="detail-section-title diff-title">
          <strong>
            {selected ? `${selected.area}: ${selected.file.path}` : "Working Tree Diff"}
          </strong>
          {loadingDiff && <span>Reading…</span>}
        </div>

        {!selected ? (
          <div className="detail-empty">Working tree is clean.</div>
        ) : loadingDiff ? (
          <div className="detail-empty">Loading diff…</div>
        ) : diff ? (
          <>
            {diff.truncated && (
              <div className="diff-warning">Diff is large. Showing the first 400,000 characters.</div>
            )}
            {diff.content.length === 0 ? (
              <div className="detail-empty">No text diff available.</div>
            ) : (
              <pre className="diff-viewer">
                {diffLines.map((line, index) => (
                  <span className={`diff-line ${diffLineClass(line)}`} key={index}>
                    <span className="diff-line-number">{index + 1}</span>
                    <span className="diff-line-content">{line || " "}</span>
                  </span>
                ))}
              </pre>
            )}
          </>
        ) : (
          <div className="detail-empty">No diff.</div>
        )}
      </section>
    </section>
  );
}
