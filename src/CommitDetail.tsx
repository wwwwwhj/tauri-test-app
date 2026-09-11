import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitChangedFile, GitCommit, GitFileDiff } from "./gitTypes";

interface CommitDetailProps {
  repoPath: string;
  commit: GitCommit | null;
}

const STATUS_LABELS: Record<string, string> = {
  A: "A",
  M: "M",
  D: "D",
  R: "R",
  C: "C",
  T: "T",
  U: "U",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

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

export default function CommitDetail({ repoPath, commit }: CommitDetailProps) {
  const [files, setFiles] = useState<GitChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitChangedFile | null>(null);
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState("");
  const commitRequestRef = useRef(0);
  const diffRequestRef = useRef(0);

  const diffLines = useMemo(
    () => (fileDiff ? fileDiff.content.split("\n") : []),
    [fileDiff],
  );

  async function loadDiff(
    commitHash: string,
    file: GitChangedFile,
    expectedCommitRequest = commitRequestRef.current,
  ) {
    const diffRequest = ++diffRequestRef.current;
    setSelectedFile(file);
    setFileDiff(null);
    setLoadingDiff(true);
    setError("");

    try {
      const result = await invoke<GitFileDiff>("get_commit_file_diff", {
        repoPath,
        commitHash,
        filePath: file.path,
        oldPath: file.oldPath,
      });

      if (
        commitRequestRef.current !== expectedCommitRequest ||
        diffRequestRef.current !== diffRequest
      ) {
        return;
      }

      setFileDiff(result);
    } catch (err) {
      if (
        commitRequestRef.current === expectedCommitRequest &&
        diffRequestRef.current === diffRequest
      ) {
        setError(String(err));
      }
    } finally {
      if (
        commitRequestRef.current === expectedCommitRequest &&
        diffRequestRef.current === diffRequest
      ) {
        setLoadingDiff(false);
      }
    }
  }

  useEffect(() => {
    const commitRequest = ++commitRequestRef.current;
    ++diffRequestRef.current;
    setFiles([]);
    setSelectedFile(null);
    setFileDiff(null);
    setError("");

    if (!commit || !repoPath) {
      setLoadingFiles(false);
      setLoadingDiff(false);
      return;
    }

    setLoadingFiles(true);

    invoke<GitChangedFile[]>("get_commit_files", {
      repoPath,
      commitHash: commit.hash,
    })
      .then((result) => {
        if (commitRequestRef.current !== commitRequest) return;

        setFiles(result);
        setLoadingFiles(false);

        if (result.length > 0) {
          void loadDiff(commit.hash, result[0], commitRequest);
        }
      })
      .catch((err) => {
        if (commitRequestRef.current !== commitRequest) return;
        setError(String(err));
        setLoadingFiles(false);
      });
  }, [repoPath, commit?.hash]);

  if (!commit) {
    return (
      <aside className="detail-panel detail-placeholder">
        <div className="detail-placeholder-icon">↳</div>
        <strong>选择一个提交</strong>
        <span>点击左侧 commit，查看修改文件和单文件 Diff。</span>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <div className="detail-message">{commit.message || "(无提交说明)"}</div>
        <div className="detail-meta">
          <code title={commit.hash}>{commit.shortHash}</code>
          <span>{commit.authorName}</span>
          <span>{formatDate(commit.date)}</span>
        </div>
      </header>

      {error && <div className="detail-error">{error}</div>}

      <div className="detail-body">
        <section className="changed-files-panel">
          <div className="detail-section-title">
            <strong>Changed Files</strong>
            <span>{loadingFiles ? "读取中…" : files.length}</span>
          </div>

          <div className="changed-files-list">
            {!loadingFiles && files.length === 0 && (
              <div className="detail-empty">这个提交没有可显示的文件差异。</div>
            )}

            {files.map((file) => (
              <button
                type="button"
                key={`${file.status}-${file.oldPath ?? ""}-${file.path}`}
                className={`changed-file${selectedFile?.path === file.path ? " selected" : ""}`}
                onClick={() => void loadDiff(commit.hash, file)}
              >
                <span className={`file-status status-${file.status.toLowerCase()}`}>
                  {STATUS_LABELS[file.status] ?? file.status}
                </span>
                <span className="file-path" title={file.path}>
                  {file.path}
                  {file.oldPath && file.oldPath !== file.path && (
                    <small title={file.oldPath}>← {file.oldPath}</small>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="diff-panel">
          <div className="detail-section-title diff-title">
            <strong>{selectedFile?.path ?? "Diff"}</strong>
            {loadingDiff && <span>读取中…</span>}
          </div>

          {!selectedFile ? (
            <div className="detail-empty">选择文件后显示 Diff。</div>
          ) : loadingDiff ? (
            <div className="detail-empty">正在读取文件差异…</div>
          ) : fileDiff ? (
            <>
              {fileDiff.truncated && (
                <div className="diff-warning">
                  Diff 过大，只显示前 400,000 个字符。
                </div>
              )}
              {diffLines.length === 0 || fileDiff.content.length === 0 ? (
                <div className="detail-empty">没有文本 Diff，文件可能是二进制文件。</div>
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
            <div className="detail-empty">暂无 Diff。</div>
          )}
        </section>
      </div>
    </aside>
  );
}
