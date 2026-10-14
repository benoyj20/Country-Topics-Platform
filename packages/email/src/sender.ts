export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Sends one email. Implementations throw on failure so the queue can retry;
 * the worker is the only caller (AGENTS.md: slow work goes through the queue).
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
