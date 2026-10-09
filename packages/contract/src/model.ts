import { z } from 'zod';
import { LinkSource } from './provenance';

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
  /** The file a folder opens on. Defaults to the shallowest index.html, then the shallowest README.md, then the first path. */
  entry: z.string().min(1).max(1024).optional(),
  /** ISO 8601; the item is deleted at this time (spec §12). */
  expiresAt: z.iso.datetime().optional(),
  /** Set only by a trusted service linking a station's file (plan P1, Task A10). */
  source: LinkSource.optional(),
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

/** One file of a version, as the host toolbar's Files list shows it. */
export interface FileEntry {
  path: string;
  mediaType: string;
  view: View;
  bytes: number;
}

/**
 * Tree order: segment by segment, by code unit, so a folder's files stay together
 * (`a/x` before `a-b` and `a.css`, which plain string order would put first).
 */
export function compareTreePaths(a: string, b: string): number {
  const sa = a.split('/');
  const sb = b.split('/');
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    if (sa[i] !== sb[i]) return sa[i]! < sb[i]! ? -1 : 1;
  }
  return sa.length - sb.length;
}

/** A version's files as every reader lists them: the entry first, then tree order. */
export function orderFiles<T extends { path: string }>(entry: string, files: T[]): T[] {
  return [...files].sort((x, y) => (x.path === entry ? -1 : y.path === entry ? 1 : compareTreePaths(x.path, y.path)));
}

export interface EmbedGrant {
  url: string;
  downloadUrl: string | null;
  expiresAt: string;
  version: number;
  itemUrl: string;
  /** The file the frame opens on. */
  entry: string;
  /** Every file of the version, `orderFiles` order. */
  files: FileEntry[];
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
  /** Every file of the version, `orderFiles` order. */
  files: FileEntry[];
}

/**
 * Where an item came from beyond who and when (spec §3, Provenance). A person's upload has none
 * (phase 1); an agent's link (phase 2) carries its station and source path, and the card and run
 * it was made for. Every field is optional: a reader shows what is there.
 */
export interface ItemSource {
  /** The creator is an agent, not a person. */
  agent?: boolean;
  /** Which source made it (`upload` is a person's direct upload). */
  sourceKind?: 'upload' | 'agentpod' | 'superpipeline';
  agentPrincipal?: string;
  station?: string;
  /** The station was removed; the item stays (spec §12). */
  stationRemoved?: boolean;
  path?: string;
  board?: string;
  card?: string;
  stage?: string;
  run?: string;
  sourceId?: string;
  sourceUrl?: string;
  /** The service principal (the hub) that acted for the agent. */
  via?: string;
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
  /** Absent for a person's upload (phase 1). */
  source?: ItemSource;
  /** Who can see it, in the Share panel's terms (plan P4; phase-1 ruling T14). */
  audience?: 'uploader' | 'board' | 'workspace';
  /** A superseded item's replacement (spec §15). */
  supersededBy?: string | null;
}
