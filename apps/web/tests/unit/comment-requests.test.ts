import { describe, expect, it } from "vitest";

import { readJsonBody } from "@/api/json";
import {
  decodeCommentCursor,
  encodeCommentCursor,
  InvalidCommentCursorError,
} from "@/comments/cursor";
import { parseIds, parseListParams } from "@/comments/requests";
import { VIEWER_IDS_MAX } from "@/comments/store";

const ID = "01890000-0000-7000-8000-000000000001";
const AT = "2026-10-17T12:00:00.000Z";

describe("parseListParams", () => {
  const parse = (search: string, sorted = true) =>
    parseListParams(new URLSearchParams(search), { sorted });

  it("reads the sort and cursor, leaving the default out of the address", () => {
    expect(parse("sort=new&cursor=abc")).toMatchObject({
      sort: "new",
      cursor: "abc",
      problems: [],
    });
    const top = parse("sort=top");
    expect(top.sort).toBe("top");
    expect(top.canonical.toString()).toBe("");
    expect(parse("cursor=abc&sort=old").canonical.toString()).toBe(
      "sort=old&cursor=abc",
    );
  });

  it("names unknown, repeated, and invalid parameters", () => {
    expect(parse("page=2").problems).toEqual(['"page" is not a parameter.']);
    expect(parse("sort=new&sort=old").problems).toEqual([
      '"sort" was given more than once.',
    ]);
    expect(parse("sort=best").problems).toEqual([
      '"best" is not a way to sort comments.',
    ]);
    expect(parse("sort=new", false).problems).toEqual([
      '"sort" is not a parameter.',
    ]);
  });
});

describe("parseIds", () => {
  it("reads comment ids and refuses anything else", () => {
    expect(parseIds(`${ID},${ID}`)).toEqual({ ids: [ID] });
    expect(parseIds(null)).toEqual({ ids: [] });
    expect(parseIds("1,2")).toHaveProperty("problem");
    const many = Array.from(
      { length: VIEWER_IDS_MAX + 1 },
      (_, index) =>
        `01890000-0000-7000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(parseIds(many.join(","))).toHaveProperty("problem");
  });
});

describe("comment cursors", () => {
  it("round-trip for the list they were made for", () => {
    const cursor = encodeCommentCursor("top", [3, AT, ID]);
    expect(decodeCommentCursor("top", cursor)).toEqual([3, AT, ID]);
  });

  it("are refused for another list or when tampered with", () => {
    const cursor = encodeCommentCursor("new", [AT, ID]);
    expect(() => decodeCommentCursor("old", cursor)).toThrow(
      InvalidCommentCursorError,
    );
    expect(() => decodeCommentCursor("replies", "not json")).toThrow(
      InvalidCommentCursorError,
    );
    const forged = Buffer.from(
      JSON.stringify({ l: "new", k: ["'; DROP TABLE comments; --", ID] }),
    ).toString("base64url");
    expect(() => decodeCommentCursor("new", forged)).toThrow(
      InvalidCommentCursorError,
    );
    expect(() => decodeCommentCursor("new", "a".repeat(201))).toThrow(
      InvalidCommentCursorError,
    );
  });
});

describe("readJsonBody", () => {
  const send = (body: string, type = "application/json") =>
    new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "content-type": type },
      body,
    });

  it("reads JSON", async () => {
    expect(await readJsonBody(send('{"a":1}'), 100)).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("refuses other types, invalid JSON, and bodies over the limit", async () => {
    const status = async (request: Request, limit = 100) => {
      const read = await readJsonBody(request, limit);
      return read.ok ? 200 : read.response.status;
    };
    expect(await status(send("a=1", "application/x-www-form-urlencoded"))).toBe(
      415,
    );
    expect(await status(send("{", "application/json; charset=utf-8"))).toBe(
      400,
    );
    expect(await status(send(JSON.stringify({ a: "x".repeat(200) })))).toBe(
      413,
    );
  });

  it("stops reading a stream that goes past the limit", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(64));
      },
    });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const read = await readJsonBody(request, 1_000);
    expect(read.ok ? 200 : read.response.status).toBe(413);
    expect(pulled).toBeLessThan(20);
  });
});
