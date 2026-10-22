import {
  type CollectionSlug,
  type PayloadRequest,
  ValidationError,
} from "payload";

/**
 * Refuses a save with a message on one field, shown next to that field in
 * the admin panel, as Payload's own validation does.
 */
export function refuse(
  collection: CollectionSlug,
  req: PayloadRequest,
  path: string,
  label: string,
  message: string,
): never {
  throw new ValidationError({
    collection,
    errors: [{ path, label, message }],
    req,
  });
}
