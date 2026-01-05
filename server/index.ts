import "dotenv/config";
import express from "express";
import { createServer, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { watch, FSWatcher } from "chokidar";
import path from "path";
import { getSession } from "./lib/sessions";
import { getCli } from "./lib/cli";
import { SERVER, FILES } from "./lib/constants";
import type { WSServerMessage } from "./types";
import routes from "./routes";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || String(SERVER.DEFAULT_PORT), 10);

// Track active resources for cleanup
const activePtys = new Map<string, pty.IPty>();
const activeConnections = new Set<WebSocket>();
const activeWatchers = new Map<string, FSWatcher>();
const fileSubscribers = new Map<string, Set<WebSocket>>();
// Track clients subscribed to session list updates
const sessionSubscribers = new Set<WebSocket>();

// Broadcast session changes to all subscribers
export function broadcastSessionsChanged(): void {
  for (const ws of sessionSubscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sessions-changed" }));
    }
  }
}

let server: Server;
let wss: WebSocketServer;

function getTmuxName(sessionId: string): string {
  return `webdev_${sessionId}`;
}

function sendMessage(ws: WebSocket, message: WSServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function subscribeToFiles(ws: WebSocket, sessionId: string, directory: string): void {
  if (!fileSubscribers.has(sessionId)) {
    fileSubscribers.set(sessionId, new Set());
  }
  fileSubscribers.get(sessionId)!.add(ws);

  if (!activeWatchers.has(sessionId)) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const watcher = watch(directory, {
      ignoreInitial: true,
      ignored: [
        /node_modules/,
        /\.git/,
        /\.next/,
        /\.cache/,
        /dist/,
        /build/,
        /coverage/,
      ],
      depth: 10,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on("all", (event, filePath) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        const subscribers = fileSubscribers.get(sessionId);
        if (subscribers) {
          for (const subscriber of subscribers) {
            sendMessage(subscriber, { type: "files-changed" });
          }
        }
      }, FILES.WATCHER_DEBOUNCE_MS);
    });

    watcher.on("error", (err) => {
      console.error(`File watcher error for session ${sessionId}:`, err);
    });

    activeWatchers.set(sessionId, watcher);
  }
}

function unsubscribeFromFiles(ws: WebSocket, sessionId: string): void {
  const subscribers = fileSubscribers.get(sessionId);
  if (subscribers) {
    subscribers.delete(ws);

    if (subscribers.size === 0) {
      const watcher = activeWatchers.get(sessionId);
      if (watcher) {
        watcher.close();
        activeWatchers.delete(sessionId);
      }
      fileSubscribers.delete(sessionId);
    }
  }
}

function handleTerminalConnection(ws: WebSocket, sessionId: string) {
  // Lookup session from cache
  const session = getSession(sessionId);
  if (!session) {
    sendMessage(ws, { type: "error", message: "Session not found" });
    ws.close();
    return;
  }

  activeConnections.add(ws);

  // Get the command for this CLI
  // Use buildResumeCommand to auto-add resume flag if conversation exists
  // (handles case where tmux died but session still in sessions.json)
  const cli = getCli(session.executable);
  const command = cli ? cli.buildResumeCommand(session.options, session.directory) : null;

  // Spawn PTY with tmux
  // -A flag: attach to existing session if it exists, otherwise create new
  // The command is only used when creating a new session (ignored on attach)
  // Initial size (80x24) doesn't matter - client sends resize after connect
  // If no command, tmux uses the user's default shell
  const tmuxArgs = ["new-session", "-A", "-s", getTmuxName(sessionId)];
  if (command) tmuxArgs.push(command);

  const ptyProcess = pty.spawn(
    "tmux",
    tmuxArgs,
    {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: session.directory,
      env: { ...process.env, TERM: "xterm-256color" },
    }
  );

  activePtys.set(sessionId, ptyProcess);

  // PTY -> WebSocket
  ptyProcess.onData((data) => {
    sendMessage(ws, { type: "output", data });
  });

  ptyProcess.onExit(({ exitCode }) => {
    activePtys.delete(sessionId);
    sendMessage(ws, { type: "exit", code: exitCode });
  });

  // WebSocket -> PTY
  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === "resize") {
        ptyProcess.resize(msg.cols, msg.rows);
      } else if (msg.type === "input") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "subscribe-files") {
        subscribeToFiles(ws, sessionId, session.directory);
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    unsubscribeFromFiles(ws, sessionId);
    ptyProcess.kill();
    activePtys.delete(sessionId);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for session ${sessionId}:`, err);
    activeConnections.delete(ws);
  });
}

function handleFileSubscriptionConnection(ws: WebSocket, sessionId: string) {
  const session = getSession(sessionId);
  if (!session) {
    sendMessage(ws, { type: "error", message: "Session not found" });
    ws.close();
    return;
  }

  activeConnections.add(ws);

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === "subscribe-files") {
        subscribeToFiles(ws, sessionId, session.directory);
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    activeConnections.delete(ws);
    unsubscribeFromFiles(ws, sessionId);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for session ${sessionId}:`, err);
    activeConnections.delete(ws);
  });
}

// ============================================
// Express App Setup
// ============================================

const app = express();

// Middleware
app.use(express.json());

// API Routes
app.use(routes);

// Static files - serve Vite build in production
if (!dev) {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));

  // SPA fallback - serve index.html for all non-API routes
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

// ============================================
// Server Setup
// ============================================

server = createServer(app);
wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === "/ws/sessions") {
    // Session list subscription
    wss.handleUpgrade(req, socket, head, (ws) => {
      sessionSubscribers.add(ws);
      ws.on("close", () => {
        sessionSubscribers.delete(ws);
      });
    });
  } else if (pathname?.startsWith("/ws/terminal/")) {
    // Terminal connections are the only ones that spawn tmux.
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sessionId = pathname.replace("/ws/terminal/", "");
      handleTerminalConnection(ws, sessionId);
    });
  } else if (pathname?.startsWith("/ws/files/")) {
    // File subscriptions never spawn tmux; they only watch the filesystem.
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sessionId = pathname.replace("/ws/files/", "");
      handleFileSubscriptionConnection(ws, sessionId);
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

// ============================================
// Graceful Shutdown
// ============================================

function shutdown() {
  for (const [, ptyProcess] of activePtys) ptyProcess.kill();
  for (const ws of activeConnections) ws.close();
  for (const [, watcher] of activeWatchers) watcher.close();
  wss.close();
  server.close();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, hostname, () => {
  console.log(`> Server running on http://${hostname}:${port}`);
  if (dev) {
    console.log(`> Run 'npm run dev:client' in another terminal for the frontend`);
  }
});
