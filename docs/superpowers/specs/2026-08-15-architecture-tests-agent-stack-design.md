# Architecture tests as the agent-stack graph contract

## Problem

Human docs treat architecture tests as the place to lock robust graph
patterns. The consumer agent stack (`llms.txt`, `@craft-ng/mcp`, Agent Skills)
treated them as a CI checkbox after generating code. Agents could emit valid
Craft without scaffolding the suite or encoding a smell so it cannot recur.

Architecture rules are **not** written before a typical feature. They go in
at app start (baseline), or later when a bad pattern is spotted.

## Contract

The `architecture/` suite is the app's graph contract.

- Scaffold it at bootstrap or at the end of `craft-migrate`.
- During a feature, **run** the existing suite. Do not add a rule for the
  feature.
- Add a new `it()` only to freeze a spotted undesirable pattern.
- If `architecture/` is missing mid-feature, report the gap and offer the
  scaffold. Do not impose it.

## Changes

- New skill `ng-craft-architecture-tests` in `packages/mcp/skills/`:
  bootstrap, run during a feature, encode a smell. Helper table. Red flags.
  Point at `/guide/testing/architecture`; do not copy it.
- Recast `best-practices.md`, `agents.md`, VitePress `llms.txt` details,
  `resources/ai-agents.md`, MCP README, `plugin.json`.
- Cross-links from `craft-ng`, `translate-spec-to-ng-craft` (slot
  `Baseline helper already covering this`; custom rule only for a stated
  product invariant), `ng-craft-routes`, `migrate-to-ng-craft`.
- Tests: skill appears in `list_skills`; docs assert baseline +
  anti-regression, not TDD-before-feature.
- No new `@craft-ng/dev-tools` helpers.

## Initiative

If `architecture/` exists and a smell appears, encode the matching helper.
If the suite is missing, propose scaffold first.
