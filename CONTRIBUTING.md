# Contributing to Yira

Thank you for helping improve Yira. Open an issue before you start a large pull request. This helps us agree on the change and its scope.

## Local setup

You need Node.js 22 and npm.

```bash
npm ci
npm run dev
```

The development app uses a separate persistent data profile. It defaults to `~/.yira-dev`. Set `YIRA_DEV_DATA_DIR` to use another location. The app uses the selected directory as `YIRA_HOME`.

Read the [repository guide](AGENTS.md) and the [domain context](docs/CONTEXT.md) before making changes.

## Required checks

Run these checks before you submit a pull request:

```bash
npx tsc --noEmit
npm test
```

Run a build when your change affects the build or packaged application:

```bash
npm run build
```

Windows installers are produced in CI. Do not run `npm run dist:win` locally.

## Commit messages

Use Conventional Commits. Common prefixes include `feat:`, `fix:`, `perf:`, and `refactor:`. These subjects can appear in public release notes. Do not include private paths, private links, or commit SHAs in a subject.

## Pull requests

Describe the change and its user-visible impact. List the checks you ran. State any limits in verification. Use the [pull request template](.github/pull_request_template.md).
