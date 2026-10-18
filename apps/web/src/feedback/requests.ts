import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_PAGE_MAX_LENGTH,
} from "@countrytopics/domain";
import * as z from "zod";

// What POST /api/v1/feedback accepts (ADR 0011). The rules in
// packages/domain (feedback.ts) then check the content.

/** A message's characters take up to 6 bytes each as JSON escapes. */
export const FEEDBACK_REQUEST_MAX_BYTES =
  FEEDBACK_MESSAGE_MAX_LENGTH * 6 + 2 * 1_024;

// Bounded before tidying, which can only shorten the text.
export const feedbackSchema = z
  .object({
    kind: z.enum(FEEDBACK_KINDS),
    message: z.string().max(FEEDBACK_MESSAGE_MAX_LENGTH * 2),
    page: z
      .string()
      .max(FEEDBACK_PAGE_MAX_LENGTH * 4)
      .nullable()
      .optional(),
  })
  .strict();
