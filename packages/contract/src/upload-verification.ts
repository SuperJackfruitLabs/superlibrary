/** Owned upload continuation; never an item read or viewer-authority endpoint.
 * POST /api/v1/uploads/:uploadId/verification accepts exactly this versioned body.
 * Caller cannot select an item, version, file or digest. The committed session selects all.
 * Uses the same authenticated uploader ownership as PUT/commit (current configured Hub plus
 * actual agent proof for agents), not a historical service binding absent from sessions.
 */
import { z } from 'zod';
export const UploadVerificationRequest = z.object({ schemaVersion: z.literal('superlibrary-upload-verification/v1') }).strict();
export const UploadVerificationGrant = z.object({
  schemaVersion: z.literal('superlibrary-upload-verification/v1'),
  uploadId: z.string().regex(/^upl_[0-9a-f]{16}$/),
  itemId: z.string().regex(/^itm_[0-9a-f]{16}$/),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
  entry: z.string(),
  expiresAt: z.iso.datetime(),
  url: z.url(),
  downloadUrl: z.url().nullable(),
  files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.number().int().nonnegative() }).strict()).min(1),
}).strict();
export type UploadVerificationGrant = z.infer<typeof UploadVerificationGrant>;
