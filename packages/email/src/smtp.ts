import { createTransport } from "nodemailer";

import type { EmailMessage, EmailSender } from "./sender.ts";

/** Bounds each SMTP stage so a stuck server fails the job instead of hanging it. */
export const SMTP_TIMEOUT_MS = 10_000;

export type SmtpSenderOptions = {
  /** For example `smtp://localhost:1025` (Mailpit) or a provider's `smtps://` URL. */
  smtpUrl: string;
  /** The From header, such as `Country Topics <no-reply@example.org>`. */
  from: string;
};

/** Sends email through any SMTP server: Mailpit locally, Brevo or Resend later. */
export function createSmtpSender({
  smtpUrl,
  from,
}: SmtpSenderOptions): EmailSender {
  const transport = createTransport({
    url: smtpUrl,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return {
    async send(message: EmailMessage) {
      await transport.sendMail({ from, ...message });
    },
  };
}
