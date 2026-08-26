# Releasing CraftTS

Fifteen packages share one version and one Git tag. `releasePackages` in
[`tools/release.mjs`](tools/release.mjs) is the source of truth for that list —
`nx.json` (`release.projects`) is aligned on it, and every step below is derived
from it rather than from a hand-kept enumeration.

| npm package                       | nx project                | built from                       |
| --------------------------------- | ------------------------- | -------------------------------- |
| `@craft-ts/core`                  | `craft-ts-core`           | `libs/core`                      |
| `@craft-ts/component`             | `craft-ts-component`      | `libs/component`                 |
| `@craft-ts/effect`                | `craft-ts-effect`         | `libs/effect`                    |
| `@craft-ts/dev-tools`             | `dev-tools`               | `libs/dev-tools`                 |
| `@craft-ts/deploy`                | `craft-ts-deploy`         | `libs/deploy`                    |
| `@craft-ts/cli`                   | `craft-ts-cli`            | `libs/cli`                       |
| `@craft-ts/deploy-alchemy`        | `craft-ts-deploy-alchemy` | `libs/deploy-alchemy`            |
| `@craft-ts/style`                 | `craft-ts-style`          | `libs/style`                     |
| `@craft-ts/style-testing`         | `craft-ts-style-testing`  | `libs/style-testing`             |
| `@craft-ts/i18n`                  | `craft-ts-i18n`           | `libs/i18n`                      |
| `@craft-ts/i18n-effect`           | `craft-ts-i18n-effect`    | `libs/i18n-effect`               |
| `@craft-ts/mcp`                   | `mcp`                     | `packages/mcp`                   |
| `@craft-ts/log-server`            | `log-server`              | `apps/log-server`                |
| `@craft-ts/log-mcp`               | `log-mcp`                 | `packages/log-mcp`               |
| `@craft-ts/function-registry-mcp` | `function-registry-mcp`   | `packages/function-registry-mcp` |

For now, releases are run locally from the four Git workspaces: this repository,
the documentation repository, the main demo repository, and the frontend Effect
demo repository.

## One local command

Use an automatic stable bump:

```bash
npm run release:local -- patch
npm run release:local -- minor
npm run release:local -- major
```

Or choose an exact version, including a prerelease:

```bash
npm run release:local -- 0.6.0-beta.3
```

## Beta releases

Beta versions must currently be specified explicitly. Start a new minor beta
series with:

```bash
npm run release:local -- 0.6.0-beta.0
```

Then increment the beta number for each subsequent release:

```bash
npm run release:local -- 0.6.0-beta.1
npm run release:local -- 0.6.0-beta.2
```

The `-beta.N` suffix automatically selects the npm `beta` dist-tag, creates the
Git tag `v0.6.0-beta.N`, and marks the GitHub Release as a prerelease. The
automatic `patch`, `minor`, and `major` arguments produce stable versions; they
do not start or increment a beta series.

Automatic bumps use the highest supported version published across the existing
npm packages as their baseline. A newly added package does not need a previous
version; it is published as part of the release group:

| Highest npm version | Bump    | Resolved version |
| ------------------- | ------- | ---------------- |
| `0.5.8`             | `patch` | `0.5.9`          |
| `0.5.8`             | `minor` | `0.6.0`          |
| `0.5.8`             | `major` | `1.0.0`          |
| `0.5.8-beta.1`      | `patch` | `0.5.8`          |
| `0.5.8-beta.1`      | `minor` | `0.6.0`          |

Exact versions accept `x.y.z`, `x.y.z-beta.N`, and `x.y.z-rc.N`. Their npm
dist-tags are respectively `latest`, `beta`, and `next`.

## What the command does

Before changing files, the command checks that all four workspaces are clean,
on `main`, and synchronized with `origin/main`. It then runs `npm ci`, validates
the release tooling, runs the unit and E2E tests for projects affected since the
latest release tag, and completes the other release gates. The release
package and documentation artifacts are built once, after confirmation, so the
preview does not build the same artifacts twice. The production preflight keeps
the application build, including `demo-effect`, as its validation build.

The affected comparison base is the latest reachable `v*` Git tag. To override
it deliberately, set `CRAFT_RELEASE_AFFECTED_BASE` to another commit or tag.

Successful Nx test tasks are cached. If a later test fails and the code is
corrected, rerunning the release reuses cached tasks whose inputs did not
change; only affected projects and invalidated tasks run again. Do not use
`--skip-nx-cache` or `npx nx reset` when you want this behavior.

After showing the resolved version, it asks for confirmation and:

1. updates the fifteen package manifests and `CHANGELOG.md`;
2. rebuilds the fifteen npm packages and VitePress documentation;
3. mirrors `apps/demo/src` and `apps/demo/public` into `craft-ts-demo`;
4. pins the three CraftTS packages used by the demo (`core`, `component`, and
   `dev-tools`) to the exact release version;
5. mirrors `apps/demo-effect/src` into `craft-ts-demo-effect`;
6. pins `@craft-ts/core`, `@craft-ts/component`, and `@craft-ts/effect` to the
   release version, moves `@craft-ts/dev-tools` to `devDependencies`, and sets
   `effect` to the workspace-compatible version range in the frontend Effect
   demo;
7. removes and ignores the `package-lock.json` files in both demos;
8. replaces the published documentation with the VitePress build;
9. commits the four workspaces;
10. publishes all fifteen packages to npm;
11. pushes `main`, creates and pushes `v<version>`, and creates the GitHub Release;
12. pushes the documentation and both StackBlitz demo repositories.

The demos do not run `npm install` or `npm run build`; StackBlitz performs those
steps when each project opens.

## Required local setup

By default, the workspaces must be siblings:

```text
craft-ts/
craft/
craft-ts-demo/
craft-ts-demo-effect/
```

Custom paths can be supplied with `CRAFT_DOCS_REPO`, `CRAFT_DEMO_REPO`, and
`CRAFT_EFFECT_DEMO_REPO`.
Before the first release, authenticate once:

```bash
npm login
gh auth login
```

The npm account must be allowed to publish every package in the table above —
in practice, the whole `@craft-ts` scope. The GitHub account must be allowed to
push all four repositories and create releases.

## Safe preview

Run all preflight checks without modifying, publishing, committing, or pushing
anything. Artifact builds happen only after confirmation, so `--dry-run` does
not build packages or documentation. For the first `@craft-ts/*` publication, use the exact
version because the new packages do not have npm history yet:

```bash
npm run release:local -- 0.7.0-beta.11 --dry-run
```

For a non-interactive real release, add `--yes` to skip the confirmation prompt.

## Verification

```bash
node -e "import('./tools/release.mjs').then(({releasePackages})=>{for(const{name}of releasePackages)console.log(name)})" \
  | xargs -n1 -I{} npm view {} dist-tags --json
gh release view v0.6.0 --repo craft-ts/craft-ts
```

Reading the names from `releasePackages` keeps this check correct when a package
is added; a hand-written list is how the previous five-package version of this
file went stale.

Then open the published documentation and both StackBlitz examples. If a failure
happens after local commits were created, inspect the four workspaces before
retrying; do not calculate another bump until every push and npm publication for
the resolved version has completed.
