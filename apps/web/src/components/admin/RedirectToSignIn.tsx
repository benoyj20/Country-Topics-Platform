import { redirect } from "next/navigation";

/** Payload's login screen sends staff to the site's sign-in page. */
export function RedirectToSignIn(): never {
  redirect("/sign-in?callbackURL=%2Faccount");
}
