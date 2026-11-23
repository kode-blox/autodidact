---
title: Self-hosting AutoDidact
description: Configure storage, authentication, deployment, and backups for an AutoDidact instance.
---

AutoDidact compiles its bundled course Markdown at startup. You can replace the bundled library through read-only mounts or from a git-sync checkout that updates while the reader runs. A private S3-compatible bucket stores completion, reading positions, and notes as JSON documents.

## Requirements and secrets

Use Docker Engine and provision a dedicated private, unversioned S3-compatible bucket for each deployment. The storage service must support conditional `PutObject` requests using `If-Match` and `If-None-Match: *`, with strongly consistent reads after writes. The application does not create buckets. Hetzner Object Storage is supported through its custom endpoint; do not enable bucket versioning because Hetzner does not support conditional writes on versioned buckets.

Copy `.env.example` to `.env` and configure:

- `AUTODIDACT_S3_BUCKET`: the existing bucket name.
- `AUTODIDACT_S3_REGION`: the bucket's region, such as `fsn1` for Hetzner's Falkenstein endpoint.
- `AUTODIDACT_S3_ENDPOINT`: the service endpoint, such as `https://fsn1.your-objectstorage.com`; leave empty for AWS S3.
- `AUTODIDACT_S3_USE_PATH_STYLE`: optional `true` or `false` override. Custom endpoints default to path-style addressing.
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: server-only storage credentials. Set `AWS_SESSION_TOKEN` as well when using temporary credentials. The application uses the AWS SDK credential chain, so an appropriate workload role can replace static keys when your deployment supplies one.
- `AUTODIDACT_PUBLIC_URL`: the exact browser-facing origin, without a path. It also supplies the runtime origin for Open Graph image metadata, so the same image can be deployed at different hostnames.

Grant the runtime identity read and write access to objects only in its dedicated bucket, along with permission to list that bucket so the app can distinguish missing keys from denied reads. Never make the bucket public. The health check reads a reserved probe key without creating or changing objects; success confirms readable storage, not write permission. A successful learner-state save is needed to verify write access.

The `.env` file is ignored by Git and excluded from Docker's build context. Runtime credentials are supplied through environment variables, never image build arguments or `PUBLIC_` variables. Protect the host, Docker access, and `.env`; container environment variables are visible to Docker administrators. Do not print resolved configuration or secrets into logs.

## Start and update

The image runs the Next.js standalone server on port `8080`.

From the repository root, after editing `.env`:

```sh
docker build -t autodidact .
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 autodidact
docker logs autodidact
```

The default host address is <http://127.0.0.1:8080>. To change the host port, change the first port in `--publish` and update `AUTODIDACT_PUBLIC_URL` to match. The image runs as the non-root `node` user and does not define a Docker health check. Deployment-level monitoring can use `/api/health`, which checks access to the configured S3 bucket without writing data.

The reader serves Prometheus process metrics at `/metrics` on port `9090`. Set `AUTODIDACT_METRICS_PORT` to override the listener port. For a scrape from the Docker host, add `--publish 127.0.0.1:9090:9090` to publish the default port on loopback.

Run exactly one active application process per bucket. Horizontal scaling is not supported. When using Kubernetes, set `replicas: 1` and the Deployment strategy to `Recreate`; the default rolling-update strategy can overlap the old and new pods. Use a separate bucket for the development server.

### Optional course and asset mounts

Add either or both mounts to the `docker run` command. Put your course directories directly inside `my-courses/`. Put files linked as `/course-assets/…` inside `my-course-assets/`.

```sh
docker run --detach --name autodidact --env-file .env --publish 127.0.0.1:8080:8080 \
  --mount "type=bind,source=$PWD/my-courses,target=/home/node/app/content/courses,readonly" \
  --mount "type=bind,source=$PWD/my-course-assets,target=/home/node/app/public/course-assets,readonly" \
  autodidact
```

To publish changes, update the mounted files and restart the container.

```sh
docker restart autodidact
```

To upgrade the reader, back up your course files, assets, and learner state, then stop the old container and start a new release image from `ghcr.io/kode-blox/autodidact` with the same mounts and environment. Review document-format compatibility before changing application versions.

If an older build stored learner state under an extra S3 key prefix, stop that instance and copy its state into the deployment’s dedicated bucket before starting the new version. Drop the old prefix from each key, so `autodidact/courses/…` becomes `courses/…`.

### Live updates from git-sync

Mount the git-sync volume read-only in AutoDidact and configure git-sync to switch the `current` checkout link atomically. Set the following environment variable on the AutoDidact container.

```sh
AUTODIDACT_EXTERNAL_COURSES_DIR=/var/lib/autodidact/course-sync/current/courses
```

