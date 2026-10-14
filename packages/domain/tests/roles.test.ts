import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_VERIFICATION_MAX_AGE_MS,
  canEnterAdminPanel,
  isRole,
  isStaff,
} from "../src/roles.ts";

const now = new Date("2026-10-15T12:00:00Z");
const verifiedJustNow = new Date(now.getTime() - 60_000);

describe("canEnterAdminPanel", () => {
  it("admits staff whose session passed the authenticator check", () => {
    for (const role of ["admin", "moderator"] as const) {
      assert.equal(
        canEnterAdminPanel(
          {
            role,
            twoFactorEnabled: true,
            twoFactorVerifiedAt: verifiedJustNow,
          },
          now,
        ),
        true,
      );
    }
  });

  it("refuses members even with a verified authenticator", () => {
    assert.equal(
      canEnterAdminPanel(
        {
          role: "member",
          twoFactorEnabled: true,
          twoFactorVerifiedAt: verifiedJustNow,
        },
        now,
      ),
      false,
    );
  });

  it("refuses staff without an authenticator or without a check this session", () => {
    assert.equal(
      canEnterAdminPanel(
        {
          role: "admin",
          twoFactorEnabled: false,
          twoFactorVerifiedAt: verifiedJustNow,
        },
        now,
      ),
      false,
    );
    assert.equal(
      canEnterAdminPanel(
        { role: "admin", twoFactorEnabled: true, twoFactorVerifiedAt: null },
        now,
      ),
      false,
    );
  });

  it("expires the check after the maximum age, and rejects future timestamps", () => {
    const atLimit = new Date(now.getTime() - ADMIN_VERIFICATION_MAX_AGE_MS);
    const pastLimit = new Date(atLimit.getTime() - 1);
    const future = new Date(now.getTime() + 60_000);
    const access = (twoFactorVerifiedAt: Date) => ({
      role: "admin" as const,
      twoFactorEnabled: true,
      twoFactorVerifiedAt,
    });

    assert.equal(canEnterAdminPanel(access(atLimit), now), true);
    assert.equal(canEnterAdminPanel(access(pastLimit), now), false);
    assert.equal(canEnterAdminPanel(access(future), now), false);
  });
});

describe("role helpers", () => {
  it("recognises only known roles", () => {
    assert.equal(isRole("moderator"), true);
    assert.equal(isRole("subscriber"), false);
    assert.equal(isRole(undefined), false);
  });

  it("treats moderators and admins as staff", () => {
    assert.deepEqual((["member", "moderator", "admin"] as const).map(isStaff), [
      false,
      true,
      true,
    ]);
  });
});
