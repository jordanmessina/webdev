import { useState, useEffect, useRef, useCallback } from "react";
import type { EnvEntry } from "@/types";
import styles from "./EnvEditor.module.css";

// Fallback for browsers without crypto.randomUUID (requires HTTPS on some mobile browsers)
const generateId = () =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

interface EnvEditorProps {
  sessionId: string;
  filePath: string; // e.g., ".env", ".env.local", "config/.env"
  isOpen: boolean;
  onClose: () => void;
}

export default function EnvEditor({ sessionId, filePath, isOpen, onClose }: EnvEditorProps) {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [rawContent, setRawContent] = useState("");
  const [isRawMode, setIsRawMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newKeyRef = useRef<HTMLInputElement>(null);

  const fetchEnvFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fileParam = encodeURIComponent(filePath);
      const [parsedRes, rawRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/env?file=${fileParam}`),
        fetch(`/api/sessions/${sessionId}/env?file=${fileParam}&raw=true`),
      ]);

      const parsedData = await parsedRes.json();
      const rawData = await rawRes.json();

      // Convert vars object to entries array with UUID IDs
      const varsObj = parsedData.vars || {};
      const entriesArray = Object.entries(varsObj).map(([key, value]) => ({
        id: generateId(),
        key,
        value: value as string,
      }));
      setEntries(entriesArray);
      setRawContent(rawData.content || "");
    } catch (err) {
      setError("Failed to load env file");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, filePath]);

  useEffect(() => {
    if (isOpen && filePath) {
      fetchEnvFile();
    }
  }, [isOpen, filePath, fetchEnvFile]);

  const saveEnvFile = async () => {
    setSaving(true);
    setError(null);
    try {
      const fileParam = encodeURIComponent(filePath);
      // Convert entries back to vars object, filtering out empty keys
      const vars: Record<string, string> = {};
      for (const entry of entries) {
        if (entry.key.trim()) {
          vars[entry.key.trim()] = entry.value;
        }
      }
      const body = isRawMode ? { raw: rawContent } : { vars };
      const res = await fetch(`/api/sessions/${sessionId}/env?file=${fileParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      onClose();
    } catch (err) {
      setError("Failed to save env file");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addVar = () => {
    const newEntry: EnvEntry = { id: generateId(), key: "", value: "" };
    setEntries((prev) => [...prev, newEntry]);
    // Focus the new key input after render
    setTimeout(() => newKeyRef.current?.focus(), 0);
  };

  const updateKey = (id: string, newKey: string) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, key: newKey } : entry))
    );
  };

  const updateValue = (id: string, newValue: string) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, value: newValue } : entry))
    );
  };

  const removeVar = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  if (!isOpen) return null;

  // Get just the filename for display
  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${styles.modal}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{fileName}</span>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${!isRawMode ? styles.modeBtnActive : ""}`}
              onClick={() => setIsRawMode(false)}
            >
              Editor
            </button>
            <button
              className={`${styles.modeBtn} ${isRawMode ? styles.modeBtnActive : ""}`}
              onClick={() => setIsRawMode(true)}
            >
              Raw
            </button>
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : isRawMode ? (
            <textarea
              className={styles.rawEditor}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="KEY=value"
              spellCheck={false}
            />
          ) : (
            <div className={styles.vars}>
              {entries.map((entry, index) => (
                <div key={entry.id} className={styles.varRow}>
                  <input
                    type="text"
                    className={styles.key}
                    value={entry.key}
                    onChange={(e) => updateKey(entry.id, e.target.value)}
                    placeholder="KEY"
                    ref={index === entries.length - 1 ? newKeyRef : null}
                  />
                  <textarea
                    className={styles.value}
                    value={entry.value}
                    onChange={(e) => updateValue(entry.id, e.target.value)}
                    placeholder="value"
                    rows={entry.value.includes("\n") ? Math.min(entry.value.split("\n").length + 1, 6) : 1}
                  />
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeVar(entry.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button className={styles.addBtn} onClick={addVar}>
                + Add Variable
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={saveEnvFile} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
