# Contributing to Country Topics Platform

Read [AGENTS.md](AGENTS.md) for repository-wide engineering rules; coding agents
follow it too. Use the [project checklist](docs/project-checklist.md) to tell
working features from planned work, and the [MVP plan](docs/mvp-plan.md) for what
comes next.

This is a solo project: one developer (`benoyj20`) working with coding agents.
The workflow below still uses branches, PRs, and CI so that `main` always works
and every change can be reverted on its own.

## Setup

Install Node.js 22.18 or later, Docker Desktop, Git, and the GitHub CLI (`gh`).
pnpm is provided by Corepack: run `corepack enable` once, and the version pinned
in `package.json` is used automatically.

Run `make env`: it creates `.env` from `.env.example`, or adds the variables an
existing `.env` is missing (generating `PAYLOAD_SECRET`), and never changes values
already set. Then run `make bootstrap`, `make infra-up`, and `make migrate`, and
start the site and the email worker with `make dev`. Never commit `.env`, credentials, or local `.data/`
files.

Schema changes go through committed migrations (Payload's automatic schema push is
off): change a collection, run `pnpm --filter @countrytopics/web migrate:create
<name>` and `make generate`, and commit the migration and generated files. CI fails
if they do not match the config.

## Start a task

1. Pick one focused task, normally one item from the MVP plan or checklist.
2. Preserve local work, fetch `origin`, and branch from the latest `origin/main`:

   ```sh
   git fetch origin
   git switch -c feature/country-filters origin/main
   git branch --unset-upstream
   ```

   Unsetting the upstream stops `git push` from targeting `main`; the first
   `git push -u origin HEAD` then tracks the task branch.
3. Name branches `<type>/<short-description>` in lowercase with hyphens:
   `feature/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`, or `chore/…`.
4. Write commit titles as `<type>: <specific change>`, for example
   `fix: stop snippets at their end time`. Avoid unrelated formatting, empty
   commits, and pushes after every edit.

## Keep history tidy

Use one branch and one PR per task. Put related fixes and review changes in the
open PR instead of opening new ones. Push at verified milestones.

Before pushing, review `git diff origin/main...HEAD` and
`git log --oneline origin/main..HEAD`. Use a specific, behavior-focused PR title,
such as `feature: filter topics by country and category`.

Merges are **squash only**, so each PR becomes one commit on `main` titled with
the PR title. Start the next task from the latest `origin/main`, not from the
merged branch.

## Verify before pushing

The exact CI baseline is in [ci.yaml](.github/workflows/ci.yaml).

| Area | Local verification |
| --- | --- |
| JavaScript/TypeScript | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm build` (or `make check`) |
| Infrastructure | `docker compose -f deploy/compose/compose.yaml config --quiet` with a local `.env` |
| Database changes | `make test-int`: rebuilds the `TEST_DATABASE_URL` database (its name must end in `_test`) from the migrations and runs the integration tests; never point it at development data |
| Documentation only | Check accuracy, referenced paths, and Markdown formatting |

For UI changes, check the affected flow in a browser at mobile (360–390 px),
tablet (768 px), desktop (1280–1440 px), and 200% zoom. Verify keyboard
navigation and loading, empty, and error states. Report which checks actually ran.

Sync with `origin/main` before final verification. Push only coherent, verified
changes; if verification is blocked, keep the work local or open a draft PR that
states the limitation.

## Open, review, and merge a pull request

```sh
# finished and checks pass: /code-review origin/main...HEAD once, fix its
# findings, and re-run the checks
cp .github/pull_request_template.md ../pr-body.md   # fill it in, including the review summary
git push -u origin HEAD
gh pr create --title "<type>: <change>" --body-file ../pr-body.md
gh pr checks --watch          # wait for javascript, infrastructure, and GitGuardian
gh pr merge --squash --delete-branch --body "<two-line summary>"
```

Pass a short `--body` to `gh pr merge`; otherwise the squash commit on `main`
would contain the whole PR description.

Fill in the PR template: problem, behavior, verification evidence, and any API,
database, configuration, or rollout impact. Include screenshots for UI changes.

GitHub does not let you approve your own PR, so `main` requires a PR and passing
CI checks instead of approvals, and you run one `/code-review` on the finished
change right before pushing it; details are in the Pull requests section of
[AGENTS.md](AGENTS.md#pull-requests).

`main` is protected: changes arrive through PRs; the `javascript`,
`infrastructure`, and `GitGuardian Security Checks` checks must pass on a branch
that is up to date with `main`;
review threads must be resolved; the ruleset requires linear history on `main`,
which squash merges keep (task branches may still contain merges from `main`);
and force pushes and deletion are blocked. As administrator you can bypass this
in an emergency; coding agents must never use the bypass, merge, or change
repository settings without your explicit instruction.
