---
title: Architecture
description: Rendering, content identity, learner state, and deployment boundaries.
---

AutoDidact combines server-rendered course pages with interactive reading tools and learner state stored in S3-compatible object storage in one Next.js application. Each deployment serves one learner through one active application process; horizontal scaling is outside the supported scope.

## Runtime and rendering

Next.js runs the Fumadocs reader and backend endpoints on Node 26. React components provide interactive controls and on-demand panels. Next.js renders course HTML per request so preview URLs use the deployment origin. Markdown exports and Open Graph images are generated at build time, while learner-state endpoints run on demand. The project uses strict TypeScript and npm, with resolved dependencies in the lockfile.

Fumadocs processes the repository's Markdown course content. Rendering supports GFM, KaTeX equations, details/summary hints, and Mermaid diagrams. Authored HTML is sanitized; Mermaid uses loose security mode and a theme-aware diagram viewer. Course changes are published by rebuilding and redeploying the application; the runtime does not edit content.

Course structure and permanent authored IDs determine navigation. Fumadocs search uses a separate index for each course. Validation checks the published content and links before publication.

## Content identity

Each course has a permanent ID and ordered module IDs. Modules have course-scoped IDs and ordered lesson IDs. Lessons contain their permanent ID, course ID, title, and Markdown. The ordered lists define membership and sequence.

Course IDs are unique across the project; module and lesson IDs are unique within their course. Authored identities determine collection IDs and learner-state keys. File paths, titles, order, and content revisions do not determine persistence identity. Publication validates raw authored IDs before collection deduplication, then checks references, single membership, rendered heading anchors, and assets. [Course authoring](./authoring.md) describes the source format and published URL rules.

## Learner state

An existing private S3-compatible bucket stores JSON documents for completion, lesson notes, and course resume. A dedicated prefix isolates each deployment. Document keys use permanent course and lesson IDs; each key segment is URI-encoded. Lesson state lives under `courses/{course}/lessons/{lesson}/`, with separate `completion.json` and `note.json` objects. Course-level `resume.json` objects live under `courses/{course}/`. The storage adapter wraps document values in a `formatVersion: 1` envelope and rejects unsupported or malformed stored documents instead of treating them as empty state.

Completion, notes, and resume are separate versioned resources. The browser sends the revision it edited. Updates compare that revision and return HTTP 409 with current state on conflict. Completion is versioned per lesson; repeating the same target completion state succeeds without creating a conflict or changing unrelated lessons. S3 conditional creates and replacements protect the read-check-write operation from overwriting a changed object. Numeric browser revisions remain distinct from storage ETags. For custom endpoints that reject a quoted ETag, the adapter retries the same conditional update once with the quotes removed for Hetzner compatibility. Storage must support these conditional requests and strongly consistent reads; use an unversioned bucket with Hetzner.

Continue reading stores the last lesson ID and section heading anchor, updated from active reading and navigation. If a saved heading disappears, the reader opens the lesson. Completion is an independent action. Each lesson has one Markdown notepad with debounced saves, save-state feedback, navigation flushing, and draft preservation on errors or conflicts.

Learner records are independent of content builds and remain stored when a course or lesson is no longer published. Learner data and course sources are backed up separately.

## Deployment and isolation

External authentication protects the entire application origin, including pages, APIs, experiments, and assets. Everyone admitted through that boundary shares the same learner data. The application has no account or team management and does not trust arbitrary client-supplied identity headers. Mutation endpoints check the configured browser-facing origin.

Experiments have dedicated responses with a CSP sandbox and are embedded in sandboxed frames without same-origin permission. The response-level sandbox also applies when an experiment URL is opened directly. Experiment scripts cannot access learner data or application storage.

The runtime image contains the Next.js standalone server, its traced runtime dependencies, and static assets. Learner state survives container replacement in the external bucket; there are no persistent container volumes or migration jobs. Startup does not create storage resources. The readiness endpoint checks read access through a non-mutating request under the configured prefix; it does not verify write permission. Kubernetes deployments use one replica and the `Recreate` strategy so old and new application processes do not overlap. [Self-hosting](./self-hosting.md) covers storage configuration, authentication, backups, and contributor checks.
