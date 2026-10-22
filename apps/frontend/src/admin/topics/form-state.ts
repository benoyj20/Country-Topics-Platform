import { type TopicValues, topicSaveBody } from "@countrytopics/contracts";

import { valuesAfterAnswer as afterAnswer } from "../form-state.ts";

// The topic form's state between saves, besides what every editor's form
// does (../form-state.ts): whether anything is unsaved, and what is kept
// when a save is answered.

export { clearMessages, fieldMessages, moveRow } from "../form-state.ts";

/**
 * What the form would save, besides the body, for telling whether
 * anything changed since the last save.
 */
export function savedForm(values: TopicValues): string {
  return JSON.stringify(topicSaveBody({ ...values, body: null }, false));
}

/**
 * The form's values once a save is answered. When nothing changed while it
 * ran, what the backend stored (`stored`); otherwise what was typed since,
 * with the ids the backend gave rows that were new, so that saving again
 * does not add them twice.
 */
export function valuesAfterAnswer(
  current: TopicValues,
  sent: TopicValues,
  stored: TopicValues,
): TopicValues {
  return afterAnswer(current, sent, stored, savedForm);
}
