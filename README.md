# AutoDidact

AutoDidact is an open-source, self-hosted course reader for personal learning. Publish courses from Markdown, study them across devices, and keep your place and notes.

## Courses and studying

The application and its course content live in one repository. Authors edit Markdown and supporting assets outside the application, commit their changes, then rebuild and redeploy to publish them. The reader provides course switching, ordered modules and lessons, search, formatted code, tables, equations, diagrams, collapsible hints, and browser experiments.

Lessons remain accessible regardless of completion or prerequisites. Lesson notes open on demand. There are no grades or locked lessons.

Learning state is separate from course content:

- Completion is an explicit action, shared across devices.
- Continue reading remembers the last lesson and section heading. If the heading disappears, it opens the lesson.
- Each lesson has one Markdown notepad.

Permanent course and lesson IDs preserve learning state across title changes, file moves, and reordering. Course sources remain portable Markdown and accompanying assets. Learner data is stored separately in S3 and needs its own backup.

## Access and deployment

AutoDidact requires an internet connection. A deployment contains one learner's state, shared by the devices admitted through its external authentication gateway or private network. The application does not manage accounts, passwords, teams, organizations, or roles. Authentication must cover the entire application origin.

Next.js serves the Fumadocs reader and backend endpoints, with React for interactive controls and JSON documents in a private S3-compatible bucket for persistence. Run exactly one active application instance per deployment; horizontal scaling is not supported.

Course updates use the repository's normal build and deployment workflow. The application has no course editor. Interactive experiments run in the browser; native Unreal Engine and Rider labs remain instructions for the learner to perform on their desktop.

## Included courses

The Unreal Engine Development course contains lessons 05-01 and 05-02 about GPU shader stages, resource bindings, and compute dispatch against stock UE 5.8.4, together with the compute-dispatch experiment. The published content is independent of the source vault.

Rust for Experienced Developers starts with two lessons about ownership at function boundaries and shared state with `Arc` and `Mutex`. It assumes programming experience and uses small, runnable examples to explain Rust's ownership model.

## Run locally

The standalone Docker image runs AutoDidact as one application server using an existing private, unversioned S3-compatible bucket for learner state. No persistent container volume is required.

Copy `.env.example` to `.env`, configure the bucket, endpoint, region, server credentials, and browser-facing origin, then run:

```sh
docker build -t autodidact .
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 autodidact
docker logs autodidact
```

The default local address is <http://127.0.0.1:8080>. Supply external authentication covering the entire origin before making it reachable from other devices. See [self-hosting](docs/content/docs/self-hosting.md) for updates and backups.

## Docker image

The image uses Node 26.13.0 on Debian Trixie slim. Dependency installation, the build, and the standalone server run as the non-root `node` user. Next.js checks types during the build. Docker selects standalone output and copies `public/` and `.next/static/` into the runtime image alongside the traced server files and the project's `LICENSE`. It does not include the test suite.

The server listens on port 8080. The image does not define a Docker health check; `/api/health` is available for deployment-level monitoring. Runtime secrets are excluded from the build context and supplied through environment variables.

OCI labels identify the author, title, description, base image, `kode-blox` vendor, `Apache-2.0` license, and planned GHCR package at `ghcr.io/kode-blox/autodidact`. The documentation label points to the planned site at `https://autodidact.kodeblox.com`. Building locally does not publish the image or create the documentation site. Third-party dependencies retain their own licenses and notices.

## Documentation

The Fumadocs site in `docs/` covers [self-hosting](docs/content/docs/self-hosting.md), [course authoring](docs/content/docs/authoring.md), and [architecture](docs/content/docs/architecture.md). See the [docs workspace](docs/README.md) to preview and build the static site.

## License

Copyright 2026 Sayak Mukhopadhyay.

Licensed under the [Apache License, Version 2.0](LICENSE).
