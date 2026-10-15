/**
 * F3 topic workflow: draft → in review → published → updated / archived.
 * Content versions are kept by Payload (drafts and published versions); these
 * rules decide the state a save leads to and what the public change log says.
 */
export const TOPIC_STATES = [
  "draft",
  "in_review",
  "published",
  "updated",
  "archived",
] as const;
export type TopicState = (typeof TOPIC_STATES)[number];

/** How a topic is linked to an individual (F2). */
export const TOPIC_PERSON_ROLES = [
  "subject",
  "speaker",
  "source",
  "mentioned",
] as const;
export type TopicPersonRole = (typeof TOPIC_PERSON_ROLES)[number];

/** The kinds of entry in a topic's public change log. */
export type TopicChangeKind = "published" | "updated" | "archived" | "restored";

export type TopicSave = {
  /** This save publishes (rather than saving a draft). */
  publishing: boolean;
  /** A version of the topic was published before this save. */
  previouslyPublished: boolean;
  /** The currently published version is archived. */
  previouslyArchived: boolean;
  /** The saved version is archived. */
  archived: boolean;
  /** The admin marked the draft ready for review. */
  readyForReview: boolean;
};

/**
 * The state after a save, or `null` to keep the current one: a draft of a
 * published topic does not change what visitors see, so its state stays.
 */
export function topicStateAfterSave(save: TopicSave): TopicState | null {
  if (save.publishing) {
    if (save.archived) return "archived";
    return save.previouslyPublished ? "updated" : "published";
  }
  if (save.previouslyPublished) return null;
  return save.readyForReview ? "in_review" : "draft";
}

/** The change log entry a publish adds; drafts add none. */
export function topicChangeKind(save: TopicSave): TopicChangeKind | null {
  if (!save.publishing) return null;
  if (!save.previouslyPublished)
    return save.archived ? "archived" : "published";
  if (save.archived && !save.previouslyArchived) return "archived";
  if (!save.archived && save.previouslyArchived) return "restored";
  return "updated";
}

/**
 * Every publish after the first needs a note saying what changed and why; it
 * becomes the public change log entry.
 */
export function changeNoteRequired(save: TopicSave): boolean {
  return save.publishing && save.previouslyPublished;
}
