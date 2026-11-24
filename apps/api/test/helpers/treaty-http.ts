/**
 * Treaty phase 3: every exchange on a route `superlibrary.api` contracts is checked against
 * treaty's `api.v1`, in every test that makes one.
 *
 * `test/setup.ts` wraps the Worker's own `fetch` (what `SELF.fetch` reaches, and what a test that
 * imports `../src/index` calls) with `checkExchange`. A request to a route the document does not
 * describe is not checked: those routes are SuperLibrary's own. On a contracted operation:
 *
 * - the response must validate against the operation's contract for its status, refusals with
 *   the fields beside `error` that each code carries (a status the contract does not name is a
 *   mismatch);
 * - a JSON request the contract refuses must be refused (4xx). Tests send bad bodies on purpose,
 *   so an invalid request is not itself a mismatch; a server that accepts one is.
 *
 * A mismatch is recorded, and `setup.ts`'s `afterEach` fails the test that made it, naming the
 * operation, the status and the first errors.
 */
import { createBundle, matchRoute, openApi, validateRequest, validateResponse, type Api } from '@superjackfruitlabs/treaty-contracts';
import api from '@superjackfruitlabs/treaty-contracts/data/schemas/http/superlibrary/api.v1.openapi.json';
import flatError from '@superjackfruitlabs/treaty-contracts/data/schemas/common/flat-error.v1.json';

export const DOCUMENT = 'schemas/http/superlibrary/api.v1.openapi.json';

const bundle = createBundle({ [DOCUMENT]: api, 'schemas/common/flat-error.v1.json': flatError });
const API: Api = openApi(bundle, DOCUMENT);

/**
 * Where this product and the contract disagree and the contract is believed wrong: reported, and
 * held here so the rest of the suite stays checked. A response is let through only when every one
 * of its errors matches an entry's patterns; any other error in the same body still fails. Each
 * entry says why. Remove an entry when the treaty release that fixes it is pinned.
 */
export const ALLOWED_MISMATCHES: readonly { errors: readonly RegExp[]; why: string }[] = [
  {
    // Reported to treaty: api.v1's ItemSummary was written from uploaded artifacts only.
    errors: [/^#\/item\/createdBy String does not match pattern\.$/, /^#\/item\/latestVersion 0 is less than 1\.$/],
    why:
      "A work record is written by SuperPipeline's ingest, not a principal: its createdBy is `source:superpipeline` and " +
      'its latestVersion is 0 (it has no uploaded versions). api.v1 requires a `prn_` id and a version of at least 1.',
  },
];

const allowed = (error: string) => ALLOWED_MISMATCHES.some((a) => a.errors.some((r) => r.test(error)));

/** How many exchanges were checked, by operation, so a test can prove the hook ran. */
export const treatyHttpChecked: Record<string, number> = {};

const mismatches: string[] = [];

/** The mismatches recorded since the last call, and clears them. */
export function takeMismatches(): string[] {
  return mismatches.splice(0);
}

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const first = (errors: string[]) => errors.slice(0, 5).join('\n  ');
const isJson = (contentType: string | null) => (contentType ?? '').includes('application/json');

/** Check one exchange. `requestText` and `responseText` are the bodies as sent. */
export function checkExchange(
  method: string,
  url: string,
  request: { contentType: string | null; text: string },
  status: number,
  contentType: string | null,
  responseText: string,
): void {
  const path = new URL(url).pathname;
  const operation = matchRoute(API, method, path);
  if (!operation) return;
  treatyHttpChecked[operation] = (treatyHttpChecked[operation] ?? 0) + 1;
  const problems: string[] = [];

  // The request: only JSON bodies are contracted (a file's bytes are octet-stream). A body the
  // contract refuses, or one sent as JSON that does not parse, must be refused.
  if (request.text === '' || isJson(request.contentType)) {
    const sent = parse(request.text);
    const checked = !sent.ok ? { valid: false, errors: ['the body is not JSON'] } : validateRequest(bundle, API, operation, sent.value);
    if (!checked.valid && status < 400) {
      problems.push(`${operation} accepted (${status}) a request the contract refuses:\n  ${first(checked.errors)}`);
    }
  }

  // The response: always, against its status.
  const received = isJson(contentType) ? parse(responseText) : responseText === '' ? { ok: true as const, value: undefined } : { ok: false as const };
  if (!received.ok) {
    problems.push(`${operation} ${status}: the response is not JSON (${contentType ?? 'no content-type'})`);
  } else {
    const result = validateResponse(bundle, API, operation, status, received.value);
    if (!result.valid && !result.errors.every(allowed)) problems.push(`${operation} ${status} does not validate against ${DOCUMENT}:\n  ${first(result.errors)}\n  body: ${responseText.slice(0, 400)}`);
  }

  if (problems.length === 0) return;
  mismatches.push(`${method} ${path}\n${problems.join('\n')}`);
}

/**
 * Wrap a Worker `fetch` so every exchange it serves is checked. The request and response are
 * cloned, so the handler and the caller read the bodies they always did.
 */
export function withTreatyCheck<R extends Request, E, C>(fetch: (request: R, env: E, ctx: C) => Promise<Response>) {
  return async (request: R, env: E, ctx: C): Promise<Response> => {
    const text = request.body ? await request.clone().text() : '';
    const response = await fetch(request, env, ctx);
    const responseText = await response.clone().text();
    checkExchange(request.method, request.url, { contentType: request.headers.get('content-type'), text }, response.status, response.headers.get('content-type'), responseText);
    return response;
  };
}
