# Product overview

Summary of the Country Topics Platform design document (13 October 2026, @FV).
The design document is the source of truth; this page is a quick reference for
contributors and coding agents.

## What it is

A public website organised by country. Each country has **topics** (an event, a
policy, a public claim) and **individuals** (politicians, officials, experts).
Every topic is backed by evidence: a timestamped YouTube snippet, the transcript of
what was said, and references to books, papers, or reports that support or
contradict it. Reading is free and public; members discuss and suggest; only admins
publish.

## Roles

| Role | Can do | Sign-up |
| --- | --- | --- |
| Visitor | Browse, filter, search, watch snippets, read comments; sees ads | None |
| Member | Comment, vote, start discussions, suggest topics or references, follow countries and individuals | Email magic link or Google / Apple |
| Subscriber | Member abilities plus ad-free, saved collections, AI reference search quota, early access | Paid plan or linked Patreon tier |
| Moderator | Hide or lock comments, review reports, pass member suggestions to admins | Appointed by an admin |
| Admin | Create and edit all content, run AI reference search without limits, manage users and ads | Appointed; 2FA required |

## Features

- **F1 Country filters and browsing.** Multi-select country picker grouped by
  region; facets for category, tag, individual, date, evidence type, language, and
  "has references"; sort by newest, most discussed, most referenced, trending; every
  filter state is a shareable, cacheable URL; country landing pages.
- **F2 Individuals.** Profiles with aliases, licensed photo, role, countries with
  date ranges, bio, and links; linked to topics as subject, speaker, source, or
  mentioned; duplicate detection on create.
- **F3 Topics with proofs and references.** Rich-text topics with evidence blocks
  (snippet, transcript excerpt, document or image, archived external link) and
  references with DOI / ISBN / URL and the supporting passage; draft → in review →
  published → updated / archived, with versioned edits and a public change log.
- **F4 Video snippets and transcripts.** YouTube embeds with start and end times
  and a transcript panel that highlights as the clip plays; one video reused across
  many snippets.
- **F5 AI reference search.** Extracts claims from a transcript excerpt, searches
  OpenAlex, Crossref, Semantic Scholar, Europe PMC / PubMed, arXiv and Google Books,
  ranks results and labels stance (supports, contradicts, context). Admins approve
  every suggestion; nothing AI-suggested is published automatically.
- **F6 Comments and discussions.** Two-level threaded comments with votes and
  @mentions; per-country and global discussion threads; reports, moderator tools,
  rate limits, spam and toxicity filtering; notifications.

## Non-goals for v1

Hosting video (YouTube embeds only), native mobile apps (responsive web and PWA),
and letting non-admins publish topics.

## Revenue

Google ads (off for subscribers and sensitive topics), a Stripe subscription,
Patreon linking, and Buy Me a Coffee. Any paid source grants the Subscriber role.
