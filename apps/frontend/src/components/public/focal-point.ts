import type { PublicFile } from "@countrytopics/contracts";
import type { CSSProperties } from "react";

/**
 * Keeps a cropped image's subject in view: its focal point, set in the
 * admin, as the part of the image that `object-fit: cover` keeps.
 */
export function focalPosition(
  file: Pick<PublicFile, "focalX" | "focalY">,
): CSSProperties | undefined {
  return file.focalX === null || file.focalY === null
    ? undefined
    : { objectPosition: `${file.focalX}% ${file.focalY}%` };
}
