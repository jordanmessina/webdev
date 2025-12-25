import { useState, useEffect, useCallback } from "react";
import type { FileEntry } from "@/types";
import styles from "./DirectoryBrowser.module.css";

interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export default function DirectoryBrowser({ onSelect, onCancel }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to browse directory");
      }
      const data = await res.json();
      setCurrentPath(data.path);
      setParentPath(data.parent);
      setEntries(data.entries.filter((e: FileEntry) => e.type === "directory"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory(currentPath || undefined);
  }, [currentPath, fetchDirectory]);

  const navigateTo = (name: string) => {
    const newPath = currentPath ? `${currentPath}/${name}` : `/${name}`;
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    if (parentPath !== null) {
      setCurrentPath(parentPath);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: currentPath,
          name: newFolderName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create directory");
      }

      // Refresh the directory listing
      await fetchDirectory(currentPath);
      setShowNewFolder(false);
      setNewFolderName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create directory");
    } finally {
      setCreating(false);
    }
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      createFolder();
    } else if (e.key === "Escape") {
      setShowNewFolder(false);
      setNewFolderName("");
    }
  };

  return (
    <div className={styles.browser}>
      <div className={styles.header}>
        <span className={styles.currentPath}>{currentPath || "/"}</span>
        <button
          className={styles.btnIcon}
          onClick={() => setShowNewFolder(true)}
          title="New folder"
        >
          +
        </button>
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <div className={styles.entries}>
            {parentPath !== null && (
              <div className={styles.entry} onClick={navigateUp}>
                <span className={styles.entryIcon}>📁</span>
                <span className={styles.entryName}>..</span>
              </div>
            )}
            {showNewFolder && (
              <div className={`${styles.entry} ${styles.entryNewFolder}`}>
                <span className={styles.entryIcon}>📁</span>
                <input
                  type="text"
                  className={styles.newFolderInput}
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleNewFolderKeyDown}
                  onBlur={() => {
                    if (!newFolderName.trim()) {
                      setShowNewFolder(false);
                    }
                  }}
                  autoFocus
                  disabled={creating}
                />
                <button
                  className={`${styles.btnIcon} ${styles.btnIconSmall}`}
                  onClick={createFolder}
                  disabled={creating || !newFolderName.trim()}
                >
                  ✓
                </button>
                <button
                  className={`${styles.btnIcon} ${styles.btnIconSmall}`}
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }}
                  disabled={creating}
                >
                  ✕
                </button>
              </div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.name}
                className={styles.entry}
                onClick={() => navigateTo(entry.name)}
              >
                <span className={styles.entryIcon}>📁</span>
                <span className={styles.entryName}>{entry.name}</span>
              </div>
            ))}
            {entries.length === 0 && parentPath !== null && !showNewFolder && (
              <div className={styles.empty}>No subdirectories</div>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => onSelect(currentPath)}
          disabled={!currentPath}
        >
          Select This Directory
        </button>
      </div>
    </div>
  );
}
