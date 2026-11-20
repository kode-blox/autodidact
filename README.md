# AutoDidact

AutoDidact is an open-source, self-hosted course reader for personal learning. Publish courses from Markdown, study them across devices, and keep your place and notes.

## Courses and studying

The reader compiles the bundled courses in `content/courses` at startup. You can replace the courses and supply their assets through read-only mounts. The reader provides course switching, ordered modules and lessons, search, formatted code, tables, equations, diagrams, collapsible hints, and browser experiments.

Lessons remain accessible regardless of completion or prerequisites. Lesson notes open on demand. There are no grades or locked lessons.

Learning state is separate from course content:

- Completion is an explicit action, shared across devices.
- Continue reading remembers the last lesson and section heading. If the heading disappears, it opens the lesson.
- Each lesson has one Markdown notepad.

Permanent course and lesson IDs preserve learning state across title changes, file moves, and reordering. Course sources remain portable Markdown and accompanying assets. Learner data is stored separately in S3 and needs its own backup.

## Access and deployment

AutoDidact requires an internet connection. A deployment contains one learner's state, shared by the devices admitted through its external authentication gateway or private network. The application does not manage accounts, passwords, teams, organizations, or roles. Authentication must cover the entire application origin.

Next.js serves the Fumadocs reader and backend endpoints, with React for interactive controls and JSON documents in a private S3-compatible bucket for persistence. Run exactly one active application instance per deployment; horizontal scaling is not supported.

Authors edit courses outside the application. Interactive experiments run in the browser. Native Unreal Engine and Rider labs remain instructions for the learner to perform on their desktop.

## Run locally

The standalone Docker image runs AutoDidact as one application server and stores learner state in an existing private, unversioned S3-compatible bucket.

Copy `.env.example` to `.env` and configure storage and the browser-facing origin.

```sh
docker build -t autodidact .
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 autodidact
docker logs autodidact
```

The default local address is <http://127.0.0.1:8080>. Supply external authentication covering the entire origin before making it reachable from other devices. See [self-hosting](docs/content/docs/self-hosting.md) for updates and backups.

To replace the bundled files, use the [optional course and asset mounts](docs/content/docs/self-hosting.md#optional-course-and-asset-mounts). Restart the reader after changing mounted files.

## Docker image

The image uses Node 26.13.0 on Debian Trixie slim. Dependency installation, the build, and the standalone server run as the non-root `node` user. Next.js checks types during the build. Docker selects standalone output and copies `content/courses/`, `public/`, and `.next/static/` into the runtime image alongside the traced server files and the project's `LICENSE`. It does not include the test suite.

The server listens on port 8080. The image does not define a Docker health check; `/api/health` is available for deployment-level monitoring. Runtime secrets are excluded from the build context and supplied through environment variables.

Release workflows publish the reader to `ghcr.io/kode-blox/autodidact` and its Helm chart to `oci://ghcr.io/kode-blox/charts/autodidact`. See the [self-hosting guide](docs/content/docs/self-hosting.md) for the image and chart configuration. Third-party dependencies retain their own licenses and notices.

## Documentation

The Fumadocs site in `docs/` covers [self-hosting](docs/content/docs/self-hosting.md), [course authoring](docs/content/docs/authoring.md), [architecture](docs/content/docs/architecture.md), and [security](docs/content/docs/security.md). See the [docs workspace](docs/README.md) to preview and build the static site.

The [security policy](SECURITY.md) covers supported versions and private vulnerability reporting.

## License

Copyright 2026 Sayak Mukhopadhyay.

Licensed under the [Apache License, Version 2.0](LICENSE).
