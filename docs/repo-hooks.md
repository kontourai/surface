# Repo Hooks

Surface uses repo-owned local Git hooks for contributor verification. They are local contributor safeguards for this repository, not Surface Console behavior, not projection behavior, not Trust Snapshot semantics, not runtime adapter behavior, and not product behavior.

## Setup

From anywhere inside the Surface worktree, run:

```bash
npm run setup:repo-hooks
```

The setup command configures this clone's local Git config so `core.hooksPath=.githooks`. It does not write global Git config. It is safe to run repeatedly, and rerunning it repairs stale absolute hook paths left by older local setup.

## Validation

Run:

```bash
npm run validate:repo-hooks
```

Validation checks the local hooks path, executable hook mode, package script wiring, docs references, and hook/setup drift. The pre-push hook runs:

```bash
npm run validate:repo-hooks
npm run verify
```

First-time contributors should run `npm run setup:repo-hooks` before pushing so the repo-owned hook is active. `npm run verify` remains the package verification lane used by CI and release checks.
