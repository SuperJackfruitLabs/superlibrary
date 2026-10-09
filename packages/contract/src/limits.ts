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
  /** Files arriving renew a session by uploadTtlHours, never past this many hours after it was declared. */
  uploadMaxHours: 72,
  /** One batch request carries at most this many files and this many bytes of them; a bigger file goes alone. */
  batchFiles: 50,
  batchBytes: 8 * MB,
  csvRows: 5000,
} as const;

const mb = (bytes: number) => bytes / MB;

/** The sentences every client shows for a size refusal, with the numbers taken from LIMITS. */
export const sizeRefusal = {
  file: (path: string) => `${path} is larger than ${mb(LIMITS.fileBytes)} MB, the limit for one file.`,
  folder: () => `Together these are more than ${mb(LIMITS.folderBytes)} MB, the limit for a folder.`,
  files: (count?: number) => `A folder may have at most ${LIMITS.folderFiles} files${count === undefined ? '' : `; this has ${count}`}.`,
};

/** Ends every refusal that happens before anything is stored. */
export const NOTHING_ADDED = 'Nothing was added to the library.';
