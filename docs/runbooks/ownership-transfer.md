# Ownership transfer runbook

The project starts on the developer's personal accounts (`benoyj20` on GitHub and a
personal Google account). This runbook lists every account, setting, and repository
reference tied to that owner, and the steps to move each one to the future project
or business owner.

**Keep it current.** Whenever a PR adds an external service, an account, a GitHub
setting, or an environment variable that holds a credential, add it to the inventory
below in the same PR. Never record passwords, keys, or secrets here; name the
`.env` variable instead.

## Account inventory

| Service | Used for | Owner today | Since | Depends on it | Transfer method |
| --- | --- | --- | --- | --- | --- |
| GitHub repository `benoyj20/Country-Topics-Platform` | Code, PRs, CI | `benoyj20` (personal) | 2026-10-13 | Everything | [GitHub](#1-github) |
| GitHub "Protect main" ruleset and merge settings | Branch protection, squash-only merges | Part of the repository | 2026-10-14 | Merge flow | Moves with the repository |
| GitHub Actions (CI) | `javascript`, `infrastructure` checks | Part of the repository | 2026-10-14 | Required checks | Moves with the repository; no Actions secrets yet |
| GitGuardian GitHub App | `GitGuardian Security Checks` (required) | Installed on `benoyj20` | 2026-10-14 | Required check on `main` | [GitGuardian](#2-gitguardian) |
| GitGuardian dashboard account | Secret-scanning workspace | Signed in with `benoyj20` | 2026-10-14 | GitGuardian checks | [GitGuardian](#2-gitguardian) |
| Google Cloud project (the project number is the digits at the start of `GOOGLE_CLIENT_ID`) | APIs and OAuth | Personal Google account | 2026-10-14 | YouTube key, Google sign-in | [Google Cloud](#3-google-cloud) |
| YouTube Data API v3 key (restricted to that API) | Video metadata and embeddable checks | In the Google Cloud project | 2026-10-14 | `YOUTUBE_API_KEY` | Stays with the project; rotate after transfer |
| Google OAuth web client, consent screen in Testing mode | "Sign in with Google" | In the Google Cloud project | 2026-10-14 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; origin `http://localhost:3000`, redirect `http://localhost:3000/api/auth/callback/google`; test users | Stays with the project; reset the secret after transfer |
| Email provider (Brevo or Resend, not chosen) | Magic-link and notification email for the pilot | Personal (planned) | Not set up | `SMTP_URL` (Mailpit locally) | [Email provider](#4-email-provider) |
| Cloudflare | Turnstile (week 10), tunnel and CDN (week 12) | Personal (planned) | Not set up | Turnstile site and secret keys, tunnel token (names added when built) | [Cloudflare](#5-cloudflare-and-domain) |
| Domain (optional) | Stable pilot address | Not bought | — | Cloudflare, OAuth redirect URLs | [Domain](#5-cloudflare-and-domain) |
| Object storage (Cloudflare R2 or S3, planned) | Uploads (week 5) and backups (week 11) | Not set up | — | Storage credentials (names added when built) | [Other services](#6-other-services) |
| Sentry (planned, week 11) | Error tracking | Not set up | — | Sentry DSN (name added when built) | [Other services](#6-other-services) |
| Cloud free tiers for the scale rehearsal (planned, week 11) | Managed PostgreSQL, Redis, container host | Not set up | — | Deployment configuration | [Other services](#6-other-services) |

Do **not** create these on a personal account; set them up directly under the
project or business owner when the roadmap reaches them: Stripe, Patreon, Buy Me a
Coffee, Google AdSense / Ad Manager, and any paid hosting or cloud billing account.

## Repository references to the owner

Change these through a normal PR after the GitHub transfer:

| File | Reference | Change to |
| --- | --- | --- |
| `.github/CODEOWNERS` | `* @benoyj20` | The new owner or organisation team |
| `AGENTS.md` | "the repository owner `benoyj20`" | The new owner |
| `CONTRIBUTING.md` | "one developer (`benoyj20`)" | The new owner |
| `docs/runbooks/ownership-transfer.md` | The introduction, the repository name, the GitGuardian rows, step 2.4, and the "Owner today" column | The new owner and repository name |

Git history keeps the original author names and emails; that is expected and is not
changed.

## Transfer steps

Do them in this order, except the domain transfer (step 5.3): start that first,
because it can take several days. Before starting, give the new account two-factor
authentication and access to a password manager.

### 1. GitHub

1. Optional but recommended: create a GitHub organisation for the project under the
   new owner. Organisations allow more admins later.
2. Repository **Settings**, **General**, **Danger Zone**, **Transfer ownership**:
   enter the new owner or organisation and confirm. Old URLs redirect.
3. Check that the **Protect main** ruleset came across (**Settings**, **Rules**,
   **Rulesets**), and that squash-only merging and "Automatically delete head
   branches" are still set (**Settings**, **General**, **Pull Requests**). The
   ruleset's admin bypass is by role, so it applies to the new owner's admins.
4. Reinstall the GitGuardian app on the new owner (step 2 below) before the next
   merge; the required `GitGuardian Security Checks` check blocks merging until it
   reports again.
5. Old URLs redirect, but update each clone so it does not depend on the redirect:
   `git remote set-url origin https://github.com/<new-owner>/Country-Topics-Platform.git`
   (or `git@github.com:<new-owner>/Country-Topics-Platform.git` for SSH clones).
6. Open a PR that updates the files in the table above.

### 2. GitGuardian

1. With the new GitHub owner, install the app from
   https://github.com/apps/gitguardian and select this repository.
2. Sign in to https://dashboard.gitguardian.com with the new owner and confirm the
   repository is monitored.
3. Push to a PR and confirm `GitGuardian Security Checks` reports. If the required
   check stops matching (new app installation), update the "Protect main" ruleset.
4. Uninstall the app from `benoyj20` once the new installation works.

### 3. Google Cloud

1. **IAM and Admin**, **IAM**, **Grant access**: add the new Google account as
   **Owner**. Accept the invitation from the new account.
2. If the new owner has a Google Workspace or Cloud Identity organisation, move the
   project into it (**IAM and Admin**, **Settings**, **Migrate**).
3. **Google Auth Platform**, **Branding**: change the support and developer contact
   emails to the new owner's address. Under **Audience**, review the test users.
   Under **Clients**, check the authorised origins and redirect URLs still match
   the site's address.
4. If a billing account is ever linked, link the new owner's billing account.
5. Rotate credentials the previous owner had: create a new YouTube API key (same
   restrictions) and reset the OAuth client secret. Update `.env` and any deployment
   secrets, then delete the old key.
6. Remove the personal account from IAM.

### 4. Email provider

1. Either change the provider account's login email to the new owner's address, or
   create a new account under the new owner.
2. Verify the sender address the site uses (it should be a project address, not a
   personal one).
3. Create a new SMTP key, update `SMTP_URL` wherever the pilot or production
   configuration sets it, and delete the old key.

### 5. Cloudflare and domain

1. Add the new owner as a member of the Cloudflare account, or move the zone to the
   new owner's account.
2. Recreate the tunnel under the new account and update its token wherever it is
   stored. Create new Turnstile keys under the new account, update them, and delete
   the old ones.
3. Transfer the domain registration to the new owner's registrar account; this can
   take several days, so start it early.
4. If the site address changes, update the OAuth client's origins and redirect
   URLs as in step 3.3.

### 6. Other services

For storage, Sentry, and cloud hosting accounts: add the new owner as an admin or
move the project or bucket to the new owner's account, create new credentials,
update the configuration, and delete the old credentials. Copy backups before
closing any old storage account.

### 7. After every step

- Run the PR checks and open the site to confirm logins, email, and video checks
  still work.
- Record the change in the log below.

## Transfer log

| Date | Service | From | To | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
