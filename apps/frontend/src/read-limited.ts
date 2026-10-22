/**
 * A request's or response's body, or null when it is larger than
 * `maxBytes`: nothing past the limit is read.
 */
export async function readLimited(
  message: Request | Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(message.headers.get("content-length")) > maxBytes) return null;
  if (!message.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = message.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body;
}
