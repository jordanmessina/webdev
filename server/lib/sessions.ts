import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config";
import type { Session, SessionsData } from "../types";

// Re-export for convenience
export type { Session };

// In-memory cache for sync access
let sessionsCache: Session[] = [];

export function getSession(id: string): Session | undefined {
  return sessionsCache.find((s) => s.id === id);
}

async function ensureSessionsDir(): Promise<void> {
  const dir = path.dirname(config.sessionsPath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function loadSessions(): Promise<Session[]> {
  await ensureSessionsDir();
  try {
    await fs.access(config.sessionsPath);
    const data = await fs.readFile(config.sessionsPath, "utf-8");
    const parsed: SessionsData = JSON.parse(data);
    sessionsCache = parsed.sessions || [];
    return sessionsCache;
  } catch (err) {
    // File doesn't exist or parse error
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      sessionsCache = [];
      return [];
    }
    console.error("Error loading sessions:", err);
    return sessionsCache;
  }
}

async function saveSessions(sessions: Session[]): Promise<void> {
  await ensureSessionsDir();
  sessionsCache = sessions;
  const data: SessionsData = { sessions };
  await fs.writeFile(config.sessionsPath, JSON.stringify(data, null, 2));
}

export async function getSessionAsync(id: string): Promise<Session | undefined> {
  const sessions = await loadSessions();
  return sessions.find((s) => s.id === id);
}

export async function createSession(
  name: string,
  directory: string,
  executable: string,
  options: string[]
): Promise<Session> {
  const sessions = await loadSessions();
  const session: Session = {
    id: uuidv4(),
    name,
    directory,
    executable,
    options,
    createdAt: new Date().toISOString(),
    active: false,
  };
  sessions.push(session);
  await saveSessions(sessions);
  return session;
}

export async function deleteSession(id: string): Promise<boolean> {
  const sessions = await loadSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    return false;
  }
  sessions.splice(index, 1);
  await saveSessions(sessions);
  return true;
}

export async function updateSession(
  id: string,
  updates: Partial<Pick<Session, "name" | "active">>
): Promise<Session | null> {
  const sessions = await loadSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    return null;
  }
  sessions[index] = { ...sessions[index], ...updates };
  await saveSessions(sessions);
  return sessions[index];
}

export async function reorderSessions(orderedIds: string[]): Promise<Session[]> {
  const sessions = await loadSessions();

  // Create a map for quick lookup
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  // Build reordered array based on provided IDs
  const reordered: Session[] = [];
  for (const id of orderedIds) {
    const session = sessionMap.get(id);
    if (session) {
      reordered.push(session);
      sessionMap.delete(id);
    }
  }

  // Append any sessions not in the ordered list (shouldn't happen, but safety)
  for (const session of sessionMap.values()) {
    reordered.push(session);
  }

  await saveSessions(reordered);
  return reordered;
}
