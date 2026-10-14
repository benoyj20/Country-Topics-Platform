## Change and purpose

<!-- Explain the problem and resulting behavior. Link the plan milestone, checklist
item, or issue. -->

## Scope and dependencies

<!-- List affected components and any related open PRs with their merge order.
Explain why this is a separate task if related work is already open. -->

## Verification

<!-- List commands actually run and their results. State skipped, unavailable,
or failing checks explicitly. For behavior changes, include reproduction steps. -->

| Check or manual scenario | Result / evidence |
| --- | --- |
| | |

## UI evidence (if applicable)

<!-- Include screenshots and widths actually checked: mobile 360–390 px,
tablet 768 px, desktop 1280–1440 px, and 200% zoom. Describe keyboard checks,
loading/empty/error states, and any overflow. Write N/A for non-UI changes. -->

## Contracts, data, and rollout (if applicable)

<!-- Describe API, database migration, dependency, configuration, and rollback
steps. Note effects on evidence, references, roles, privacy, or caching.
Write N/A when there is no impact. -->

## Review checklist

- [ ] This is the task's one active PR, or the independent scope/split is explained above.
- [ ] Changes are focused; unrelated work and secrets are excluded.
- [ ] PR title describes the resulting behavior using `<type>: <specific change>`.
- [ ] No fabricated references, quotes, transcripts, or facts about real people.
- [ ] Relevant local checks passed; limitations are stated above.
- [ ] Required GitHub CI checks (`javascript`, `infrastructure`) passed on the final version.
- [ ] Self-review done on the final diff (`/code-review` or the `code-reviewer` agent;
      `/security-guidance` for logins, roles, payments, uploads, or user content).
- [ ] Affected documentation and `docs/project-checklist.md` are updated.
- [ ] At merge: squash only, with the final PR title and a concise description.
