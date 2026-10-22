"use client";

import Link from "next/link";

import { useAuthenticatorCheck } from "@/auth/use-authenticator-check";

export function TwoFactorPanel({
  twoFactorEnabled,
  adminVerified,
}: {
  twoFactorEnabled: boolean;
  adminVerified: boolean;
}) {
  const {
    setup,
    code,
    setCode,
    busy,
    error,
    needsSetup,
    startSetup,
    submitCode,
  } = useAuthenticatorCheck(twoFactorEnabled);

  if (adminVerified) {
    return (
      <div className="panel stack">
        <h2>Admin panel</h2>
        <p className="muted">
          Your authenticator code is confirmed for this session.
        </p>
        <Link className="button" href="/admin">
          Open the admin panel
        </Link>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <h2>Admin panel</h2>
      {needsSetup ? (
        <>
          <p className="muted">
            Staff accounts need an authenticator app, such as Google
            Authenticator, Microsoft Authenticator, or 1Password, before they
            can open the admin panel.
          </p>
          <div>
            <button
              type="button"
              className="button"
              onClick={startSetup}
              disabled={busy}
            >
              Set up an authenticator app
            </button>
          </div>
        </>
      ) : (
        <>
          {setup ? (
            <>
              <p className="muted">
                Scan this code with your authenticator app, then enter the
                6-digit code it shows.
              </p>
              {/* A data URL generated in the browser; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                width={220}
                height={220}
                alt="QR code for your authenticator app"
              />
              <p className="muted">
                Can&apos;t scan it? Enter this key instead:{" "}
                <code>{setup.manualKey}</code>
              </p>
            </>
          ) : (
            <p className="muted">
              Enter the 6-digit code from your authenticator app to open the
              admin panel.
            </p>
          )}
          <form className="stack" onSubmit={submitCode}>
            <label htmlFor="code">Authenticator code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <div>
              <button type="submit" className="button" disabled={busy}>
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </form>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
