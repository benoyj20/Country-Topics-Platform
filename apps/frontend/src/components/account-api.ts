import type { FeedbackKind } from "@countrytopics/domain";

import { call } from "./comments/comments-api";

// The browser's side of the account deletion and feedback routes (ADR
// 0011). Each call throws CommentApiError with the message to show.

/** Deletes the signed-in member's account; `email` confirms it. */
export async function deleteAccount(email: string): Promise<void> {
  await call<{ deleted: true }>(
    "/api/v1/account",
    "Your account could not be deleted.",
    { method: "DELETE", json: { email } },
  );
}

export async function sendFeedback(feedback: {
  kind: FeedbackKind;
  message: string;
  page: string | null;
}): Promise<void> {
  await call<{ sent: true }>(
    "/api/v1/feedback",
    "Your feedback could not be sent.",
    { method: "POST", json: feedback },
  );
}
