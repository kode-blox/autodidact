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

## Deploy to GitHub Pages

The pipeline runs the docs job when the delivery-change detector finds changes to the docs, the docs delivery workflow, `.nvmrc`, or the root npm manifests. Pull requests to `main` validate the export. Pushes to `main` and manual runs on `main` with matching changes also upload `docs/out` and deploy it to the `github-pages` environment. Manual runs compare the selected commit with its first parent.

In the repository's [Pages settings](https://github.com/kode-blox/autodidact/settings/pages), set the publishing source to **GitHub Actions** and configure `autodidact.kodeblox.com` as the custom domain. Point the DNS CNAME for `autodidact.kodeblox.com` to `kode-blox.github.io`. The static export uses root-relative URLs for the custom domain.
