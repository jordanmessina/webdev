import { useState, useEffect, useCallback, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-css";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-toml";
import type { FileNode, FileContent } from "@/types";
import { getWsUrl } from "@/lib/ws";
import styles from "./FileBrowser.module.css";

interface FileBrowserProps {
  sessionId: string;
  onEnvFileClick?: (filePath: string) => void;
  onViewerClose?: () => void;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  onFileClick: (path: string) => void;
  onEnvFileClick?: (path: string) => void;
}

function FileTreeNode({ node, depth, onFileClick, onEnvFileClick }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (node.type === "directory") {
      setExpanded(!expanded);
    } else if (node.name.startsWith(".env") && onEnvFileClick) {
      onEnvFileClick(node.path);
    } else {
      onFileClick(node.path);
    }
  };

  const isEnvFile = node.name.startsWith(".env");

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.treeItem} ${isEnvFile ? styles.treeItemEnv : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        {node.type === "directory" ? (
          <span className={styles.folderIcon}>{expanded ? "📂" : "📁"}</span>
        ) : (
          <span className={styles.fileIcon}>📄</span>
        )}
        <span className={styles.fileName}>{node.name}</span>
        {node.size !== undefined && node.type === "file" && (
          <span className={styles.fileSize}>{formatSize(node.size)}</span>
        )}
      </div>
      {node.type === "directory" && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onEnvFileClick={onEnvFileClick}
            />
          ))}
          {node.children.length === 0 && (
            <div className={styles.treeEmpty} style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}>
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "css",
    html: "markup",
    xml: "markup",
    svg: "markup",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    dockerfile: "docker",
    toml: "toml",
    env: "bash",
  };

  // Handle special filenames
  if (filename.toLowerCase() === "dockerfile") return "docker";
  if (filename.startsWith(".env")) return "bash";

  return langMap[ext] || "plaintext";
}

export default function FileBrowser({ sessionId, onEnvFileClick, onViewerClose }: FileBrowserProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingFile, setViewingFile] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files?mode=tree`);
      if (res.ok) {
        const data = await res.json();
        setTree(data.tree || []);
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setLoading(true);
    fetchTree();
  }, [sessionId, fetchTree]);

  // Subscribe to file changes via WebSocket
  useEffect(() => {
    // Files-only WS to avoid spawning a terminal/tmux client.
    const ws = new WebSocket(getWsUrl(`/ws/files/${sessionId}`));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe-files" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "files-changed") {
          fetchTree();
        }
      } catch {
        // Ignore parse errors from non-JSON messages
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [sessionId, fetchTree]);

  const handleFileClick = async (filePath: string) => {
    setFileLoading(true);
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/files?path=${encodeURIComponent(filePath)}&mode=content`
      );
      if (res.ok) {
        const data = await res.json();
        setViewingFile(data);
      }
    } catch (err) {
      console.error("Failed to load file:", err);
    } finally {
      setFileLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const formData = new FormData();
    formData.append("file", fileList[0]);

    try {
      await fetch(`/api/sessions/${sessionId}/files`, {
        method: "POST",
        body: formData,
      });
      fetchTree();
    } catch (err) {
      console.error("Failed to upload file:", err);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeViewer = () => {
    setViewingFile(null);
    onViewerClose?.();
  };

  // Highlight code when file content changes
  useEffect(() => {
    if (codeRef.current && viewingFile?.content && !viewingFile.binary) {
      Prism.highlightElement(codeRef.current);
    }
  }, [viewingFile]);

  return (
    <div className={styles.fileBrowser}>
      <div className={styles.header}>
        <span className={styles.filePath}>Files</span>
        <div className={styles.actions}>
          <button
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Upload file"
          >
            Upload
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            style={{ display: "none" }}
          />
        </div>
      </div>

      <div className={styles.fileList}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : tree.length === 0 ? (
          <div className={styles.empty}>No files</div>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileClick={handleFileClick}
              onEnvFileClick={onEnvFileClick}
            />
          ))
        )}
      </div>

      {/* File Viewer Modal */}
      {(viewingFile || fileLoading) && (
        <div className={styles.viewerBackdrop} onClick={closeViewer}>
          <div className={styles.viewerModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.viewerHeader}>
              <div className={styles.viewerTitle}>
                {fileLoading ? "Loading..." : viewingFile?.path}
              </div>
              <div className={styles.viewerMeta}>
                {viewingFile && !fileLoading && (
                  <>
                    <span>{formatSize(viewingFile.size)}</span>
                    {viewingFile.truncated && (
                      <span className={styles.truncatedBadge}>Truncated</span>
                    )}
                  </>
                )}
              </div>
              <button className={styles.viewerClose} onClick={closeViewer}>
                ×
              </button>
            </div>
            <div className={styles.viewerContent}>
              {fileLoading ? (
                <div className={styles.viewerLoading}>Loading...</div>
              ) : viewingFile?.binary ? (
                <div className={styles.viewerBinary}>
                  Binary file ({formatSize(viewingFile.size)})
                </div>
              ) : (
                <pre className={`${styles.viewerCode} language-${getLanguage(viewingFile?.path || "")}`}>
                  <code
                    ref={codeRef}
                    className={`language-${getLanguage(viewingFile?.path || "")}`}
                  >
                    {viewingFile?.content}
                  </code>
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
