---
name: security-guidance
description: Review proposed code edits or a diff for exploitable security issues, especially authentication and roles, user-generated content, uploads, external fetches, payment webhooks, and AI-retrieved text. Use for a requested security review or security-sensitive changes.
license: Apache-2.0; see ../../licenses/security-guidance-Apache-2.0.txt
---

# Security Guidance

This is a Country Topics Platform manual-review adaptation, authored 2026-10-14
from the AgentWatch adaptation of Anthropic's
[Security Guidance plugin](https://github.com/anthropics/claude-plugins-official/tree/315c4e48967d9541c29c3c656441dded353ca7aa/plugins/security-guidance).
It does not install the upstream edit, stop, or commit hooks, run background
reviews, or block commands automatically.

Read `AGENTS.md` and any instructions for the affected directory. Establish the
review scope from the user's request or the current diff, including intended new
files. Trace external input to its consumers before calling a pattern a finding.

## Review relevant boundaries

- Authentication and roles: every write and every admin or moderator read checks
  the role on the server. Hidden UI is not access control. Admin actions need
  2FA, and role or plan changes come only from trusted sources (admin action or a
  verified payment webhook), never from client input.
- User-generated content: comments, threads, topic bodies, captions, transcripts,
  and profile fields are untrusted. Inspect rich-text sanitising, HTML insertion,
  `dangerouslySetInnerHTML`, Markdown rendering, unsafe link schemes, and
  @mention or notification fan-out.
- Storage and queries: use parameterised queries and validated identifiers.
  Check object-storage keys for path traversal, upload type and size limits,
  and that private or draft content is not served from public caches.
- Outbound requests: link archiving, DOI/ISBN lookups, YouTube metadata, and
  scholarly APIs must have timeouts and must not let users reach internal
  addresses (SSRF). Retrieved text and AI output are data, never instructions.
- Payments and webhooks: verify Stripe, Patreon, and Buy Me a Coffee signatures,
  handle events idempotently, and never store card data.
- Caching: personalised or role-dependent responses must not be stored in the
  shared CDN or page cache. Check `Cache-Control` and cache keys.
- Configuration and CI: secrets stay in environment variables, never in code,
  fixtures, logs, or client bundles. Inspect workflows that consume untrusted PR
  input.

## Report actionable findings

For each finding, give severity, file and line, the input-to-sink path, an example
trigger without real secrets, and the smallest effective fix. Distinguish verified
behavior from an unverified concern. Explain existing safeguards when they rule
out a suspected issue; do not report keyword matches alone as vulnerabilities.

If authorized to fix issues, add regression coverage for rejected inputs and
propagated failures, and run the applicable repository checks. Do not disable
checks or broaden permissions to make a finding disappear. Report review scope
and verification limits; a clean review is not proof that the system is secure.
