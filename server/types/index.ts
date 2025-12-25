// Shared types for WebDev application
// Single source of truth - do not duplicate these elsewhere

// ============================================
// Session Types
// ============================================

export interface Session {
  id: string;
  name: string;
  directory: string;
  executable: string;
  options: string[];
  createdAt: string;
}

export interface SessionsData {
  sessions: Session[];
}

// ============================================
// File System Types
// ============================================

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  binary: boolean;
  truncated: boolean;
  size: number;
}

// ============================================
// CLI Types
// ============================================

export interface CLIOption {
  id: string;
  label: string;
  flag: string;
  default: boolean;
  requiresExistingConversation?: boolean;
}

export interface CLI {
  id: string;
  name: string;
  command: string;
  getOptions(): Promise<CLIOption[]>;
  buildCommand(selectedOptions: string[]): string;
  buildResumeCommand(selectedOptions: string[], directory: string): string;
  shouldResume(directory: string): boolean;
}

// Frontend-friendly version of CLI for API responses
export interface Executable {
  id: string;
  name: string;
  command: string;
  options: ExecutableOption[];
}

export interface ExecutableOption {
  id: string;
  label: string;
  flag: string;
  default: boolean;
  requiresExistingConversation?: boolean;
}

// ============================================
// Environment Editor Types
// ============================================

export interface EnvEntry {
  id: string;
  key: string;
  value: string;
}

// ============================================
// WebSocket Message Types
// ============================================

export type WSClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "subscribe-files" };

export type WSServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string }
  | { type: "files-changed" }
  | { type: "sessions-changed" };
