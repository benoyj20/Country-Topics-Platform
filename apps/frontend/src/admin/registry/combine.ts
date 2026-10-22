// The registries combine each feature's part into one object. Spreading
// them would let a later feature silently replace an earlier one's
// collection, so combine() refuses two features claiming one key as the
// registry loads: the build, the tests, and every page would fail.

/** The type of every part's keys together. */
type Combined<Parts> = (
  Parts extends unknown ? (part: Parts) => void : never
) extends (part: infer All) => void
  ? All
  : never;

/** The features' parts as one object; throws if two of them name one key. */
export function combine<Parts extends Record<string, object>>(
  registry: string,
  parts: Parts,
): Combined<Parts[keyof Parts]> {
  const combined: Record<string, unknown> = {};
  const owners = new Map<string, string>();
  for (const [feature, part] of Object.entries(parts)) {
    for (const [key, value] of Object.entries(part)) {
      const owner = owners.get(key);
      if (owner) {
        throw new Error(
          `${registry}: both ${owner} and ${feature} claim ${key}.`,
        );
      }
      owners.set(key, feature);
      combined[key] = value;
    }
  }
  // Every part's own entries, each kept once: the intersection of their
  // types, which TypeScript cannot follow through the loop above.
  return combined as Combined<Parts[keyof Parts]>;
}
