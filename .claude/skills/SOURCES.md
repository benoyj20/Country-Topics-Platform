# Skill sources and adaptations

Copied on 2026-10-14 from the AgentWatch repository's `.claude/` folder, which
imported them on 2026-10-08. These are vendored files, not installed plugins.
Notices reading "AgentWatch adaptation" record changes made during that import
and still describe the files accurately. Changes should be reviewed against the
pinned sources before updating.

Country Topics Platform changes made while copying:

- `security-guidance/SKILL.md` rewritten for this project's boundaries (roles,
  user content, uploads, outbound fetches, payment webhooks, caching).
- `superpowers/SKILL.md` provenance line updated.
- `README.md` Frontend Design note reworded for evidence displays.

## I Have ADHD

- Source: [https://github.com/ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd/tree/723af7d9afaf43eb871dbcce6129e2bf80de90d5)
- Revision: `723af7d9afaf43eb871dbcce6129e2bf80de90d5`
- License: [included license](i-have-adhd/LICENSE)
- Packaging: Standalone skill and agent metadata copied unchanged; always-on hooks omitted.

## Feature Dev

- Source: [https://github.com/anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/315c4e48967d9541c29c3c656441dded353ca7aa)
- Revision: `315c4e48967d9541c29c3c656441dded353ca7aa`
- License: [included license](../licenses/feature-dev-Apache-2.0.txt)
- Packaging: Command converted to SKILL.md; agent tool list updated to Read/Glob/Grep/Bash and model changed to inherit. Modified files carry notices.

## Frontend Design

- Source: [https://github.com/anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/315c4e48967d9541c29c3c656441dded353ca7aa)
- Revision: `315c4e48967d9541c29c3c656441dded353ca7aa`
- License: [included license](frontend-design/LICENSE.txt)
- Packaging: Standalone skill and its license copied unchanged.

## Security Guidance

- Source: [https://github.com/anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/315c4e48967d9541c29c3c656441dded353ca7aa)
- Revision: `315c4e48967d9541c29c3c656441dded353ca7aa`
- License: [included license](../licenses/security-guidance-Apache-2.0.txt)
- Packaging: Repository-specific manual-review adaptation; upstream executable hooks and model-endpoint integration omitted.

## Superpowers

- Source: [https://github.com/obra/superpowers](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d)
- Revision: `8ca22dba9a94f28898bbce59f2537ff4d87c747d`
- License: [included license](../licenses/superpowers-MIT.txt)
- Packaging: Full skills directory copied with supporting resources. Plugin-qualified skill references changed to local names; changed Markdown files carry notices. Added /superpowers entrypoint; startup hook omitted.
