import { isHttpUrl, URL_MAX_LENGTH } from "@countrytopics/domain";

const HTTP_URL_MESSAGE = `Enter a full link starting with https:// or http://, at most ${URL_MAX_LENGTH} characters.`;

/**
 * Validates a web link. A custom validate replaces Payload's own, so the
 * length is checked here as well as by maxLength.
 */
export function httpUrl(value: unknown): true | string {
  return typeof value === "string" &&
    value.length <= URL_MAX_LENGTH &&
    isHttpUrl(value)
    ? true
    : HTTP_URL_MESSAGE;
}

/** Validates a web link that may be left empty. */
export function optionalHttpUrl(value: unknown): true | string {
  return value === null || value === undefined || value === ""
    ? true
    : httpUrl(value);
}
