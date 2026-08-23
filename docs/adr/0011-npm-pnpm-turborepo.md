# ADR 0011 — pnpm workspaces + Turborepo for the monorepo

Status: Accepted · Date: 2026-08-23

## Context

NovaMart contains five Next.js apps, four Flutter apps, six Node services and ten shared packages.
Types, validation schemas, permission definitions and event contracts must be shared between the API
and the web apps without publishing to a registry, and CI must not rebuild everything on every
commit.

Flutter apps are outside the JavaScript dependency graph and use `pub`.

## Decision

**pnpm workspaces** for dependency management, **Turborepo** for task orchestration.

- Workspace globs cover `apps/*-web`, `services/*`, `packages/*`, `tests/*`. Flutter apps live under
  `apps/*-mobile` and are deliberately excluded from the pnpm workspace; they are driven by scripts
  in `scripts/flutter-*.sh` and their own CI jobs.
- pnpm's isolated `node_modules` (symlinked store, `node-linker=isolated`) means a package can only
  import what it declares. That prevents phantom dependencies, which in a 25-package repo is the
  difference between a working and a broken production build.
- Turborepo provides the task graph (`dependsOn: ["^build"]`), content-hash caching and affected-only
  execution, so a change to `apps/admin-web` does not rebuild the Flutter-adjacent or unrelated
  packages.
- Shared packages are consumed as `workspace:*` and built to `dist/` with declaration files, so
  Next.js and NestJS both consume compiled output with real types.
- `save-exact=true`: every dependency is pinned. Range specifiers are how a supply-chain
  compromise reaches production.

## Consequences

Positive: fast installs and CI; strict dependency correctness; one PR can change an API contract and
all its consumers atomically; remote caching available when CI cost matters.

Negative: pnpm's strictness occasionally requires explicit peer dependency declarations that npm
would have silently hoisted; Turborepo pipelines need maintenance as tasks are added; contributors
must have pnpm installed (pinned via `packageManager`); Flutter sits outside the graph so
cross-language changes need two CI jobs.

## Alternatives rejected

**npm workspaces** — adequate and needs no extra install, but hoisting permits phantom dependencies
and there is no task graph or caching. Considered as a fallback if pnpm proves unavailable in an
environment.

**Nx** — more capability (generators, dependency graph enforcement) at the cost of a heavier,
more opinionated setup than the team needs today.

**Polyrepo** — atomic cross-cutting contract changes become multi-PR choreography; rejected.
