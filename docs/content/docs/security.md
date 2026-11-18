---
title: Security
description: Protected assets, trust boundaries, controls, and accepted security limitations.
---

Each AutoDidact deployment serves one learner. An external authentication gateway or protected private network controls access to the application. The server stores learner state in a private S3-compatible bucket.

## Protected assets

- Lesson notes, completion records, and saved reading positions
- Server-side object storage credentials
- Integrity of published course content and experiment files

## Trust boundaries

| Boundary                               | Security requirement                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser and application origin         | Protect every page, API route, experiment, and asset. Serve the origin over HTTPS and block direct access to the app when using a gateway. |
| Application and object storage         | Keep the bucket private and limit the runtime identity to the permissions needed for its dedicated prefix.                                 |
| Course repository and deployed reader  | Publish course content and experiment files from trusted authors through the repository build.                                             |
| Interactive experiments and the reader | Isolate experiment scripts in a browser sandbox.                                                                                           |

## Controls

### Access and learner state

- State-changing API routes check the request's `Origin` header against the browser-facing origin. Set `APP_ORIGIN` explicitly for production.
- The application keeps object storage credentials on the server. Learner documents use permanent course and lesson IDs and live under the deployment's dedicated prefix.
- The server compares the revision supplied by the browser with the stored revision to detect stale edits. Conditional S3 writes protect the document if it changes between the server's read and write.

### Course content and workloads

- The reader sanitizes raw HTML in authored Markdown.
- Interactive experiments run in sandboxed frames with scripts enabled and an opaque origin. The experiment response's Content Security Policy also applies the sandbox when the URL is opened directly.
- The production container runs as the non-root `node` user.

## Accepted limitations

- Everyone admitted to a deployment can access the same learner state. Give each learner a separate deployment and storage prefix.
- The course pipeline assumes authors are trusted. Mermaid renders course diagrams in `loose` mode.
- A principal with direct write access to the bucket can change learner state outside the application. Scope storage credentials to the deployment and keep independent backups.
- The supported deployment uses one active application instance and a storage provider that supports conditional writes and strongly consistent reads.

## Further reading

The repository's [security policy](https://github.com/kode-blox/autodidact/blob/main/SECURITY.md) covers supported versions and private vulnerability reporting.

[Architecture](./architecture.md) explains the reader and storage model. [Self-hosting](./self-hosting.md) covers authentication, storage configuration, and backups.
