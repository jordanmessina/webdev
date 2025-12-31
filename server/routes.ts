import { Router, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { execSync } from "child_process";
import { promisify } from "util";
import multer from "multer";

import { config } from "./lib/config";
import { broadcastSessionsChanged } from "./index";
import { loadSessions, createSession, getSessionAsync, deleteSession, updateSession, reorderSessions } from "./lib/sessions";
import { getCli, clis } from "./lib/cli";
import type { CLIOption } from "./types";
import {
  listDirectoryWithHidden,
  buildFileTree,
  readFileContent,
  readEnvFile,
  readEnvFileRaw,
  writeEnvFile,
  writeEnvFileRaw,
  envFileExists,
} from "./lib/files";
import {
  validateBody,
  sendValidationError,
  createSessionSchema,
  updateSessionSchema,
  envVarsSchema,
  createFolderSchema,
} from "./lib/validators";

const execAsync = promisify(exec);
const router = Router();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// Config Routes
// ============================================

router.get("/api/config", (_req: Request, res: Response) => {
  res.json({ appName: config.appName });
});

// ============================================
// Executables Routes
// ============================================

router.get("/api/executables", async (_req: Request, res: Response) => {
  const executables = await Promise.all(
    clis.map(async (cli) => {
      const options = await cli.getOptions();
      return {
        id: cli.id,
        name: cli.name,
        command: cli.command,
        options: options.map((opt: CLIOption) => ({
          ...opt,
          requiresExistingConversation: opt.id === "resume",
        })),
      };
    })
  );
  res.json({ executables });
});

// ============================================
// Conversation Exists Route
// ============================================

router.get("/api/conversation-exists", (req: Request, res: Response) => {
  const directory = req.query.directory as string;
  const executable = req.query.executable as string;

  if (!directory || !executable) {
    return res.status(400).json({ error: "Missing directory or executable parameter" });
  }

  const cli = getCli(executable);
  const exists = cli ? cli.shouldResume(directory) : false;
  res.json({ exists });
});

// ============================================
// Sessions Routes
// ============================================

router.get("/api/sessions", async (_req: Request, res: Response) => {
  const sessions = await loadSessions();
  res.json({ sessions });
});

router.post("/api/sessions", async (req: Request, res: Response) => {
  const validation = validateBody(req.body, createSessionSchema);
  if (!validation.success) {
    return sendValidationError(res, validation.error);
  }

  const { name, directory, executable, options } = validation.data;

  const cli = getCli(executable);
  if (!cli) {
    return res.status(400).json({ error: `Unknown CLI: ${executable}` });
  }

  try {
    const session = await createSession(name, directory, executable, options);
    broadcastSessionsChanged();
    res.status(201).json({ session });
  } catch (err) {
    console.error("Error creating session:", err);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/api/sessions/:id", async (req: Request, res: Response) => {
  const session = await getSessionAsync(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ session });
});

router.patch("/api/sessions/:id", async (req: Request, res: Response) => {
  const validation = validateBody(req.body, updateSessionSchema);
  if (!validation.success) {
    return sendValidationError(res, validation.error);
  }

  const { name } = validation.data;
  if (!name) {
    return res.status(400).json({ error: "No updates provided" });
  }

  const session = await updateSession(req.params.id, { name });
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  broadcastSessionsChanged();
  res.json({ session });
});

router.patch("/api/sessions/:id/active", async (req: Request, res: Response) => {
  const { active } = req.body;

  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be a boolean" });
  }

  const session = await updateSession(req.params.id, { active });
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  broadcastSessionsChanged();
  res.json({ session });
});

router.put("/api/sessions/order", async (req: Request, res: Response) => {
  const { order } = req.body;

  if (!Array.isArray(order) || !order.every((id) => typeof id === "string")) {
    return res.status(400).json({ error: "Invalid order array" });
  }

  try {
    const sessions = await reorderSessions(order);
    broadcastSessionsChanged();
    res.json({ sessions });
  } catch (err) {
    console.error("Error reordering sessions:", err);
    res.status(500).json({ error: "Failed to reorder sessions" });
  }
});

router.delete("/api/sessions/:id", async (req: Request, res: Response) => {
  const id = req.params.id;

  // Kill the tmux session first
  const tmuxName = `webdev_${id}`;
  try {
    await execAsync(`tmux kill-session -t ${tmuxName} 2>/dev/null`);
  } catch {
    // Session might not exist, that's fine
  }

  const deleted = await deleteSession(id);
  if (!deleted) {
    return res.status(404).json({ error: "Session not found" });
  }
  broadcastSessionsChanged();
  res.json({ success: true });
});

// ============================================
// Session Files Routes
// ============================================

