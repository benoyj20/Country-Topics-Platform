// Shared pieces of the /api/v1 route handlers: error responses with one
// shape, `{ error, problems, code? }`, and request bodies read as JSON with
// a size limit.

/** Personal or changing answers: no browser or shared cache keeps them. */
export const NO_STORE = { "Cache-Control": "private, no-store" };

export type ApiErrorBody = {
  /** A sentence to show the person. */
  error: string;
  /** What exactly was wrong with the request, if it was the request. */
  problems: string[];
  /** For answers a client acts on, such as "display-name-required". */
  code?: string;
};

export function apiError(
  status: number,
  error: string,
  {
    problems = [],
    code,
    headers = NO_STORE,
  }: {
    problems?: string[];
    code?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  const body: ApiErrorBody = { error, problems, ...(code ? { code } : {}) };
  return Response.json(body, { status, headers });
}

type Read = { ok: true; value: unknown } | { ok: false; response: Response };
type ReadBytes =
  { ok: true; bytes: Uint8Array } | { ok: false; response: Response };

/**
 * The request's body, or the response refusing it when it is larger than
 * `maxBytes` (read no further than that).
 */
export async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<ReadBytes> {
  const tooLarge = {
    ok: false as const,
    response: apiError(413, "The request is too large."),
  };
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return tooLarge;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge;
      }
      chunks.push(value);
    }
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

/**
 * The request's JSON body, or the response refusing it: a type other than
 * JSON (which also means a plain HTML form on another site cannot send it),
 * a body over `maxBytes` (read no further than that), or invalid JSON.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<Read> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    return {
      ok: false,
      response: apiError(415, "Send the request as JSON."),
    };
  }
  const body = await readLimitedBody(request, maxBytes);
  if (!body.ok) return body;
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder().decode(body.bytes)),
    };
  } catch {
    return { ok: false, response: apiError(400, "The request is not JSON.") };
  }
}
