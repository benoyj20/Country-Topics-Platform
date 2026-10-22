"use client";

import type { Account } from "@countrytopics/contracts";
import { createContext, type ReactNode, useContext } from "react";

// The staff member signed in, for the admin's client parts that act as
// them, such as an editor's lock (AdminShell provides it). The backend's
// access rules still decide what they may do.

export type AdminAccount = Pick<Account, "id" | "email" | "role">;

const AdminAccountContext = createContext<AdminAccount | null>(null);

export function AdminAccountProvider({
  account,
  children,
}: {
  account: AdminAccount;
  children: ReactNode;
}) {
  return <AdminAccountContext value={account}>{children}</AdminAccountContext>;
}

/** The staff member signed in; null outside the admin's frame. */
export function useAdminAccount(): AdminAccount | null {
  return useContext(AdminAccountContext);
}
