# AutoDidact

AutoDidact is an open-source, self-hosted course reader for personal learning. Publish courses from Markdown, study them across devices, and keep your place and notes.

## Courses and studying

The application and its course content live in one Next.js and Fumadocs repository. Authors edit Markdown and supporting assets outside the application, commit their changes, then rebuild and redeploy to publish them. The reader provides course switching, ordered modules and lessons, search, formatted code, tables, equations, diagrams, collapsible hints, and browser experiments.

Lessons remain accessible regardless of completion or prerequisites. Lesson notes open on demand. There are no grades or locked lessons.

Learning state is separate from course content:

- Completion is an explicit action, shared across devices.
- Continue reading remembers the last lesson and section heading. If the heading disappears, it opens the lesson.
- Each lesson has one Markdown notepad.

Permanent course and lesson IDs preserve learning state across title changes, file moves, and reordering. Course sources remain portable Markdown and accompanying assets. Learner data requires a separate backup of its S3 objects.

## Access and deployment

AutoDidact requires an internet connection. A deployment contains one learner's state, shared by the devices admitted through its external authentication gateway or private network. The application does not manage accounts, passwords, teams, organizations, or roles. Authentication must cover the entire application origin.

Next.js serves the reader and backend endpoints, with React for interactive controls and S3-compatible object storage for persistence. Each deployment supports one learner and one active application process; horizontal scaling is outside its scope.

Course updates use the repository's normal build and deployment workflow. The application has no course editor. Interactive experiments run in the browser; native Unreal Engine and Rider labs remain instructions for the learner to perform on their desktop.

See [architecture](docs/architecture.md) for the content, state, and deployment boundaries.

## License

Copyright 2026 Sayak Mukhopadhyay.

Licensed under the [Apache License, Version 2.0](LICENSE).
