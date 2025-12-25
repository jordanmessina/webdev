import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { CLI, CLIOption } from "./types";

const GEMINI_DIR = process.env.GEMINI_DIR || path.join(os.homedir(), ".gemini");

/**
 * Check if a Gemini session exists for a directory.
 * Gemini uses SHA-256 hash of the path.
 */
function hasExistingSession(directory: string): boolean {
  const hash = crypto.createHash("sha256").update(directory).digest("hex");
  const chatsDir = path.join(GEMINI_DIR, "tmp", hash, "chats");

  if (!fs.existsSync(chatsDir)) {
    return false;
  }

  const files = fs.readdirSync(chatsDir);
  return files.some((f) => f.endsWith(".json"));
}

const OPTIONS: CLIOption[] = [
  {
    id: "yolo",
    label: "YOLO Mode",
    flag: "-y",
    default: true,
  },
];

const RESUME_OPTION: CLIOption = {
  id: "resume",
  label: "Continue Existing Session",
  flag: "-r",
  default: false,
};

export const gemini: CLI = {
  id: "gemini",
  name: "Gemini CLI",
  command: "gemini",

  async getOptions(): Promise<CLIOption[]> {
    // Always return all options - frontend handles conditional display
    return [...OPTIONS, RESUME_OPTION];
  },

  buildCommand(selectedOptions: string[]): string {
    const allOptions = [...OPTIONS, RESUME_OPTION];
    const flags = allOptions
      .filter((opt) => selectedOptions.includes(opt.id))
      .map((opt) => opt.flag);

    return ["gemini", ...flags].join(" ");
  },

  buildResumeCommand(selectedOptions: string[], directory: string): string {
    const options = [...selectedOptions];
    if (!options.includes("resume") && hasExistingSession(directory)) {
      options.push("resume");
    }
    return this.buildCommand(options);
  },

  shouldResume(directory: string): boolean {
    return hasExistingSession(directory);
  },
};

// Export for server-side use when recreating tmux
export { hasExistingSession, RESUME_OPTION };
