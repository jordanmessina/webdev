import { CLI, CLIOption } from "./types";

export const shell: CLI = {
  id: "shell",
  name: "Shell",
  command: "",

  async getOptions(): Promise<CLIOption[]> {
    return [];
  },

  buildCommand(_selectedOptions: string[]): string {
    // Empty string = let tmux use user's default shell
    return "";
  },

  buildResumeCommand(selectedOptions: string[]): string {
    return this.buildCommand(selectedOptions);
  },

  shouldResume(): boolean {
    return false;
  },
};
