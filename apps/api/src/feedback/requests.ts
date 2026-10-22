import { FEEDBACK_MESSAGE_MAX_LENGTH } from "@countrytopics/domain";

// What POST /api/v1/feedback accepts (ADR 0011) is in packages/contracts
// (members.ts); the rules in packages/domain (feedback.ts) then check the
// content.

/** A message's characters take up to 6 bytes each as JSON escapes. */
export const FEEDBACK_REQUEST_MAX_BYTES =
  FEEDBACK_MESSAGE_MAX_LENGTH * 6 + 2 * 1_024;
