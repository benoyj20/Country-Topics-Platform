import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_AFTER_SIGN_IN, safeCallbackPath } from "../src/index.ts";

const SITE = "http://localhost:3000";

describe("safeCallbackPath", () => {
  it("keeps paths on this site, with their query and fragment", () => {
    assert.equal(safeCallbackPath("/admin", SITE), "/admin");
    assert.equal(
      safeCallbackPath("/account?tab=security#code", SITE),
      "/account?tab=security#code",
    );
  });

  it("rejects anything that leaves the site", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "https://evil.example/account",
      "javascript:alert(1)",
      "account",
    ]) {
      assert.equal(safeCallbackPath(value, SITE), DEFAULT_AFTER_SIGN_IN, value);
    }
  });

  it("uses the default for missing or repeated values", () => {
    assert.equal(safeCallbackPath(undefined, SITE), DEFAULT_AFTER_SIGN_IN);
    assert.equal(safeCallbackPath(["/a", "/b"], SITE), DEFAULT_AFTER_SIGN_IN);
  });
});
