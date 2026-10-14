import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideSignUp, normalizeEmail } from "../src/sign-up.ts";

const inviteOnly = { inviteOnly: true, adminEmails: ["owner@example.test"] };

describe("decideSignUp", () => {
  it("makes bootstrap admin addresses admins, ignoring case and spaces", () => {
    assert.deepEqual(decideSignUp("  Owner@Example.TEST ", null, inviteOnly), {
      allowed: true,
      role: "admin",
    });
  });

  it("gives invited addresses the invitation's role", () => {
    assert.deepEqual(
      decideSignUp("mod@example.test", "moderator", inviteOnly),
      {
        allowed: true,
        role: "moderator",
      },
    );
  });

  it("refuses uninvited addresses while invite-only", () => {
    assert.deepEqual(decideSignUp("stranger@example.test", null, inviteOnly), {
      allowed: false,
      reason: "not_invited",
    });
  });

  it("lets anyone join as a member when invite-only is off", () => {
    assert.deepEqual(
      decideSignUp("stranger@example.test", null, {
        ...inviteOnly,
        inviteOnly: false,
      }),
      { allowed: true, role: "member" },
    );
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  A.B@Example.Test\n"), "a.b@example.test");
  });
});
