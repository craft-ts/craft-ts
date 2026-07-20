# Releasing Craft NG

`@craft-ng/core` and `@craft-ng/dev-tools` share one version and one Git tag.
For now, releases are run locally from the three sibling Git workspaces.

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

Automatic bumps use the highest supported version published across both npm
packages as their baseline:

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

Before changing files, the command checks that all three workspaces are clean,
on `main`, and synchronized with `origin/main`. It then runs `npm ci`, validates
the release tooling, and builds both packages and the documentation.

After showing the resolved version, it asks for confirmation and:

1. updates both package manifests and `CHANGELOG.md`;
2. rebuilds the npm packages and VitePress documentation;
3. mirrors `apps/demo/src` and `apps/demo/public` into `ng-craft-demo`;
4. pins both Craft NG dependencies in the demo to the exact release version;
5. removes and ignores the demo `package-lock.json`;
6. replaces the published documentation with the VitePress build;
7. commits the three workspaces;
8. publishes both packages to npm;
9. pushes `main`, creates and pushes `v<version>`, and creates the GitHub Release;
10. pushes the documentation and StackBlitz demo repositories.

The demo does not run `npm install` or `npm run build`; StackBlitz performs those
steps when the project opens.

## Required local setup

By default, the workspaces must be siblings:

```text
ng-craft/
ng-craft.github.io/
ng-craft-demo/
```

Custom paths can be supplied with `CRAFT_DOCS_REPO` and `CRAFT_DEMO_REPO`.
Before the first release, authenticate once:

```bash
npm login
gh auth login
```

The npm account must be allowed to publish `@craft-ng/core` and
`@craft-ng/dev-tools`, and the GitHub account must be allowed to push all three
repositories and create releases.

## Safe preview

Run all preflight checks and builds without modifying, publishing, committing,
or pushing anything:

```bash
npm run release:local -- minor --dry-run
```

For a non-interactive real release, add `--yes` to skip the confirmation prompt.

## Verification

```bash
npm view @craft-ng/core dist-tags --json
npm view @craft-ng/dev-tools dist-tags --json
gh release view v0.6.0 --repo ng-angular-stack/ng-craft
```

Then open the published documentation and one StackBlitz example. If a failure
happens after local commits were created, inspect the three workspaces before
retrying; do not calculate another bump until every push and npm publication for
the resolved version has completed.
