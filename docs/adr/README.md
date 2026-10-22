# Architecture decision records

Use this directory for numbered, immutable records of consequential architecture decisions.

Name files `NNNN-short-title.md`. Each record states its date, status, context,
decision, and consequences. Do not edit an accepted record's decision; write a new
record that supersedes it and update the old record's status line to point to it.

| Number                                                      | Decision                                                                                            | Status   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| [0001](0001-initial-architecture.md)                        | Initial architecture and scale-ready rules                                                          | Accepted |
| [0002](0002-sign-in-and-roles.md)                           | Sign-in with Better Auth, roles in Payload                                                          | Accepted |
| [0003](0003-countries-and-individuals.md)                   | Countries, categories, tags, and individuals                                                        | Accepted |
| [0004](0004-topics-and-versions.md)                         | Topics, workflow, versions, and change log                                                          | Accepted |
| [0005](0005-evidence-and-references.md)                     | Evidence, references, file storage, and link archiving                                              | Accepted |
| [0006](0006-snippets-and-transcripts.md)                    | Video snippets, videos, and transcripts                                                             | Accepted |
| [0007](0007-public-pages-and-caching.md)                    | Public pages, what they show, and how they are cached                                               | Accepted |
| [0008](0008-browsing-and-search.md)                         | Browsing, filters, and search                                                                       | Accepted |
| [0009](0009-comments-votes-and-reports.md)                  | Comments, votes, and reports                                                                        | Accepted |
| [0010](0010-moderation-limits-and-notifications.md)         | Moderation, rate and link limits, Turnstile, and notifications                                      | Accepted |
| [0011](0011-account-deletion-feedback-and-legal-pages.md)   | Account deletion, data export, feedback, and legal pages                                            | Accepted |
| [0012](0012-backups-and-error-reporting.md)                 | Backups and error reporting                                                                         | Accepted |
| [0013](0013-containers-shared-cache-and-scale-rehearsal.md) | Containers, a shared page cache, and the scale rehearsal                                            | Accepted |
| [0014](0014-split-site-and-backend.md)                      | Split one frontend, the site and the admin (Cloudflare Workers), from an API-only backend (Hetzner) | Accepted |
| [0015](0015-feature-modules-and-team-boundaries.md)         | Feature modules and team boundaries                                                                 | Accepted |
