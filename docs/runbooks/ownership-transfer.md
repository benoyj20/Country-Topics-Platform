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
| Google Cloud project `country-topics` | APIs and OAuth | Personal Google account | Week 0 (pending) | YouTube key, Google sign-in | [Google Cloud](#3-google-cloud) |
| YouTube Data API v3 key | Video metadata and embeddable checks | In the Google Cloud project | Week 0 (pending) | `YOUTUBE_API_KEY` | Stays with the project; rotate after transfer |
| Google OAuth client `country-topics-local` | "Sign in with Google" | In the Google Cloud project | Week 0 (pending) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (added in week 2) | Stays with the project; reset the secret after transfer |
| Brevo | Magic-link and notification email for the pilot | Personal (planned) | Not set up | `PILOT_SMTP_URL` (planned) | [Brevo](#4-brevo) |
| Cloudflare | Tunnel, CDN, Turnstile for the pilot | Personal (planned) | Not set up | Week 12 | [Cloudflare](#5-cloudflare-and-domain) |
| Domain (optional) | Stable pilot address | Not bought | — | Cloudflare, OAuth redirect URLs | [Domain](#5-cloudflare-and-domain) |

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
| `docs/runbooks/ownership-transfer.md` | "Owner today" column | Fill in the new owner per service |

Git history keeps the original author names and emails; that is expected and is not
changed.

## Transfer steps

Do them in this order. Before starting, give the new account two-factor
authentication and access to a password manager.

### 1. GitHub

1. Optional but recommended: create a GitHub organisation for the project under the
   new owner. Organisations allow more admins later.
2. Repository **Settings**, **General**, **Danger Zone**, **Transfer ownership**:
   enter the new owner or organisation and confirm. Old URLs redirect.
3. Check that the **Protect main** ruleset, squash-only merge settings, and
   "delete branch on merge" came across (**Settings**, **Rules**, **Rulesets**). The
   ruleset's admin bypass is by role, so it applies to the new owner's admins.
4. Reinstall the GitGuardian app on the new owner (step 2 below) before the next
   merge; the required `GitGuardian Security Checks` check blocks merging until it
   reports again.
5. On every clone: `git remote set-url origin https://github.com/<new-owner>/Country-Topics-Platform.git`.
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
4. If a billing account is ever linked, link the new owner's billing account.
5. Rotate credentials the previous owner had: create a new YouTube API key (same
   restrictions) and reset the OAuth client secret. Update `.env` and any deployment
   secrets, then delete the old key.
6. Remove the personal account from IAM.

### 4. Brevo

1. Either change the account's login email to the new owner's address, or create a
   new Brevo account under the new owner.
2. Verify the sender address the site uses (it should be a project address, not a
   personal one).
3. Create a new SMTP key, update `PILOT_SMTP_URL`, and delete the old key.

### 5. Cloudflare and domain

1. Add the new owner as a member of the Cloudflare account, or move the zone to the
   new owner's account.
2. Recreate the tunnel under the new account and update its token wherever it is
   stored.
3. Transfer the domain registration to the new owner's registrar account; this can
   take several days, so start it early.
4. Update the Google OAuth redirect URLs if the site address changes.

### 6. After every step

- Run the PR checks and open the site to confirm logins, email, and video checks
  still work.
- Record the change in the log below.

## Transfer log

| Date | Service | From | To | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
