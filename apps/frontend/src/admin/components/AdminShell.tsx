import type { Account, AdminCollection } from "@countrytopics/contracts";
import { ROLE_LABELS } from "@countrytopics/domain";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/SignOutButton";

import { AdminAccountProvider } from "../account-context";
import { ADMIN_GROUPS, COLLECTION_TEXT } from "../collections";
import { readableIn } from "../gate";
import { NavToggle } from "./NavToggle";
import { RefreshSession } from "./RefreshSession";

/**
 * Every admin screen's frame: the header, and, for staff who passed the
 * gate, the collections grouped as Payload's panel groups them. Lists an
 * account may not read are left out; the backend refuses them anyway.
 */
export function AdminShell({
  account,
  current,
  children,
}: {
  /** Staff who passed the gate; the navigation is shown only to them. */
  account?: Account;
  /** The collection on screen, marked in the navigation. */
  current?: AdminCollection;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#main">
        Skip to content
      </a>
      <header className="admin-header">
        <Link href="/admin" className="admin-name">
          Country Topics admin
        </Link>
        <div className="admin-header-tools">
          {account && (
            <span className="admin-muted">
              {account.email} ({ROLE_LABELS[account.role]})
            </span>
          )}
          <Link href="/">View the site</Link>
          {account && <SignOutButton className="admin-button secondary" />}
          {account && <NavToggle />}
          {account && <RefreshSession />}
        </div>
      </header>
      <div className={account ? "admin-frame" : "admin-frame single"}>
        {account && (
          <nav id="admin-nav" className="admin-nav" aria-label="Collections">
            {ADMIN_GROUPS.map((group) => {
              const collections = readableIn(group, account);
              return (
                <div key={group} className="admin-nav-group">
                  <h2>{group}</h2>
                  <ul>
                    {collections.map((collection) => (
                      <li key={collection}>
                        <Link
                          href={`/admin/collections/${collection}`}
                          aria-current={
                            collection === current ? "page" : undefined
                          }
                        >
                          {COLLECTION_TEXT[collection].plural}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        )}
        <main id="main" className="admin-main" tabIndex={-1}>
          {account ? (
            <AdminAccountProvider
              account={{
                id: account.id,
                email: account.email,
                role: account.role,
              }}
            >
              {children}
            </AdminAccountProvider>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
