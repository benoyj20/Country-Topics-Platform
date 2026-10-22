"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";

import { authClient, verifyAdminCode } from "@/auth/client";

type Setup = { qrDataUrl: string; manualKey: string };

/** The `secret` parameter of an otpauth:// URI, for people who type it in. */
function manualKeyFrom(totpURI: string): string {
  return new URL(totpURI).searchParams.get("secret") ?? "";
}

export function TwoFactorPanel({
  twoFactorEnabled,
  adminVerified,
}: {
  twoFactorEnabled: boolean;
  adminVerified: boolean;
}) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true);
    setError(null);
    const { data, error: enableError } = await authClient.twoFactor.enable({
      method: "totp",
    });
    setBusy(false);
    if (enableError || !data || data.method !== "totp") {
      setError(enableError?.message ?? "Setup could not start. Try again.");
      return;
    }
    setSetup({
      qrDataUrl: await QRCode.toDataURL(data.totpURI, {
        margin: 1,
        width: 220,
      }),
      manualKey: manualKeyFrom(data.totpURI),
    });
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (setup) {
      // Finishing setup proves the app works and turns two-factor on.
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code,
      });
      if (verifyError) {
        setBusy(false);
        setError(verifyError.message ?? "That code is not right. Try again.");
        return;
      }
    }
    const result = await verifyAdminCode(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSetup(null);
    setCode("");
    router.refresh();
  }

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

  const needsSetup = !twoFactorEnabled && !setup;

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
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
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
