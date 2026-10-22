// Any address no other route answers (ADR 0014: the backend answers no
// HTML). Without this, Next.js would answer with its own HTML 404 page.

const NOT_FOUND = () =>
  Response.json(
    { error: "Nothing is at this address." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

export const GET = NOT_FOUND;
export const POST = NOT_FOUND;
export const PUT = NOT_FOUND;
export const PATCH = NOT_FOUND;
export const DELETE = NOT_FOUND;
