const MB = 1024 * 1024;
/** Spec §8 sizes, §9 URL lifetime, §11 CSV rows, §12 retention. */
export const LIMITS = {
  fileBytes: 25 * MB,
  folderBytes: 100 * MB,
  folderFiles: 500,
  workspaceBytes: 1024 * MB,
  embedTtlSeconds: 300,
  retentionDays: 30,
  /** An upload session not committed within this many hours is swept. */
  uploadTtlHours: 24,
  csvRows: 5000,
} as const;
