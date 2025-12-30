import { useState, useEffect, useCallback, useRef } from "react";
import Terminal from "./components/Terminal";
import type { TerminalHandle } from "./components/Terminal";
import DirectoryBrowser from "./components/DirectoryBrowser";
import FileBrowser from "./components/FileBrowser";
import EnvEditor from "./components/EnvEditor";
import type { Session, Executable } from "./types";
import { getWsUrl } from "./lib/ws";
import { applyTheme, DEFAULT_THEME_ID, THEMES, type ThemeId } from "./lib/themes";
import styles from "./styles/App.module.css";

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [executables, setExecutables] = useState<Executable[]>([]);
  const [appName, setAppName] = useState("WebDev");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [envFilePath, setEnvFilePath] = useState("");
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    const stored = window.localStorage.getItem("webdev.theme") as ThemeId | null;
    return stored && THEMES.some((theme) => theme.id === stored) ? stored : DEFAULT_THEME_ID;
  });

  // New session modal state
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionStep, setNewSessionStep] = useState(1);
  const [selectedExecutable, setSelectedExecutable] = useState<string>("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<string>("");
  const [sessionName, setSessionName] = useState("");
  const [hasExistingConversation, setHasExistingConversation] = useState(false);

  // Session renaming state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  // Drag and drop state
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const terminalRef = useRef<TerminalHandle>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [editingName, setEditingName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchExecutables = useCallback(async () => {
    try {
      const res = await fetch("/api/executables");
      const data = await res.json();
      setExecutables(data.executables || []);
      if (data.executables?.length > 0) {
        setSelectedExecutable(data.executables[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch executables:", err);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setAppName(data.appName || "WebDev");
    } catch (err) {
      console.error("Failed to fetch config:", err);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, []);

  useEffect(() => {
    applyTheme(themeId);
    window.localStorage.setItem("webdev.theme", themeId);
  }, [themeId]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (settingsBtnRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [settingsOpen]);

  useEffect(() => {
    fetchExecutables();
    fetchConfig();

    // Fetch sessions first, then validate URL session
    const initSessions = async () => {
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        const sessionList = data.sessions || [];
        setSessions(sessionList);

        // Only set session from URL if it exists in the fetched list
        const pathSessionId = window.location.pathname.slice(1); // Remove leading /
        if (pathSessionId && sessionList.find((s: Session) => s.id === pathSessionId)) {
          setActiveSessionId(pathSessionId);
        } else if (pathSessionId) {
          // Invalid session in URL - clear it
          window.history.replaceState({}, "", "/");
        }
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      }
    };
    initSessions();

    // Subscribe to session list changes via WebSocket
    const ws = new WebSocket(getWsUrl("/ws/sessions"));

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sessions-changed") {
          fetchSessions();
        }
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [fetchExecutables, fetchConfig, fetchSessions]);

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    window.history.pushState({}, "", `/${sessionId}`);
    setSidebarOpen(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Failed to delete session:", res.status);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        window.history.pushState({}, "", "/");
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const startEditingSession = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditingName(session.name);
  };

  const saveSessionName = async (id: string) => {
    if (!editingName.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, name: editingName.trim() } : s))
        );
      }
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
    setEditingSessionId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      saveSessionName(id);
    } else if (e.key === "Escape") {
      setEditingSessionId(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    setDraggedSessionId(sessionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sessionId);
  };

  const handleDragOver = (e: React.DragEvent, sessionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (sessionId !== draggedSessionId) {
      setDropTargetId(sessionId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetSessionId: string) => {
    e.preventDefault();
    setDropTargetId(null);

    if (!draggedSessionId || draggedSessionId === targetSessionId) {
      setDraggedSessionId(null);
      return;
    }

    // Calculate new order
    const oldIndex = sessions.findIndex((s) => s.id === draggedSessionId);
    const newIndex = sessions.findIndex((s) => s.id === targetSessionId);

    if (oldIndex === -1 || newIndex === -1) {
      setDraggedSessionId(null);
      return;
    }

    // Reorder locally first for immediate feedback
    const newSessions = [...sessions];
    const [removed] = newSessions.splice(oldIndex, 1);
    newSessions.splice(newIndex, 0, removed);
    setSessions(newSessions);

    // Persist to server
    try {
      await fetch("/api/sessions/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newSessions.map((s) => s.id) }),
      });
    } catch (err) {
      console.error("Failed to save session order:", err);
      // Revert on error
      fetchSessions();
    }

    setDraggedSessionId(null);
  };

  const handleDragEnd = () => {
    setDraggedSessionId(null);
    setDropTargetId(null);
  };

  const openNewSessionModal = () => {
    setShowNewSessionModal(true);
    setNewSessionStep(1);
    setSelectedOptions([]);
    setSelectedDirectory("");
    setSessionName("");
    setHasExistingConversation(false);

    // Set default options for selected executable (excluding resume options)
    const exec = executables.find((e) => e.id === selectedExecutable);
    if (exec) {
      const defaults = exec.options
        .filter((o) => o.default && !o.requiresExistingConversation)
        .map((o) => o.id);
      setSelectedOptions(defaults);
    }
  };

  const closeNewSessionModal = () => {
    setShowNewSessionModal(false);
    setNewSessionStep(1);
  };

  const handleExecutableChange = (execId: string) => {
    setSelectedExecutable(execId);
    const exec = executables.find((e) => e.id === execId);
    if (exec) {
      const defaults = exec.options
        .filter((o) => o.default && !o.requiresExistingConversation)
        .map((o) => o.id);
      setSelectedOptions(defaults);
    }
  };

  const toggleOption = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleDirectorySelect = async (path: string) => {
    setSelectedDirectory(path);
    // Default session name to directory basename
    const basename = path.split("/").pop() || path;
    setSessionName(basename);

    // Check if an existing conversation exists for this directory
    try {
      const res = await fetch(
        `/api/conversation-exists?directory=${encodeURIComponent(path)}&executable=${selectedExecutable}`
      );
      const data = await res.json();
      setHasExistingConversation(data.exists);
    } catch {
      setHasExistingConversation(false);
    }

    setNewSessionStep(3);
  };

  const createSession = async () => {
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName || selectedDirectory.split("/").pop(),
          directory: selectedDirectory,
          executable: selectedExecutable,
          options: selectedOptions,
        }),
      });
      const data = await res.json();
      setSessions((prev) => [...prev, data.session]);
      closeNewSessionModal();
      selectSession(data.session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const selectedExec = executables.find((e) => e.id === selectedExecutable);

  return (
    <div className={styles.app}>
      <button
        className={styles.mobileMenuBtn}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {activeSessionId && (
        <button
          className={styles.mobileFilesBtn}
          onClick={() => setFilesPanelOpen(!filesPanelOpen)}
          aria-label="Toggle files"
        >
          {filesPanelOpen ? "✕" : "📁"}
        </button>
      )}

      <div
        className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.sidebarOverlayVisible : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.headerTop}>
            <h1>{appName}</h1>
          </div>
          <button className={styles.newChatBtn} onClick={openNewSessionModal}>
            + New Session
          </button>
        </div>
        <div className={styles.sessionsList}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`${styles.sessionItem} ${activeSessionId === session.id ? styles.sessionItemActive : ""} ${draggedSessionId === session.id ? styles.sessionItemDragging : ""} ${dropTargetId === session.id ? styles.sessionItemDropTarget : ""}`}
              onClick={() => selectSession(session.id)}
              draggable={editingSessionId !== session.id}
              onDragStart={(e) => handleDragStart(e, session.id)}
              onDragOver={(e) => handleDragOver(e, session.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, session.id)}
              onDragEnd={handleDragEnd}
            >
              <div className={styles.sessionInfo}>
                {editingSessionId === session.id ? (
                  <input
                    type="text"
                    className={styles.sessionNameInput}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, session.id)}
                    onBlur={() => saveSessionName(session.id)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <>
                    <div
                      className={styles.sessionName}
                      onDoubleClick={(e) => startEditingSession(session, e)}
                    >
                      <span className={styles.sessionBadge}>
                        {session.executable === "gemini" ? "🔵" : session.executable === "codex" ? "🟢" : "🟠"}
                      </span>
                      {session.name}
                    </div>
                    <div className={styles.sessionDir}>{session.directory}</div>
                  </>
                )}
              </div>
              <button
                className={styles.deleteBtn}
                onClick={(e) => deleteSession(session.id, e)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className={styles.sidebarFooter}>
          <button
            ref={settingsBtnRef}
            className={styles.settingsBtn}
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
          {settingsOpen && (
            <div ref={settingsRef} className={styles.settingsPopover}>
              <div className={styles.settingsTitle}>Settings</div>
              <div className={styles.settingsRow}>
                <span className={styles.settingsLabel}>Theme</span>
                <select
                  className={styles.settingsSelect}
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value as ThemeId)}
                >
                  {THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        {activeSession ? (
          <div className={styles.workspace}>
            <Terminal ref={terminalRef} sessionId={activeSession.id} themeId={themeId} />
            <div className={`${styles.filesPanel} ${filesPanelOpen ? styles.filesPanelOpen : ""}`}>
              <FileBrowser
                sessionId={activeSession.id}
                onEnvFileClick={(filePath) => {
                  setEnvFilePath(filePath);
                  setShowEnvEditor(true);
                }}
                onViewerClose={() => terminalRef.current?.focus()}
              />
            </div>
          </div>
        ) : (
          <div className={styles.welcome}>
            <h2>Welcome to {appName}</h2>
            <p>Select a session or create a new one to get started.</p>
          </div>
        )}
      </main>

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="modal-overlay" onClick={closeNewSessionModal}>
          <div className={`modal ${styles.newSessionModal}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className={styles.modalTitle}>New Session</span>
              <button className={styles.modalClose} onClick={closeNewSessionModal}>×</button>
            </div>

            {/* Step Indicators */}
            <div className={styles.stepIndicators}>
              <div className={`${styles.step} ${newSessionStep >= 1 ? styles.stepActive : ""} ${newSessionStep > 1 ? styles.stepCompleted : ""}`}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepLabel}>CLI</div>
              </div>
              <div className={styles.stepLine} />
              <div className={`${styles.step} ${newSessionStep >= 2 ? styles.stepActive : ""} ${newSessionStep > 2 ? styles.stepCompleted : ""}`}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepLabel}>Directory</div>
              </div>
              <div className={styles.stepLine} />
              <div className={`${styles.step} ${newSessionStep >= 3 ? styles.stepActive : ""}`}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepLabel}>Confirm</div>
              </div>
            </div>

            <div className="modal-body">
              {newSessionStep === 1 && (
                <div className={styles.stepContent}>
                  <div className={styles.cliSelector}>
                    {executables.map((exec) => (
                      <div
                        key={exec.id}
                        className={`${styles.cliOption} ${selectedExecutable === exec.id ? styles.cliOptionSelected : ""}`}
                        onClick={() => handleExecutableChange(exec.id)}
                      >
                        <span className={styles.cliIcon}>
                          {exec.id === "claude" ? "🟠" : exec.id === "codex" ? "🟢" : "🔵"}
                        </span>
                        <span className={styles.cliName}>{exec.name}</span>
                      </div>
                    ))}
                  </div>
                  {selectedExec && selectedExec.options.filter(o => !o.requiresExistingConversation).length > 0 && (
                    <div className={styles.optionsSection}>
                      <div className={styles.optionsTitle}>Options</div>
                      {selectedExec.options
                        .filter((option) => !option.requiresExistingConversation)
                        .map((option) => (
                          <label key={option.id} className="checkbox-group">
                            <input
                              type="checkbox"
                              checked={selectedOptions.includes(option.id)}
                              onChange={() => toggleOption(option.id)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {newSessionStep === 2 && (
                <DirectoryBrowser
                  onSelect={handleDirectorySelect}
                  onCancel={closeNewSessionModal}
                />
              )}
              {newSessionStep === 3 && (
                <div className={styles.stepContent}>
                  <div className={styles.formGroup}>
                    <label>Session Name</label>
                    <input
                      type="text"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      placeholder="Enter session name..."
                      autoFocus
                    />
                  </div>
                  <div className={styles.summaryCard}>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>CLI</span>
                      <span className={styles.summaryValue}>
                        {selectedExec?.id === "claude" ? "🟠" : selectedExec?.id === "codex" ? "🟢" : "🔵"} {selectedExec?.name}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Directory</span>
                      <span className={`${styles.summaryValue} ${styles.summaryPath}`}>{selectedDirectory}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span className={styles.summaryLabel}>Command</span>
                      <code className={styles.summaryCommand}>
                        {selectedExec
                          ? [
                              selectedExec.command,
                              ...selectedExec.options
                                .filter((o) => selectedOptions.includes(o.id))
                                .map((o) => o.flag),
                            ].join(" ")
                          : ""}
                      </code>
                    </div>
                  </div>
                  {hasExistingConversation && selectedExec?.options.find(o => o.requiresExistingConversation) && (
                    <div className={styles.resumeOption}>
                      {selectedExec.options
                        .filter((option) => option.requiresExistingConversation)
                        .map((option) => (
                          <label key={option.id} className="checkbox-group">
                            <input
                              type="checkbox"
                              checked={selectedOptions.includes(option.id)}
                              onChange={() => toggleOption(option.id)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {newSessionStep === 1 && (
                <>
                  <button className="btn-secondary" onClick={closeNewSessionModal}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={() => setNewSessionStep(2)}>
                    Choose Directory
                  </button>
                </>
              )}
              {newSessionStep === 3 && (
                <>
                  <button className="btn-secondary" onClick={() => setNewSessionStep(2)}>
                    Back
                  </button>
                  <button className="btn-primary" onClick={createSession}>
                    Create Session
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Env Editor */}
      {activeSession && envFilePath && (
        <EnvEditor
          sessionId={activeSession.id}
          filePath={envFilePath}
          isOpen={showEnvEditor}
          onClose={() => {
            setShowEnvEditor(false);
            setEnvFilePath("");
          }}
        />
      )}
    </div>
  );
}
