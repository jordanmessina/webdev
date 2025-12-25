import { CLI } from "./types";
import { claude } from "./claude";
import { codex } from "./codex";
import { gemini } from "./gemini";
import { shell } from "./shell";

export * from "./types";
export { claude } from "./claude";
export { codex } from "./codex";
export { gemini } from "./gemini";
export { shell } from "./shell";

/**
 * All available CLIs.
 * Add new CLIs here to make them available in the app.
 */
export const clis: CLI[] = [claude, codex, gemini, shell];

/**
 * Get a CLI by its ID.
 */
export function getCli(id: string): CLI | undefined {
  return clis.find((cli) => cli.id === id);
}
