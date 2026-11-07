# Architecture

AutoDidact combines server-rendered course pages with interactive reading tools and learner state stored in S3-compatible object storage in one Next.js and Fumadocs application.

## Runtime and rendering

Next.js serves pages and backend endpoints on Node.js. Fumadocs supplies the documentation layout and content pipeline. React components provide interactive controls and on-demand panels. Server-rendered lessons keep the reading interface lightweight and provide stable section anchors.

Fumadocs MDX collections load courses, modules, and lessons from the repository. Markdown represents lesson prose, code, diagrams, hints, and equations. Course changes are published through rebuilding and redeploying the application; the runtime does not edit content.

## Content identity

Each course has a permanent ID and ordered module IDs. Modules have course-scoped IDs and ordered lesson IDs. Lessons contain their permanent ID, course ID, title, and Markdown. The ordered lists define membership and sequence.

Course IDs are unique across the project; module and lesson IDs are unique within their course. Authored identities determine collection IDs and learner-state keys. File paths, titles, order, and content revisions do not determine persistence identity. Missing or duplicate IDs, broken references, invalid membership, and missing assets are publication errors.

## Learner state

An existing private S3-compatible bucket stores one learner's completion, lesson notes, and course resume as JSON documents. Each deployment uses a dedicated object prefix and one active application process; horizontal scaling is outside its scope. Learner records are independent of content builds and remain stored when a course or lesson is no longer published.

Completion, notes, and resume are separate versioned resources. Updates compare an expected revision and return current state on conflict. S3 conditional writes protect document creation and replacement. Completion is versioned per lesson, and repeated requests for the same completion state are already satisfied.

Continue reading stores the last lesson ID and section heading anchor. If a saved heading disappears, the reader opens the lesson. Completion is an independent action. Practical next steps and open questions belong in the lesson's Markdown notepad.

## Deployment boundary

External authentication protects the entire application origin, including pages, APIs, experiments, and assets. Everyone admitted through that boundary shares the same learner data. The application has no account or team management and does not trust arbitrary client-supplied identity headers.

Markdown rendering and experiment execution have separate security boundaries: lesson prose cannot execute application code, and experiment scripts cannot access learner data or application storage.
