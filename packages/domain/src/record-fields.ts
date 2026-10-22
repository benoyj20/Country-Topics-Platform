// The limits and messages of the records topics are built from, shared by
// the backend's collections (apps/web/src/collections) and the admin's
// editors, so both refuse the same things with the same words.

export const CATEGORY_NAME_MAX_LENGTH = 80;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 500;
export const TAG_NAME_MAX_LENGTH = 60;

export const PERSON_NAME_MAX_LENGTH = 200;
export const PERSON_ALIASES_MAX = 20;
export const PERSON_SUMMARY_MAX_LENGTH = 160;
export const PERSON_COUNTRY_ROLE_MAX_LENGTH = 120;
export const PERSON_BIO_MAX_LENGTH = 5000;
export const STATEMENT_MAX_LENGTH = 1000;
export const PERSON_LINK_LABEL_MAX_LENGTH = 120;
/** The box an admin ticks when a possible duplicate is another person. */
export const DIFFERENT_PERSON_LABEL = "This is a different person";

export const REFERENCE_TITLE_MAX_LENGTH = 500;
export const REFERENCE_AUTHORS_MAX_LENGTH = 2000;
/** A reference's journal, book, or website, and its publisher. */
export const REFERENCE_SOURCE_MAX_LENGTH = 300;

/** A file's description and its credit. */
export const MEDIA_TEXT_MAX_LENGTH = 300;
/** Larger files belong on their publisher's site, linked and archived. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_TOO_LARGE_MESSAGE = "Files can be at most 20 MB.";

export const SNIPPET_CAPTION_MAX_LENGTH = 200;

/** What a date that is not YYYY, YYYY-MM, or YYYY-MM-DD is told. */
export const PARTIAL_DATE_MESSAGE =
  "Use YYYY, YYYY-MM, or YYYY-MM-DD, only as precise as the source.";
