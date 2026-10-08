export type RetentionMessage = { type: 'sweep'; at: string };

export interface Env {
  DB: D1Database;
  /** Artifact bytes at `blobs/<sha256>`, version manifests at `manifests/<itemId>/<version>.json`. */
  BLOBS: R2Bucket;
  RETENTION: Queue<RetentionMessage>;
  APP_URL: string;
  /** Unset or empty: the plane is off (dev and tests only). Set: tokens are verified offline. */
  ORG_PLANE_ISSUER?: string;
  ORG_PLANE_JWKS_URL?: string;
  ORG_PLANE_AUDIENCE?: string;
  /** `https://{label}.superlibrarycontent.dev`; `{label}` is `contentLabel(itemId)`. */
  CONTENT_ORIGIN_TEMPLATE: string;
  /** Space-separated origins, besides APP_URL, that may mint embed URLs from a browser. */
  EMBED_HOSTS: string;
  RETENTION_MODE: 'report' | 'enforce';
  /** Ed25519 private JWK as JSON (secret). */
  URL_SIGNING_PRIVATE_KEY?: string;
  /** "true" accepts X-Dev-Principal / X-Dev-Org as a person. Never in wrangler.jsonc. */
  DEV_AUTH?: string;
}
