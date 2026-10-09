import { z } from 'zod';

/** Where an item came from (spec §3, Provenance). `upload` is a person's direct upload (phase 1). */
export const SOURCES = ['upload', 'agentpod', 'superpipeline'] as const;
export type SourceKind = (typeof SOURCES)[number];

export const PRN_ID = /^prn_[0-9a-f]{20}$/;
export const ORG_ID = /^org_[0-9a-f]{20}$/;
/** Superpipeline's `newId` shapes (`brd_`, `card_`, `run_` + 16 hex). */
export const BOARD_ID = /^brd_[0-9a-f]{16}$/;
export const CARD_ID = /^card_[0-9a-f]{16}$/;
export const RUN_ID = /^run_[0-9a-f]{16}$/;

/**
 * Spec §3: workspace, board, card, stage, run, agent principal, station, source path, and the
 * source's own id and URL. Strict: a key the contract does not model is refused, never dropped
 * silently (contract-boundary rule).
 */
export const Provenance = z
  .object({
    source: z.enum(SOURCES),
    /** The Accounts `org_` id (the workspace's external id), not Superlibrary's internal `wsp_` id used by `ItemChanged.workspaceId` and `work_records.workspace_id`. */
    workspace: z.string().regex(ORG_ID).optional(),
    board: z.string().regex(BOARD_ID).optional(),
    card: z.string().regex(CARD_ID).optional(),
    stage: z.string().min(1).max(100).optional(),
    run: z.string().regex(RUN_ID).optional(),
    agent: z.string().regex(PRN_ID).optional(),
    /** The service principal (the hub) that acted for the agent. */
    via: z.string().regex(PRN_ID).optional(),
    station: z.string().min(1).max(100).optional(),
    path: z.string().min(1).max(1024).optional(),
    sourceId: z.string().min(1).max(200).optional(),
    sourceUrl: z.url().max(2048).optional(),
  })
  .strict();
export type Provenance = z.infer<typeof Provenance>;

/**
 * What the AgentPod hub sends with an upload it makes from a station (spec §5 step 4). `station`
 * is the hub's station id (unique); `stationName` its readable key; `path` relative to the
 * workspace root.
 */
export const LinkSource = z
  .object({
    station: z.string().min(1).max(100),
    stationName: z.string().min(1).max(100).optional(),
    path: z.string().min(1).max(1024),
    board: z.string().regex(BOARD_ID),
    card: z.string().regex(CARD_ID).optional(),
    run: z.string().regex(RUN_ID).optional(),
  })
  .strict();
export type LinkSource = z.infer<typeof LinkSource>;
