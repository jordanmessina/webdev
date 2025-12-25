import { z } from "zod";
import { Response } from "express";
import { UI } from "./constants";

// ============================================
// Session Schemas
// ============================================

export const createSessionSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(UI.SESSION_NAME_MAX_LENGTH, `Name must be ${UI.SESSION_NAME_MAX_LENGTH} characters or less`),
  directory: z.string().min(1, "Directory is required"),
  executable: z.enum(["claude", "codex", "gemini", "shell"], {
    message: "Must be 'claude', 'codex', 'gemini', or 'shell'",
  }),
  options: z.array(z.string()),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(UI.SESSION_NAME_MAX_LENGTH, `Name must be ${UI.SESSION_NAME_MAX_LENGTH} characters or less`)
    .optional(),
});

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

// ============================================
// Environment File Schemas
// ============================================

export const envVarsSchema = z
  .object({
    vars: z.record(z.string(), z.string()).optional(),
    raw: z.string().optional(),
  })
  .refine((data) => data.vars !== undefined || data.raw !== undefined, {
    message: "Must provide 'vars' or 'raw'",
  });

export type EnvVarsInput = z.infer<typeof envVarsSchema>;

// ============================================
// File System Schemas
// ============================================

// Regex to prevent dangerous folder names
const SAFE_FOLDER_NAME_REGEX = /^[^/\\:*?"<>|]+$/;

export const createFolderSchema = z.object({
  parentPath: z.string(),
  name: z
    .string()
    .min(1, "Folder name is required")
    .max(UI.FOLDER_NAME_MAX_LENGTH, `Folder name must be ${UI.FOLDER_NAME_MAX_LENGTH} characters or less`)
    .regex(SAFE_FOLDER_NAME_REGEX, "Folder name contains invalid characters"),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;

// ============================================
// Validation Helper
// ============================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { status: number; body: object } };

/**
 * Validate request body against a zod schema.
 * Returns parsed data on success, or an error object on failure.
 */
export function validateBody<T>(
  body: unknown,
  schema: z.Schema<T>
): ValidationResult<T> {
  try {
    const data = schema.parse(body);
    return { success: true, data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: {
          status: 400,
          body: {
            error: "Validation failed",
            details: err.issues.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        },
      };
    }

    return {
      success: false,
      error: {
        status: 400,
        body: { error: "Invalid request body" },
      },
    };
  }
}

/**
 * Helper to send validation error response
 */
export function sendValidationError(res: Response, error: { status: number; body: object }): void {
  res.status(error.status).json(error.body);
}
