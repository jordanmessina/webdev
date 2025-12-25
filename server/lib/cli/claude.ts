import fs from "fs";
import path from "path";
import os from "os";
import { CLI, CLIOption } from "./types";

const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude");

/**
 * Convert a path to Claude's project folder name.
 * Claude replaces / and _ with -
 */
function getProjectName(directory: string): string {
  return directory.replace(/[/_]/g, "-");
}

/**
 * Check if a Claude conversation exists for a directory.
 */
function hasExistingConversation(directory: string): boolean {
  const projectName = getProjectName(directory);
  const projectDir = path.join(CLAUDE_DIR, "projects", projectName);

  if (!fs.existsSync(projectDir)) {
    return false;
  }

  const files = fs.readdirSync(projectDir);
  return files.some((f) => {
    if (!f.endsWith(".jsonl") || f.startsWith("agent-")) return false;
    const filePath = path.join(projectDir, f);
    const stat = fs.statSync(filePath);
    return stat.size > 0;
  });
}

const OPTIONS: CLIOption[] = [
  {
    id: "dangerously-skip-permissions",
    label: "Skip Permissions",
    flag: "--dangerously-skip-permissions",
    default: true,
  },
];

const RESUME_OPTION: CLIOption = {
  id: "resume",
  label: "Continue Existing Conversation",
  flag: "-c",
  default: false,
};

export const claude: CLI = {
  id: "claude",
  name: "Claude Code",
  command: "claude",

  async getOptions(): Promise<CLIOption[]> {
    // Always return all options - frontend handles conditional display
    return [...OPTIONS, RESUME_OPTION];
  },

  buildCommand(selectedOptions: string[]): string {
    const allOptions = [...OPTIONS, RESUME_OPTION];
    const flags = allOptions
      .filter((opt) => selectedOptions.includes(opt.id))
      .map((opt) => opt.flag);

    return ["claude", ...flags].join(" ");
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

// Export for server-side use when recreating tmux
export { hasExistingConversation, RESUME_OPTION };
