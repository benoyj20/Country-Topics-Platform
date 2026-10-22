import { describe, expect, it } from "vitest";

import { cookieSettings } from "@/auth/cookies";

describe("the site's cookies", () => {
  it("are __Host- and Secure over https and on localhost", () => {
    for (const site of [
      "https://countrytopics.example",
      "https://dev.countrytopics.example",
      "https://name.trycloudflare.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]) {
      expect(cookieSettings(site), site).toEqual({
        prefix: "__Host-countrytopics",
        secure: true,
      });
    }
  });

  it("are plain on another http address, where browsers refuse Secure ones", () => {
    expect(cookieSettings("http://192.168.1.20:3000")).toEqual({
      prefix: "countrytopics",
      secure: false,
    });
  });
});
