import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GIT_INFO_AUTO_REFRESH_MS,
  isGitInfoCacheStale,
  readGitInfoCache,
  writeGitInfoCache,
  type GitRepositoryInfo,
} from "./gitInfoCache";
import { useI18n, type TranslationKey } from "./i18n";
import "./GitInfo.css";

interface GitInfoProps {
  repoPath: string;
}

type ConfigScope = "effective" | "local" | "global";

const SCOPE_KEYS: Record<ConfigScope, { label: TranslationKey; description: TranslationKey }> = {
  effective: {
    label: "settings.effective",
    description: "settings.effectiveDescription",
  },
  local: {
    label: "settings.local",
    description: "settings.localDescription",
  },
  global: {
    label: "settings.global",
    description: "settings.globalDescription",
  },
};

function Value({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <span className={mono ? "git-info-value mono" : "git-info-value"}>{children}</span>;
}

export default function GitInfo({ repoPath }: GitInfoProps) {
  const { t, formatDate } = useI18n();
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
    if (!info?.upstream) return t("settings.noUpstream");
    if (info.ahead === 0 && info.behind === 0) return t("settings.upToDate");
    return `↑ ${info.ahead}  ↓ ${info.behind}`;
  }, [info, t]);

  const visibleConfig = info?.config[configScope] ?? [];
  const activeScopeLabel = t(SCOPE_KEYS[configScope].label);
  const activeScopeDescription = t(SCOPE_KEYS[configScope].description);

  function scopeLabel(scope: string) {
    if (scope === "local") return t("settings.local");
    if (scope === "global") return t("settings.global");
    if (scope === "system") return t("settings.scopeSystem");
    if (scope === "worktree") return t("settings.scopeWorktree");
    if (scope === "command") return t("settings.scopeCommand");
    return scope || t("settings.scopeOther");
  }

  function formatLastUpdated(timestamp: number | null) {
    if (!timestamp) return t("settings.notCached");
    return t("settings.updated", { time: formatDate(timestamp) });
  }

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
      if (document.visibilityState === "visible") refreshIfStale(repoPath);
    }, GIT_INFO_AUTO_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale(repoPath);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [repoPath]);

  if (loading && !info) {
    return <section className="git-info-shell git-info-state">{t("common.reading")}</section>;
  }

  if (error && !info) {
    return (
      <section className="git-info-shell git-info-state git-info-error">
        <strong>{t("settings.unable")}</strong>
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={() => void fetchInfo(repoPath)}>
          {t("common.retry")}
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
          <strong>{t("settings.title")}</strong>
          <span>{info.gitVersion}</span>
          <span className="settings-readonly-badge">{t("settings.readOnly")}</span>
        </div>

        <div className="settings-toolbar-actions">
          <div className="settings-cache-meta" title={t("settings.cacheTitle")}>
            <span className="settings-cache-dot" />
            <span>{formatLastUpdated(lastUpdatedAt)}</span>
            <span>{t("settings.autoRefresh")}</span>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={loading}
            onClick={() => void fetchInfo(repoPath)}
          >
            {loading ? t("common.refreshing") : t("settings.refreshNow")}
          </button>
        </div>
      </header>

      {error && (
        <div className="detail-error">
          {t("settings.refreshFailed")} {error}
        </div>
      )}

      <div className="git-info-content">
        <section className="git-info-card git-info-overview-card">
          <div className="git-info-card-title">{t("settings.repository")}</div>
          <div className="git-info-grid">
            <div className="git-info-row">
              <span>{t("settings.repositoryRoot")}</span>
              <Value mono>{info.repositoryPath}</Value>
            </div>
            <div className="git-info-row">
              <span>{t("settings.gitDirectory")}</span>
              <Value mono>{info.gitDir}</Value>
            </div>
            <div className="git-info-row">
              <span>{t("settings.currentBranch")}</span>
              <Value>{info.detachedHead ? "DETACHED HEAD" : info.currentBranch}</Value>
            </div>
            <div className="git-info-row">
              <span>HEAD</span>
              <Value mono>
                {info.headShortHash && info.headHash
                  ? `${info.headShortHash} · ${info.headHash}`
                  : t("settings.noCommits")}
              </Value>
            </div>
            <div className="git-info-row">
              <span>{t("settings.upstream")}</span>
              <Value>{info.upstream ?? t("settings.notConfigured")}</Value>
            </div>
            <div className="git-info-row">
              <span>{t("settings.syncStatus")}</span>
              <Value>{syncLabel}</Value>
            </div>
          </div>

          <div className="git-state-strip">
            <span className={working.clean ? "clean" : "dirty"}>
              {working.clean ? t("settings.workingClean") : t("settings.workingDirty")}
            </span>
            <span>{t("settings.staged", { count: working.staged })}</span>
            <span>{t("settings.unstaged", { count: working.unstaged })}</span>
            <span>{t("settings.untracked", { count: working.untracked })}</span>
            <span className={working.conflicted > 0 ? "conflict" : ""}>
              {t("settings.conflicts", { count: working.conflicted })}
            </span>
          </div>
        </section>

        <section className="git-info-card">
          <div className="git-info-card-title">
            <span>{t("settings.remotes")}</span>
            <small>{info.remotes.length}</small>
          </div>

          {info.remotes.length === 0 ? (
            <div className="git-info-empty">{t("settings.noRemotes")}</div>
          ) : (
            <div className="git-remote-list">
              {info.remotes.map((remote) => (
                <div className="git-remote-item" key={remote.name}>
                  <strong>{remote.name}</strong>
                  <div>
                    <span>{t("settings.fetch")}</span>
                    <code>{remote.fetchUrl || "—"}</code>
                  </div>
                  <div>
                    <span>{t("settings.push")}</span>
                    <code>{remote.pushUrl || "—"}</code>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="git-info-card git-config-card">
          <div className="git-info-card-title">
            <span>{t("settings.gitConfig")}</span>
            <small>{t("settings.safeReadOnly")}</small>
          </div>

          <div className="config-scope-summary">
            {(["effective", "local", "global"] as const).map((scope) => (
              <button
                type="button"
                key={scope}
                className={configScope === scope ? "active" : ""}
                onClick={() => setConfigScope(scope)}
              >
                <strong>{t(SCOPE_KEYS[scope].label)}</strong>
                <span>{t("common.entries", { count: info.config[scope].length })}</span>
              </button>
            ))}
          </div>

          <div className="config-scope-explainer">
            <strong>{activeScopeLabel}</strong>
            <span>{activeScopeDescription}</span>
          </div>

          <div className="git-config-note">{t("settings.configNote")}</div>

          {visibleConfig.length === 0 ? (
            <div className="git-info-empty">
              {t("settings.noConfig", { scope: activeScopeLabel })}
            </div>
          ) : (
            <div className="git-config-table-wrap">
              <table className="git-config-table repository-settings-table">
                <thead>
                  <tr>
                    <th>{t("settings.key")}</th>
                    <th>{t("settings.value")}</th>
                    <th>{t("settings.sourceScope")}</th>
                    <th>{t("settings.origin")}</th>
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
