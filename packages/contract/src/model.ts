import { z } from 'zod';

export const OUTCOMES = ['approved', 'completed', 'rejected', 'failed', 'abandoned', 'superseded', 'in-progress'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** How the content origin shows a file (spec §9 table). `download` is every kind not rendered. */
export const VIEWS = [
  'html', 'markdown', 'image', 'svg', 'pdf', 'code', 'text', 'json', 'yaml', 'toml',
  'csv', 'tsv', 'ipynb', 'mermaid', 'graphviz', 'audio', 'video', 'download',
] as const;
export type View = (typeof VIEWS)[number];

/** `workspace`, or a Superpipeline board (`brd_` + 16 hex, Superpipeline's `newId`). */
export const SCOPE_RE = /^(workspace|board:brd_[0-9a-f]{16})$/;
export type Scope = 'workspace' | `board:${string}`;

/** Grant scopes for agents and services (phases 2-3). Product vocabulary: Accounts carries them verbatim. */
export const LIBRARY_SCOPES = ['library:read', 'library:write', 'library:admin'] as const;

const SHA256 = /^[0-9a-f]{64}$/;

export const UploadCreate = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.string().regex(SCOPE_RE).default('workspace'),
  /** Upload a new version of this item (plan decision D17). */
  item: z.string().regex(/^itm_[0-9a-f]{16}$/).optional(),
  /** The file a folder opens on. Defaults to index.html, then README.md, then the first path. */
  entry: z.string().min(1).max(1024).optional(),
  /** ISO 8601; the item is deleted at this time (spec §12). */
  expiresAt: z.iso.datetime().optional(),
  files: z
    .array(z.object({ path: z.string().min(1).max(1024), bytes: z.number().int().min(0), sha256: z.string().regex(SHA256) }))
    .min(1),
});
export type UploadCreateBody = z.infer<typeof UploadCreate>;

export interface CommitResult {
  itemId: string;
  version: number;
  url: string;
  sha256: string;
  mediaType: string;
  bytes: number;
}

export interface EmbedGrant {
  url: string;
  downloadUrl: string | null;
  expiresAt: string;
  version: number;
  itemUrl: string;
}

export interface VersionSummary {
  version: number;
  entry: string;
  view: View;
  mediaType: string;
  totalBytes: number;
  fileCount: number;
  sha256: string;
  createdAt: string;
  revokedAt: string | null;
  scanOverride: boolean;
}

export interface ItemSummary {
  id: string;
  kind: 'artifact' | 'work-record';
  title: string;
  scope: Scope;
  outcome: Outcome;
  createdBy: string;
  createdAt: string;
  latestVersion: number;
  expiresAt: string | null;
  revokedAt: string | null;
}
