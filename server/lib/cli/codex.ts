import fs from "fs";
import path from "path";
import os from "os";
import { CLI, CLIOption } from "./types";

const CODEX_DIR = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");

/**
 * Check if a Codex conversation exists for a directory.
 * Searches through session files in ~/.codex/sessions/ for matching cwd.
 */
function hasExistingConversation(directory: string): boolean {
  const sessionsDir = path.join(CODEX_DIR, "sessions");

  if (!fs.existsSync(sessionsDir)) {
    return false;
  }

  // Recursively find all .jsonl files in sessions directory
  function findSessionFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...findSessionFiles(fullPath));
        } else if (entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore read errors
    }
    return files;
  }

  const sessionFiles = findSessionFiles(sessionsDir);

  for (const file of sessionFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const firstLine = content.split("\n")[0];
      if (!firstLine) continue;

      const meta = JSON.parse(firstLine);
      if (meta.type === "session_meta" && meta.payload?.cwd === directory) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return false;
}

const OPTIONS: CLIOption[] = [
  {
    id: "dangerously-bypass-approvals-and-sandbox",
    label: "Skip Approvals & Sandbox",
    flag: "--dangerously-bypass-approvals-and-sandbox",
    default: true,
  },
];

const RESUME_OPTION: CLIOption = {
  id: "resume",
  label: "Continue Existing Conversation",
  flag: "resume",
  default: false,
};

export const codex: CLI = {
  id: "codex",
  name: "Codex",
  command: "codex",

  async getOptions(): Promise<CLIOption[]> {
    return [...OPTIONS, RESUME_OPTION];
  },

  buildCommand(selectedOptions: string[]): string {
    const parts = ["codex"];

    // Check if resume is selected - it's a subcommand, not a flag
    if (selectedOptions.includes("resume")) {
      parts.push("resume");
    }

    // Add flags (excluding resume since it's a subcommand)
    const flags = OPTIONS
      .filter((opt) => selectedOptions.includes(opt.id))
      .map((opt) => opt.flag);

    parts.push(...flags);

    return parts.join(" ");
  },

  buildResumeCommand(selectedOptions: string[], directory: string): string {
    const options = [...selectedOptions];
    if (!options.includes("resume") && hasExistingConversation(directory)) {
      options.push("resume");
    }
    return this.buildCommand(options);
  },

  shouldResume(directory: string): boolean {
    return hasExistingConversation(directory);
  },
};

export { hasExistingConversation, RESUME_OPTION };
