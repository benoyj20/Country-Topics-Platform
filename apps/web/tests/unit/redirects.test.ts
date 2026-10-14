import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_SIGN_IN, safeCallbackPath } from "@/auth/redirects";

const SITE = "http://localhost:3000";

describe("safeCallbackPath", () => {
  it("keeps paths on this site, with their query and fragment", () => {
    expect(safeCallbackPath("/admin", SITE)).toBe("/admin");
    expect(safeCallbackPath("/account?tab=security#code", SITE)).toBe(
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
      expect(safeCallbackPath(value, SITE), value).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it("uses the default for missing or repeated values", () => {
    expect(safeCallbackPath(undefined, SITE)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeCallbackPath(["/a", "/b"], SITE)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
