"use client";

import { useAuthenticatorCheck } from "@/auth/use-authenticator-check";

/**
 * The authenticator check, in the admin: staff set up an app if they have
 * none, then confirm a code, and the page opens (ADR 0010).
 */
export function AdminVerification({
  twoFactorEnabled,
}: {
  twoFactorEnabled: boolean;
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

  return (
    <section className="admin-card narrow admin-stack">
      <h1>Confirm your authenticator code</h1>
      {needsSetup ? (
        <>
          <p>
            Staff accounts need an authenticator app, such as Google
            Authenticator, Microsoft Authenticator, or 1Password, before the
            admin opens.
          </p>
          <div>
            <button
              type="button"
              className="admin-button"
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
              <p>
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
              <p className="admin-muted">
                Can&apos;t scan it? Enter this key instead:{" "}
                <code>{setup.manualKey}</code>
              </p>
            </>
          ) : (
            <p>
              Staff confirm a code from their authenticator app before the admin
              opens, at least every 12 hours.
            </p>
          )}
          <form className="admin-stack" onSubmit={submitCode}>
            <label htmlFor="admin-code">Authenticator code</label>
            <input
              id="admin-code"
              className="admin-input code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <div>
              <button type="submit" className="admin-button" disabled={busy}>
                {busy ? "Checking…" : "Confirm"}
              </button>
            </div>
          </form>
        </>
      )}
      {error && (
        <p className="admin-notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
