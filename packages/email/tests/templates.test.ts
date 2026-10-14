import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeHtml, magicLinkEmail } from "../src/templates.ts";

describe("magicLinkEmail", () => {
  it("includes the link and its expiry in both text and HTML", () => {
    const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc";
    const message = magicLinkEmail({
      to: "a@example.test",
      url,
      expiresInMinutes: 10,
    });

    assert.equal(message.to, "a@example.test");
    assert.match(message.text, /token=abc/);
    assert.match(message.text, /expires in 10 minutes/);
    assert.match(
      message.html,
      /href="http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?token=abc"/,
    );
  });

  it("escapes the link in HTML so it cannot break out of the attribute", () => {
    const message = magicLinkEmail({
      to: "a@example.test",
      url: 'http://x.test/?a=1&b="><script>',
      expiresInMinutes: 10,
    });

    assert.doesNotMatch(message.html, /<script>/);
    assert.match(message.html, /a=1&amp;b=&quot;&gt;&lt;script&gt;/);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  });
});
