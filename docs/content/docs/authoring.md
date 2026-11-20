---
title: Authoring and publishing courses
description: Create and publish courses, lessons, and browser experiments.
---

The image ships the courses from `content/courses`. Keep your own courses in a directory you can mount read-only in its place. See [Self-hosting](./self-hosting.md) for the course and asset mounts.

Use `course.md` for course entries, `module.md` for module entries, and Markdown directly inside `lessons/` directories. Put course images and downloads under `public/course-assets/` and link to them with URLs such as `/course-assets/setup.png`. Quote numeric-looking IDs in YAML.

```yaml
# course.md frontmatter
id: my-course
title: My course
description: What this course explores
modules: ['05']
experiments: []
```

```yaml
# module.md frontmatter
id: '05'
course: my-course
title: A module
lessons: ['05-01', '05-02']
```

```markdown
---
id: '05-01'
course: my-course
title: A lesson
description: What you will explore
---

## Start here

Lesson content.
```

Course IDs are unique in the project. Module and lesson IDs are unique within their course, so different courses may reuse `05-01`. Ordered module/lesson lists define membership and sequence. Keep IDs when changing titles, moving files within the supported directory layout, or reordering lessons; learner state uses course/lesson IDs, never their paths or positions. Removing content retains its learner-state objects. Splits, merges, and intentional ID changes need a deliberate plan for retaining or transferring learner state.

Use ordinary Markdown, GFM tables/fences, `$...$` or `$$...$$` math, `mermaid` fences for diagrams, and safe `<details><summary>Hint</summary>…</details>` for optional hints. Raw scripts and active HTML are removed. Examples that require Unreal or Rider remain learner instructions; AutoDidact does not execute native labs.

Link to published lessons with `/courses/{course-id}/{lesson-id}#heading-anchor`, and experiments with `/experiments/{course-id}/{experiment-id}`. Existing root-relative files in `public/` are supported assets. Relative `./` and `../` links to published course or lesson Markdown in the same course are also supported; Fumadocs resolves them to the permanent ID URLs. Bare filenames, module source files, and links outside the published course remain unsupported. Missing lessons must be labelled unavailable rather than linked. Validation checks rendered heading anchors, authored identities, ordering, membership, public assets, and declared experiments before publication.

Declare an experiment on its course using `{ id: compute-dispatch, title: Compute dispatch, file: experiments/compute-dispatch.html }`. Experiment files must be flat HTML files under that course's `experiments/` directory. Dedicated responses enforce a sandbox even when opened directly; scripts cannot access application storage or learner APIs. Keep experiments self-contained: network requests, forms, same-origin access, and external script/style loading are unavailable.

The reader compiles Markdown at startup, validates the course structure and published references, and prepares course-scoped search data. Restart the deployment after updating mounted courses or assets.

Published overview and lesson pages retain the scaffold Markdown-copy/view controls and Open Graph preview images. Markdown is also available from `/llms.txt`, `/llms-full.txt`, the page URL with a `.md` suffix, or by requesting the page with `Accept: text/markdown`. These exports contain authored course content, not learner notes, completion, or resume state. Processed Markdown retains the native Fumadocs authored-link text; the HTML reader resolves supported relative Markdown links to permanent ID URLs.

The source course remains portable Markdown and accompanying files. To export it, copy its course directory plus any referenced public assets, or use Git's normal repository/archive workflow. Learner notes, completion, and resume live in the configured S3 bucket and require a separate backup. Course changes preserve learner IDs, and a missing resume heading falls back to its lesson.
