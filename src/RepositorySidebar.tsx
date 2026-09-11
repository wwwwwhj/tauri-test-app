import { useI18n } from "./i18n";

interface RepositorySidebarProps {
  repositories: string[];
  activePath: string;
  loading: boolean;
  onAdd: () => void;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
}

function repositoryName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function RepositoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.5" strokeWidth="1.25" />
      <circle cx="4" cy="12.5" r="1.5" strokeWidth="1.25" />
      <circle cx="12" cy="6" r="1.5" strokeWidth="1.25" />
      <path d="M4 5v6M5.5 11.8C9.5 11.3 10.5 9.1 10.5 7.4" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export default function RepositorySidebar({
  repositories,
  activePath,
  loading,
  onAdd,
  onSelect,
  onRemove,
}: RepositorySidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="repository-sidebar">
      <div className="repository-sidebar-header">
        <div>
          <strong>{t("repositories.title")}</strong>
          <span>{repositories.length}</span>
        </div>
        <button
          type="button"
          className="repository-add-button"
          onClick={onAdd}
          disabled={loading}
          title={t("repositories.addLocal")}
          aria-label={t("repositories.addLocal")}
        >
          +
        </button>
      </div>

      <div className="repository-list">
        {repositories.length === 0 ? (
          <div className="repository-list-empty">
            <span>{t("repositories.none")}</span>
            <button type="button" onClick={onAdd} disabled={loading}>
              {t("repositories.add")}
            </button>
          </div>
        ) : (
          repositories.map((path) => {
            const active = path === activePath;
            const name = repositoryName(path);
            return (
              <div className={`repository-row${active ? " active" : ""}`} key={path}>
                <button
                  type="button"
                  className="repository-select"
                  onClick={() => onSelect(path)}
                  disabled={loading && !active}
                  title={path}
                >
                  <span className="repository-icon">
                    <RepositoryIcon />
                  </span>
                  <span className="repository-text">
                    <strong>{name}</strong>
                    <small>{path}</small>
                  </span>
                </button>

                <button
                  type="button"
                  className="repository-remove"
                  onClick={() => onRemove(path)}
                  disabled={loading}
                  title={t("repositories.remove", { name })}
                  aria-label={t("repositories.remove", { name })}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
