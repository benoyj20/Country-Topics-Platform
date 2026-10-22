"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { type FormEvent, useState } from "react";

import { authClient, verifyAdminCode } from "./client";

// The authenticator check staff pass before the admin opens (ADR 0010):
// set up an authenticator app if there is none yet, then confirm a code
// from it for this session. Used by the account page and the admin.

export type AuthenticatorSetup = { qrDataUrl: string; manualKey: string };

/** The `secret` parameter of an otpauth:// URI, for people who type it in. */
function manualKeyFrom(totpURI: string): string {
  return new URL(totpURI).searchParams.get("secret") ?? "";
}

export function useAuthenticatorCheck(twoFactorEnabled: boolean) {
  const router = useRouter();
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
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

  async function submitCode(event: FormEvent<HTMLFormElement>) {
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

  return {
    setup,
    code,
    /** Keeps digits only, as the code is typed. */
    setCode: (value: string) => setCode(value.replace(/\D/g, "")),
    busy,
    error,
    /** No authenticator app yet, and setup not started. */
    needsSetup: !twoFactorEnabled && !setup,
    startSetup,
    submitCode,
  };
}
