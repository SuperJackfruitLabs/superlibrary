import { LIMITS, NOTHING_ADDED, sizeRefusal } from './limits';
import { pathRefusalSentence, type PathRefusal } from './paths';

export type Finding = { path: string; line: number; rule: string };
/** What a refusal's body said beyond its error code (only the fields the upload API sends). */
export interface RefusalDetail { path?: string; reason?: string; rule?: string; missing?: string[]; limit?: number; used?: number; entry?: string; detail?: string }
/** A refused upload request, as every client reads it from the API's answer. */
export interface UploadRefusal { ok: false; status: number; error: string; uploadId?: string; findings?: Finding[]; detail?: RefusalDetail }

/** "a", "a and b", "a, b and c". */
export const listWords = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Spec §8: refused naming file and line. The flagged bytes wait in a private quarantine, not in the library. */
export function secretRefusal(findings: Finding[]): string {
  const where = listWords(findings.map((f) => `${f.path} line ${f.line} (${f.rule})`));
  return `${where} ${findings.length === 1 ? 'looks like a secret' : 'look like secrets'}. Nothing was added to the library.`;
}

/** One sentence for each refusal the upload API gives (apps/api/src/uploads/routes.ts); null for a code not among them. */
export function refusalSentence(r: UploadRefusal): string | null {
  const d = r.detail ?? {};
  switch (r.error) {
    case 'path_refused': return d.path && d.reason ? pathRefusalSentence({ path: d.path, reason: d.reason as PathRefusal, rule: d.rule }) : `A path was refused. ${NOTHING_ADDED}`;
    case 'duplicate_path': return `${d.path} is chosen twice.`;
    case 'file_too_large': return sizeRefusal.file(d.path!);
    case 'folder_too_large': return sizeRefusal.folder();
    case 'too_many_files': return sizeRefusal.files();
    case 'quota_exceeded': return `This would take the workspace over its storage limit. ${NOTHING_ADDED}`;
    case 'secret_found': return secretRefusal(r.findings ?? []);
    case 'upload_expired': return `This upload was not finished within ${LIMITS.uploadTtlHours} hours and has expired. Upload it again.`;
    case 'revoked': return 'That item has been revoked, so it cannot have a new version.';
    case 'expired': return 'That item has expired. Choose a new delete date to upload a new version.';
    case 'not_found': return r.uploadId ? 'This upload is no longer open. Upload it again.' : 'That item does not exist, or you cannot change it.';
    case 'incomplete': return `${listWords(d.missing ?? [])} did not arrive. Upload again.`;
    case 'size_mismatch': case 'sha256_mismatch': return `${d.path} changed while it was being sent. Upload again.`;
    case 'version_conflict': return 'Someone else added a version of this item at the same moment. Upload again.';
    case 'gone': return 'This upload was committed, but its item has since been deleted.';
    case 'invalid':
      if (d.detail === 'expiresAt must be in the future') return `The delete date must be after today. ${NOTHING_ADDED}`;
      return d.detail ? `The upload was not accepted: ${d.detail}. ${NOTHING_ADDED}` : `The upload was not accepted. ${NOTHING_ADDED}`;
    case 'not_declared': return `${d.path} was not part of this upload. Upload again.`;
    case 'already_committed': return 'This upload is already in the library.';
    case 'nothing_to_override': return 'Nothing in this upload needs an override. Upload it again.';
    case 'entry_not_found': return `${d.entry}, the file to open first, is not among the chosen files. ${NOTHING_ADDED}`;
    case 'product_not_enabled': return 'Superlibrary is not enabled for this workspace.';
    default: return null;
  }
}

/** `refusalSentence`, or for a code it does not know the code itself, so the web app and `suli` always say something. */
export function describeRefusal(r: UploadRefusal): string {
  return refusalSentence(r) ?? `The upload was refused (${r.error}, HTTP ${r.status}). ${NOTHING_ADDED}`;
}