Put course folders under `courses/` in the checkout, with each course's experiments alongside its `course.md`. Put assets under the same checkout’s `public/course-assets/` and link to them as `/course-assets/…`. Only assets referenced by published external course or lesson pages are served. Common raster images display inline. Other files are served as downloads. Protect these URLs with the same gateway that protects the courses.

The reader checks for a checkout immediately and again five seconds after each attempt. It serves bundled courses, including Getting Started, until it accepts its first external checkout. Each accepted checkout replaces the entire active course library. A valid empty `courses/` directory publishes an empty library. Use asset URLs that are distinct from the app's public files.

After the first external checkout is accepted, a missing or invalid checkout clears the active course library and its downloads. The reader checks for a valid checkout again on the next poll. Refresh open reader pages to see the update.

Keep course and lesson IDs stable across revisions to retain their links to existing notes and progress. The reload itself performs no learner-state writes. Leave the variable unset for startup-only loading. Git access belongs to git-sync, so the reader needs only the shared volume.

## Kubernetes

The OCI Helm chart at `oci://ghcr.io/kode-blox/charts/autodidact` runs one replica with `Recreate` and a private `ClusterIP` Service. Set application and S3 configuration under `environmentsVars`. Create a Secret in the release namespace containing `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, then reference it with `secret.existingSecret`. For an existing External Secrets installation, configure `externalSecrets` to supply the same keys. Set `imagePullSecrets` when the registry requires authentication.

The chart creates a separate internal metrics Service. Set `containerPorts.metrics` to change the listener port. Set `serviceMonitor.enabled=true` to configure scraping when the Prometheus Operator's ServiceMonitor CRD is installed.

By default, the chart serves the courses and assets bundled in the image.

For a private operator deployment, set `AUTODIDACT_PUBLIC_URL` to the loopback address you use with `kubectl port-forward`. Enable the optional Gateway only behind an authentication boundary that protects the entire origin.

## Authenticate the entire origin

Set `AUTODIDACT_PUBLIC_URL` to the exact browser-facing origin, such as `https://learn.example.test`, without a path. The example uses `http://127.0.0.1:8080`. Set it explicitly for production rather than relying on the request URL to infer a public origin. Mutation endpoints check the browser's Origin against this value rather than trusting arbitrary forwarded identity headers. This origin check does not authenticate requests.

AutoDidact has no in-app accounts or access isolation between users. An external authentication gateway or suitably protected private network must cover the entire origin: HTML, API routes, experiments, and static assets. Protecting only the home page leaves other routes reachable. Prevent direct access around the gateway and terminate HTTPS appropriately. The loopback publication in this file is appropriate for a gateway on the same host; a gateway running in another container needs explicitly configured private network access instead.

## Backups and restore

Back up all learner-state objects in the configured bucket and the repository containing course Markdown and assets, including any uncommitted content you intend to retain. Store backups separately from the active bucket and protect them as personal data. The interface is not a full-course export or backup tool. An image or container-filesystem backup does not include learner state.

Stop the application before copying the bucket so the backup captures a consistent point without concurrent learner-state writes. Use your storage provider's tooling to copy all learner-state objects to a separate protected backup location, preserving object keys and JSON contents. Do not enable bucket versioning as a substitute for backups on Hetzner. Preserve the application version alongside the backup and verify recovery periodically.

To restore, keep the app stopped, copy the saved objects into an isolated bucket, and start a matching application version pointed at that location. Verify notes, completion, and resume before deliberately switching the deployment's storage configuration. Keep the original objects and backup until recovery is verified. Never overwrite the only live copy as a restore test.

## Local development and checks

Use Node 26.13.0 or a compatible version allowed by `package.json`. Install dependencies with `npm ci`. For application development, configure a disposable bucket with the same environment variables used in production. Next.js reads `.env` for local development; values already exported in the shell take precedence.

Run `npm run dev` with `AUTODIDACT_PUBLIC_URL=http://127.0.0.1:3000`. Open `http://127.0.0.1:3000`; the production container uses port 8080. For source checks:

```sh
npm run lint
npm run types:check
npm test
npm run build
npm run test:integration
```

Local builds use the normal Next.js production output, served from the checkout by `npm start`. The Docker build sets `AUTODIDACT_BUILD_STANDALONE=1` to emit the standalone server and copies its browser assets in the Dockerfile. Run integration tests after a normal local build; they launch the Next.js production server.

Core tests cover storage and learner-state behavior without live storage credentials. The Node integration test in `tests/integration/learner-state.test.ts` exercises the built application against a local S3 test server. It restarts the app sequentially to verify persisted state and makes no live storage calls. These tests verify application behavior and request handling; live provider compatibility should also be checked against a disposable bucket before deployment.

For a manual built-server check, configure a disposable S3 bucket, set `AUTODIDACT_PUBLIC_URL=http://localhost:8080` in your shell, then run `npm start -- --hostname localhost --port 8080`.
