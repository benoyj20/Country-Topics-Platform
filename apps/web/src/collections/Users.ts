import type { CollectionConfig } from "payload";

// Staff accounts for the admin panel. Member sign-in (Google, email link) and
// roles arrive in MVP week 2.
export const Users: CollectionConfig = {
  slug: "users",
  admin: { useAsTitle: "email" },
  auth: true,
  fields: [],
};
