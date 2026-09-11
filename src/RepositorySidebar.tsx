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

export default function RepositorySidebar({
  repositories,
  activePath,
  loading,
  onAdd,
  onSelect,
  onRemove,
}: RepositorySidebarProps) {
  return (
    <aside className="repository-sidebar">
      <div className="repository-sidebar-header">
        <div>
          <strong>Repositories</strong>
          <span>{repositories.length}</span>
        </div>
        <button
          type="button"
          className="repository-add-button"
          onClick={onAdd}
          disabled={loading}
          title="Add local Git repository"
          aria-label="Add local Git repository"
        >
          +
        </button>
      </div>

      <div className="repository-list">
        {repositories.length === 0 ? (
          <div className="repository-list-empty">
            <span>No repositories</span>
            <button type="button" onClick={onAdd} disabled={loading}>
              Add Repository
            </button>
          </div>
        ) : (
          repositories.map((path) => {
            const active = path === activePath;
            return (
              <div className={`repository-row${active ? " active" : ""}`} key={path}>
                <button
                  type="button"
                  className="repository-select"
                  onClick={() => onSelect(path)}
                  disabled={loading && !active}
                  title={path}
                >
                  <span className="repository-icon">⌘</span>
                  <span className="repository-text">
                    <strong>{repositoryName(path)}</strong>
                    <small>{path}</small>
                  </span>
                </button>

                <button
                  type="button"
                  className="repository-remove"
                  onClick={() => onRemove(path)}
                  disabled={loading}
                  title="Remove from list"
                  aria-label={`Remove ${repositoryName(path)} from list`}
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
