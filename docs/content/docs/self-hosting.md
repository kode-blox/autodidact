---
title: Self-hosting AutoDidact
description: Configure storage, authentication, deployment, and backups for an AutoDidact instance.
---

AutoDidact serves published course content and one learner's shared state per deployment. A private S3-compatible bucket stores completion, reading positions, and notes as JSON documents. Application containers do not store learner state in their filesystem. Course Markdown and assets live in this repository and are compiled at build time. Course HTML is rendered for each request so Open Graph metadata uses the deployment origin; it does not read Markdown source files from the runtime filesystem. Publish content changes by rebuilding and redeploying the image.

## Requirements and secrets

Use Docker Engine and provision a private, unversioned S3-compatible bucket. The storage service must support conditional `PutObject` requests using `If-Match` and `If-None-Match: *`, with strongly consistent reads after writes. The application does not create buckets. Hetzner Object Storage is supported through its custom endpoint; do not enable bucket versioning because Hetzner does not support conditional writes on versioned buckets.

Copy `.env.example` to `.env` and configure:

- `S3_BUCKET`: the existing bucket name.
- `S3_REGION`: the bucket's region, such as `fsn1` for Hetzner's Falkenstein endpoint.
- `S3_ENDPOINT`: the service endpoint, such as `https://fsn1.your-objectstorage.com`; leave empty for AWS S3.
- `S3_PREFIX`: a dedicated object prefix, defaulting to `autodidact/`. Use a separate prefix for each independent deployment.
- `S3_FORCE_PATH_STYLE`: optional `true` or `false` override. Custom endpoints default to path-style addressing.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: server-only storage credentials. Set `AWS_SESSION_TOKEN` as well when using temporary credentials. The application uses the AWS SDK credential chain, so an appropriate workload role can replace static keys when your deployment supplies one.
- `APP_ORIGIN`: the exact browser-facing origin, without a path. It also supplies the runtime origin for Open Graph image metadata, so the same image can be deployed at different hostnames.

Grant the runtime identity read and write access only to its dedicated prefix, together with the bucket-list permission needed to distinguish missing keys from denied reads. Never make the bucket public. The health check reads a reserved probe key without creating or changing objects; success confirms readable storage, not write permission. A successful learner-state save is needed to verify write access.

The `.env` file is ignored by Git and excluded from Docker's build context. Runtime credentials are supplied through environment variables, never image build arguments or `PUBLIC_` variables. Protect the host, Docker access, and `.env`; container environment variables are visible to Docker administrators. Do not print resolved configuration or secrets into logs.

## Start and update

The image builds against Node 26.13.0 and runs the Next.js standalone server, listening on `0.0.0.0:8080` inside its container.

From the repository root, after editing `.env`:

```sh
docker build -t autodidact .
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 autodidact
docker logs autodidact
```

The default host address is <http://127.0.0.1:8080>. To change the host port, change the first port in `--publish` and update `APP_ORIGIN` to match. The image runs as the non-root `node` user and does not define a Docker health check. Deployment-level monitoring can use `/api/health`, which checks access to the configured S3 prefix without writing data.

Run exactly one active application process per bucket prefix. Horizontal scaling is not supported. When using Kubernetes, set `replicas: 1` and the Deployment strategy to `Recreate`; the default rolling-update strategy can overlap the old and new pods. Do not run the development server or another deployment against the same prefix while the production server is active.

For an update, back up learner state and course sources, build the new image, stop and remove the old container, then start the replacement:

```sh
docker build -t autodidact .
docker stop autodidact
docker rm autodidact
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 autodidact
```

Review document-format compatibility before changing application versions. Conditional writes protect object replacement and browser revisions detect stale edits; they do not make incompatible application versions safe to run together. There are no startup migration jobs or persistent container volumes. Removing the container leaves the external bucket unchanged.

## Authenticate the entire origin

Set `APP_ORIGIN` to the exact browser-facing origin, such as `https://learn.example.test`, without a path. The example uses `http://127.0.0.1:8080`. Set it explicitly for production rather than relying on the request URL to infer a public origin. Mutation endpoints check the browser's Origin against this value rather than trusting arbitrary forwarded identity headers. This origin check does not authenticate requests.

AutoDidact has no in-app accounts or access isolation between users. An external authentication gateway or suitably protected private network must cover the entire origin: HTML, API routes, experiments, and static assets. Protecting only the home page leaves other routes reachable. Prevent direct access around the gateway and terminate HTTPS appropriately. The loopback publication in this file is appropriate for a gateway on the same host; a gateway running in another container needs explicitly configured private network access instead.

## Backups and restore

Back up all learner-state objects under the configured bucket prefix and the repository containing course Markdown and assets, including any uncommitted content you intend to retain. Store backups separately from the active bucket and protect them as personal data. The interface is not a full-course export or backup tool. An image or container-filesystem backup does not include learner state.

Stop the application before copying the prefix so the backup captures a consistent point without concurrent learner-state writes. Use your storage provider's tooling to copy the complete prefix to a separate protected backup location, preserving object keys and JSON contents. Do not enable bucket versioning as a substitute for backups on Hetzner. Preserve the application version alongside the backup and verify recovery periodically.

To restore, keep the app stopped, copy the saved objects into an isolated bucket or empty prefix, and start a matching application version pointed at that location. Verify notes, completion, and resume before deliberately switching the deployment's storage configuration. Keep the original objects and backup until recovery is verified. Never overwrite the only live copy as a restore test.

## Local development and checks

Use Node 26.13.0 or a compatible version allowed by `package.json`. Install dependencies with `npm ci`. For application development, configure a disposable bucket or dedicated prefix with the same environment variables used in production. Do not point development or tests at the learner's live prefix. Next.js reads `.env` for local development; values already exported in the shell take precedence.

Run `npm run dev` with `APP_ORIGIN=http://127.0.0.1:3000`. Open `http://127.0.0.1:3000`; the production container uses port 8080. For source checks:

```sh
npm run lint
npm run types:check
npm test
npm run build
npm run test:integration
```

Local builds use the normal Next.js production output, served from the checkout by `npm start`. The Docker build sets `BUILD_STANDALONE=1` to emit the standalone server and copies its browser assets in the Dockerfile. Run integration tests after a normal local build; they launch the Next.js production server.

Core tests cover storage and learner-state behavior without live storage credentials. The Node integration test in `tests/integration/learner-state.test.ts` exercises the built application against a local S3 test server. It restarts the app sequentially to verify persisted state and makes no live storage calls. These tests verify application behavior and request handling; live provider compatibility should also be checked against a disposable bucket before deployment.

For a manual built-server check, configure a disposable S3 prefix, set `APP_ORIGIN=http://localhost:8080` in your shell, then run `npm start -- --hostname localhost --port 8080`.
