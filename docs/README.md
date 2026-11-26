# AutoDidact documentation site

This static Next.js site uses the Fumadocs MDX Macro API and Fumadocs Base UI. It started from the `create-fumadocs-app@16.3.0` static template used by GOLFS and KFlared.

Author pages in `content/docs`. The `meta.json` file sets the sidebar order for [Self-hosting](content/docs/self-hosting.md), [Course authoring](content/docs/authoring.md), and [Architecture](content/docs/architecture.md).

## Develop and build

Run these commands from the repository root using npm and the Node version in the root `.nvmrc`.

```sh
npm ci
npm run dev --workspace @kode-blox/autodidact-docs -- --port 3001
```

The docs open at <http://localhost:3001>. Validate and preview the static export with:

```sh
npm run lint --workspace @kode-blox/autodidact-docs
npm run types:check --workspace @kode-blox/autodidact-docs
npm run build --workspace @kode-blox/autodidact-docs
npm run start --workspace @kode-blox/autodidact-docs -- --listen tcp://127.0.0.1:3001
```

The build writes `docs/out`, including the static search index, Open Graph images, `llms.txt`, `llms-full.txt`, and per-page Markdown under `llms.mdx/docs/<page>/content.md`. The documentation build is independent of the reader and does not use its S3 configuration.

The public documentation URL is `https://autodidact.kodeblox.com/`.

For cluster delivery, the [documentation workflow](../.github/workflows/deliver-documentation.yaml) uses the `documentation` GitHub environment with `GITOPS_ENVIRONMENT` set to `hetzner-fsn1-dc4-prod/docs`. The chart key `autodidact` selects `autodidact/envs/hetzner-fsn1-dc4-prod/docs/values.yaml` in Landscape, where the workflow updates `staticSites.image.tag`.

The workflow publishes `ghcr.io/kode-blox/autodidact/docs:build-<full-source-sha>` with the repository's `GITHUB_TOKEN`. Anonymous cluster pulls require the package to be public.
