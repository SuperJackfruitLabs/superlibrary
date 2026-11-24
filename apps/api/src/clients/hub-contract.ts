import { createBundle, openApi, validateResponse } from '@superjackfruitlabs/treaty-contracts';
import catalog from '@superjackfruitlabs/treaty-contracts/data/schemas/http/agentpod/capability-catalog.v1.openapi.json';
import flatError from '@superjackfruitlabs/treaty-contracts/data/schemas/common/flat-error.v1.json';

const DOCUMENT = 'schemas/http/agentpod/capability-catalog.v1.openapi.json';
const bundle = createBundle({ [DOCUMENT]: catalog, 'schemas/common/flat-error.v1.json': flatError });
const API = openApi(bundle, DOCUMENT);

/** The AgentPod hub's answers SuperLibrary reads, by operation in treaty's `capability-catalog.v1`. */
export interface HubAnswers {
  listPrincipalBoards: { boards: string[] };
  readStationOwner: { id: string; key: string; owner: string };
}

/**
 * True when `body` is what the contract says `operation` answers with `status`. When it is not,
 * `why` gets the JSON pointers that failed, never the values or a token.
 */
export function hubConforms<O extends keyof HubAnswers>(operation: O, status: number, body: unknown, why: string[]): body is HubAnswers[O] {
  const result = validateResponse(bundle, API, operation, status, body);
  why.push(...result.errors.slice(0, 5).map((e) => e.split(' ')[0]));
  return result.valid;
}

/** The message for an answer the contract refused, naming the operation and where it failed. */
export const refusedAnswer = (operation: keyof HubAnswers, status: number, why: string[]) =>
  `hub ${operation} ${status}: the answer does not match treaty's contract at ${why.join(' ')}`;
