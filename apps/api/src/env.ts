import type { IndexMessage, IngestMessage } from '@superlibrary/contract';

export type RetentionMessage = { type: 'sweep'; at: string };

export interface Env {
  DB: D1Database;
  /** Artifact bytes at `blobs/<sha256>`, version manifests at `manifests/<itemId>/<version>.json`. */
  BLOBS: R2Bucket;
  RETENTION: Queue<RetentionMessage>;
  /** Source events into work records (spec §6 `ingest`; lane A). */
  INGEST: Queue<IngestMessage>;
  /** The item.changed seam and re-index pages (spec §6 `index`; lane B consumes). */
  INDEX: Queue<IndexMessage>;
  /** Workers AI (lane B). Optional: absent in tests and until lane B's wrangler change. */
  AI?: Ai;
  /** Vectorize slots a and b (plan P9). */
  VEC_A?: VectorizeIndex;
  VEC_B?: VectorizeIndex;
  APP_URL: string;
  /** Unset or empty: the plane is off (dev and tests only). Set: tokens are verified offline. */
  ORG_PLANE_ISSUER?: string;
  ORG_PLANE_JWKS_URL?: string;
  ORG_PLANE_AUDIENCE?: string;
  /** The plane's base URL for token exchanges (`/api/token/service`). */
  ORG_PLANE_URL?: string;
  /**
   * Secret. Exactly one service prn: the AgentPod hub, the only caller that may act for an agent
   * (plan P1, with the operator's guards). Empty, malformed or several values: nobody is trusted.
   */
  HUB_SERVICE_PRINCIPAL?: string;
  /** Secret. JSON {"org_…": "svc_…:<secret>"}: Superlibrary's own service credential per workspace org (plan P20). */
  SERVICE_CREDENTIALS?: string;
  /** The AgentPod hub, for the roster (spec §4). */
  HUB_URL?: string;
  HUB_AUDIENCE?: string;
  /** Superpipeline's API origin and audience (spec §5). */
  SUPERPIPELINE_URL?: string;
  SUPERPIPELINE_AUDIENCE?: string;
  /** Secret. HMAC key from which each board's push secret is derived (Task A11). */
  PUSH_SIGNING_KEY?: string;
  /** Secret. Space-separated person prns who may run the backfill, reconcile and re-index jobs. */
  OPERATORS?: string;
  /** Seconds an agent's roster is cached (spec §4: five minutes). */
  ROSTER_TTL_SECONDS?: string;
  /** `https://{label}.superlibrarycontent.dev`; `{label}` is `contentLabel(itemId)`. */
  CONTENT_ORIGIN_TEMPLATE: string;
  /** Space-separated origins, besides APP_URL, that may mint embed URLs from a browser. */
  EMBED_HOSTS: string;
  /** Space-separated browser origins (the AgentPod console) that may call the upload and station routes with a person's own token (ruling RA3). */
  CONSOLE_ORIGINS?: string;
  RETENTION_MODE: 'report' | 'enforce';
  /** Ed25519 private JWK as JSON (secret). */
  URL_SIGNING_PRIVATE_KEY?: string;
  /** "true" accepts X-Dev-Principal / X-Dev-Org as a person. Never in wrangler.jsonc. */
  DEV_AUTH?: string;
}