router.get("/api/sessions/:id/files", async (req: Request, res: Response) => {
  const session = await getSessionAsync(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const subpath = (req.query.path as string) || "";
  const mode = req.query.mode as string;
  const fullPath = path.join(session.directory, subpath);

  // Security: ensure we're still within the session directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(session.directory);
  if (!resolvedPath.startsWith(resolvedBase)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    await fs.access(fullPath);
  } catch {
    return res.status(404).json({ error: "Path not found" });
  }

  // Mode: content - read file contents
  if (mode === "content") {
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Cannot read directory content" });
    }

    const result = await readFileContent(fullPath);
    if (!result) {
      return res.status(500).json({ error: "Failed to read file" });
    }

    return res.json({
      path: subpath,
      content: result.content,
      binary: result.binary,
      truncated: result.truncated,
      size: result.size,
    });
  }

  // Mode: tree - return full tree structure
  if (mode === "tree") {
    const tree = await buildFileTree(session.directory);
    return res.json({ tree });
  }

  // Default: list directory
  const files = await listDirectoryWithHidden(fullPath);
  res.json({ files, path: subpath });
});

router.post("/api/sessions/:id/files", upload.single("file"), async (req: Request, res: Response) => {
  const session = await getSessionAsync(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const file = req.file;
  const subpath = (req.body.path as string) || "";

  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const targetDir = path.join(session.directory, subpath);
  const targetPath = path.join(targetDir, file.originalname);

  // Security: ensure we're still within the session directory
  const resolvedPath = path.resolve(targetPath);
  const resolvedBase = path.resolve(session.directory);
  if (!resolvedPath.startsWith(resolvedBase)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    await fs.writeFile(targetPath, file.buffer);
    res.json({ success: true, path: path.join(subpath, file.originalname) });
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ============================================
// Session Env Routes
// ============================================

router.get("/api/sessions/:id/env", async (req: Request, res: Response) => {
  const session = await getSessionAsync(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const raw = req.query.raw === "true";
  const filePath = (req.query.file as string) || ".env";

  const exists = await envFileExists(session.directory, filePath);

  if (raw) {
    const content = await readEnvFileRaw(session.directory, filePath);
    return res.json({ exists, content });
  }

  const vars = await readEnvFile(session.directory, filePath);
  res.json({ exists, vars });
});

router.put("/api/sessions/:id/env", async (req: Request, res: Response) => {
  const session = await getSessionAsync(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const filePath = (req.query.file as string) || ".env";

  const validation = validateBody(req.body, envVarsSchema);
  if (!validation.success) {
    return sendValidationError(res, validation.error);
  }

  const { vars, raw } = validation.data;

  try {
    if (raw !== undefined) {
      await writeEnvFileRaw(session.directory, raw, filePath);
    } else if (vars) {
      await writeEnvFile(session.directory, vars, filePath);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error writing env file:", err);
    res.status(500).json({ error: "Failed to write env file" });
  }
});

// ============================================
// Browse Routes
// ============================================

router.get("/api/browse", async (req: Request, res: Response) => {
  const dirPath = (req.query.path as string) || config.browseRoot;

  // Resolve the path
  const resolvedPath = path.resolve(dirPath.replace("~", os.homedir()));
  const resolvedRoot = path.resolve(config.browseRoot);

  // Security: ensure we're within the browse root
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    const entries = await listDirectoryWithHidden(resolvedPath);
    const parent = resolvedPath === resolvedRoot ? null : path.dirname(resolvedPath);

    res.json({ path: resolvedPath, parent, entries });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return res.status(404).json({ error: "Path not found" });
    }
    console.error("Error browsing directory:", err);
    res.status(500).json({ error: "Failed to browse directory" });
  }
});

router.post("/api/browse", async (req: Request, res: Response) => {
  const validation = validateBody(req.body, createFolderSchema);
  if (!validation.success) {
    return sendValidationError(res, validation.error);
  }

  const { parentPath, name } = validation.data;

  const resolvedParent = path.resolve(parentPath.replace("~", os.homedir()));
  const newDirPath = path.join(resolvedParent, name);
  const resolvedRoot = path.resolve(config.browseRoot);

  // Security: ensure we're within the browse root
  if (!newDirPath.startsWith(resolvedRoot)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    await fs.access(resolvedParent);

    try {
      await fs.access(newDirPath);
      return res.status(409).json({ error: "Directory already exists" });
    } catch {
      // Good - directory doesn't exist
    }

    await fs.mkdir(newDirPath, { recursive: true });
    res.status(201).json({ path: newDirPath });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return res.status(404).json({ error: "Parent directory not found" });
    }
    console.error("Error creating directory:", err);
    res.status(500).json({ error: "Failed to create directory" });
  }
});

// ============================================
// Tmux Routes
// ============================================

router.get("/api/tmux/mouse", (_req: Request, res: Response) => {
  try {
    const result = execSync("tmux show-options -g mouse 2>/dev/null || echo 'mouse off'")
      .toString()
      .trim();
    const mouseOn = result.includes("on");
    res.json({ mouse: mouseOn });
  } catch {
    res.json({ mouse: false });
  }
});

router.post("/api/tmux/mouse", (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const value = enabled ? "on" : "off";
    execSync(`tmux set-option -g mouse ${value} 2>/dev/null || true`);
    res.json({ success: true, mouse: enabled });
  } catch {
    res.status(500).json({ error: "Failed to set tmux mouse" });
  }
});

export default router;
