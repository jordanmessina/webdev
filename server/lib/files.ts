import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { FILES } from "./constants";
import type { FileEntry, FileNode, FileContent } from "../types";

// Re-export types for convenience
export type { FileEntry, FileNode, FileContent };

// ============================================
// Directory Listing
// ============================================

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith("."))
        .map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          try {
            const stats = await fs.stat(fullPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
              size: entry.isFile() ? stats.size : undefined,
              modifiedAt: stats.mtime.toISOString(),
            };
          } catch {
            return {
              name: entry.name,
              type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
            };
          }
        })
    );

    return results.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error("Error listing directory:", err);
    return [];
  }
}

export async function listDirectoryWithHidden(dirPath: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
            size: entry.isFile() ? stats.size : undefined,
            modifiedAt: stats.mtime.toISOString(),
          };
        } catch {
          return {
            name: entry.name,
            type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
          };
        }
      })
    );

    return results.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error("Error listing directory:", err);
    return [];
  }
}

// ============================================
// File Tree Building
// ============================================

export async function buildFileTree(
  basePath: string,
  relativePath: string = ""
): Promise<FileNode[]> {
  const fullPath = path.join(basePath, relativePath);

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const nodes = await Promise.all(
      entries.map(async (entry) => {
        const entryRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;
        const entryFullPath = path.join(fullPath, entry.name);

        try {
          const stats = await fs.stat(entryFullPath);
          const node: FileNode = {
            name: entry.name,
            path: entryRelativePath,
            type: entry.isDirectory() ? "directory" : "file",
            size: entry.isFile() ? stats.size : undefined,
          };

          if (entry.isDirectory()) {
            node.children = await buildFileTree(basePath, entryRelativePath);
          }

          return node;
        } catch {
          return {
            name: entry.name,
            path: entryRelativePath,
            type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
          };
        }
      })
    );

    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error("Error building file tree:", err);
    return [];
  }
}

// ============================================
// File Content Reading
// ============================================

export async function readFileContent(
  filePath: string,
  maxSize: number = FILES.MAX_FILE_SIZE
): Promise<FileContent | null> {
  try {
    const stats = await fs.stat(filePath);
    const size = stats.size;

    const truncated = size > maxSize;
    const readSize = truncated ? maxSize : size;

    // Read the file (or partial if too large)
    const fileHandle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(readSize);
      await fileHandle.read(buffer, 0, readSize, 0);

      // Check if binary (contains null bytes in first chunk)
      const checkSize = Math.min(FILES.BINARY_CHECK_SIZE, readSize);
      for (let i = 0; i < checkSize; i++) {
        if (buffer[i] === 0) {
          return { path: filePath, content: "", truncated: false, size, binary: true };
        }
      }

      return {
        path: filePath,
        content: buffer.toString("utf-8"),
        truncated,
        size,
        binary: false,
      };
    } finally {
      await fileHandle.close();
    }
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
}

// ============================================
// Environment File Operations
// ============================================

export async function readEnvFile(
  directory: string,
  filePath: string = ".env"
): Promise<Record<string, string> | null> {
  const envPath = path.join(directory, filePath);
  try {
    const content = await fs.readFile(envPath, "utf-8");
    return parseEnvContent(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("Error reading env file:", err);
    return null;
  }
}

export async function readEnvFileRaw(
  directory: string,
  filePath: string = ".env"
): Promise<string | null> {
  const envPath = path.join(directory, filePath);
  try {
    return await fs.readFile(envPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("Error reading env file:", err);
    return null;
  }
}

export async function writeEnvFile(
  directory: string,
  vars: Record<string, string>,
  filePath: string = ".env"
): Promise<void> {
  const envPath = path.join(directory, filePath);
  const content = Object.entries(vars)
    .map(([key, value]) => {
      // Quote values with newlines, spaces, or special chars
      if (
        value.includes("\n") ||
        value.includes(" ") ||
        value.includes("=") ||
        value.includes("#") ||
        value.includes('"')
      ) {
        const escaped = value.replace(/"/g, '\\"');
        return `${key}="${escaped}"`;
      }
      return `${key}=${value}`;
    })
    .join("\n");

  await fs.writeFile(envPath, content + "\n");
}

export async function writeEnvFileRaw(
  directory: string,
  content: string,
  filePath: string = ".env"
): Promise<void> {
  const envPath = path.join(directory, filePath);
  await fs.writeFile(envPath, content);
}

export async function envFileExists(
  directory: string,
  filePath: string = ".env"
): Promise<boolean> {
  try {
    await fs.access(path.join(directory, filePath));
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Helper Functions
// ============================================

function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.split("\n");

  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        currentValue.push(line.slice(0, -1));
        vars[currentKey!] = currentValue.join("\n").replace(/\\"/g, '"');
        currentKey = null;
        currentValue = [];
        inMultiline = false;
      } else {
        currentValue.push(line);
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex);
      let value = trimmed.slice(eqIndex + 1);

      if (value.startsWith('"') && !value.endsWith('"')) {
        currentKey = key;
        currentValue = [value.slice(1)];
        inMultiline = true;
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
        value = value.replace(/\\"/g, '"');
      }
      vars[key] = value;
    }
  }

  return vars;
}

// Synchronous version for cases where async isn't possible
// Prefer async versions when possible
export function existsSync(filePath: string): boolean {
  return fsSync.existsSync(filePath);
}
