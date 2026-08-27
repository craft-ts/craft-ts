# Create a CraftTS project

Use `craft create` to generate a framework-independent CraftTS application
with routing, a typed API example, linting, tests, and the architecture
contract already wired up.

## Prerequisites

The beta toolchain requires Node.js 20.19 or newer. The `craft` executable is
published by `@craft-ts/dev-tools`; it is not provided by the unrelated npm
package named `craft`.

For a new project, invoke the executable explicitly through `npx`:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app
```

The first `--yes` belongs to `npx`: it accepts the temporary package
installation. The command remains interactive because `craft create` itself
was not given `--yes`.

The command uses the published `beta` package. A checkout of CraftTS can
contain a newer creation flow than the version currently published on npm;
check the resolved version with `npm view @craft-ts/dev-tools@beta version` if
the prompts shown by your terminal do not match this page.

## Interactive creation

Run the command in a real terminal without `craft create --yes`:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app
```

The generator presents menus for:

- the frontend runtime: `plain` or `effect`;
- the backend runtime: `none`, `promise`, or `effect`;
- type-safe i18n, its locales, and its default locale;
- the design system;
- typed CSS;
- a standalone or Nx workspace;
- CraftTS and, when Effect is selected, EffectTS source references for agent
  context;
- integrations for Codex, Cursor, Claude Code, or Gemini CLI.

The frontend and backend choices are independent. To create a plain browser
application whose server functions use Effect v4, choose `plain` for the
frontend and `effect` for the backend.

Use `↑`/`↓` to move and `Enter` to confirm a single choice. For locales and
agent integrations, use `Space` to select or deselect several items, then
`Enter` to confirm. The project directory remains a text field because it is
a free-form path. If the directory is omitted, the generator asks for it too:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create
```

The agent question is a multi-selection list. Use `↑`/`↓` to move, `Space` to
select or deselect an integration, and `Enter` to confirm. Codex starts
selected, preserving the default used by scripted creation. Every starter
receives an `AGENTS.md` project guide describing its selected runtimes and
features; selected integrations additionally receive their editor-specific
project instructions and skills.

### Creating inside an existing Git repository

An existing `.git` directory makes the destination non-empty. Generate into
the current repository with `--force`:

```bash
cd pet-foster-family
npx --yes --package @craft-ts/dev-tools@beta craft create . --force
```

`--force` only permits writing into a non-empty destination; it does not turn
off the configuration prompts. Review generated file changes before
committing when the repository already contains application code.

During the interactive flow, reference sources are cloned by default:

- CraftTS sources go into `.references/craft-ts`;
- EffectTS sources are also cloned when an Effect frontend or backend is
  selected;
- the sources are available to agents without replacing the installed npm
  packages.

Answer `n` to opt out. In non-interactive mode, references remain opt-in so
that `--yes` does not silently perform network clones; use
`--references=craft-ts` or `--references=all` explicitly.

The cloned repositories are reference material for coding agents only. The
generated application always imports the published CraftTS and EffectTS npm
packages from `package.json`; it does not use `file:` dependencies or
TypeScript/Vite aliases to the clones. Use `npm run update:references` to fetch
the requested refs and refresh the recorded SHAs.

## Non-interactive creation

Pass `--yes` after `create` to use defaults and disable all prompts. Combine it
with explicit options when the generated configuration must be reproducible:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app \
  --yes --effect=none --agents=codex
```

For a minimal plain starter:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app \
  --yes --effect=none --i18n=none --design-system=none --no-typed-css \
  --agents=none
```

To create a backend-only Effect project and clone both reference sources:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create my-app \
  --yes --frontend-runtime=plain --backend-runtime=effect \
  --references=all
```

The main configuration options are:

| Option               | Values                                | Purpose                                                                 |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `--effect`           | `v4`, `none`                          | Select the Effect v4 or plain starter                                   |
| `--frontend-runtime` | `plain`, `effect`                     | Choose the frontend runtime                                             |
| `--backend-runtime`  | `none`, `promise`, `effect`           | Choose server functions                                                 |
| `--effect-scope`     | `none`, `frontend`, `backend`, `both` | Set Effect placement                                                    |
| `--agents`           | comma-separated names or `none`       | Add editor-specific agent integrations; `AGENTS.md` is always generated |
| `--i18n`             | `strict`, `loose`, `none`             | Configure type-safe i18n                                                |
| `--design-system`    | `basic`, `none`                       | Include the design-system starter                                       |
| `--typed-css`        | flag / `--no-typed-css`               | Enable or disable typed CSS                                             |
| `--workspace`        | `standalone`, `nx`                    | Choose the workspace layout                                             |
| `--references`       | `none`, `craft-ts`, `all`             | Include source references                                               |
| `--no-demos`         | flag                                  | Generate a domain feature without explanatory demo pages                |
| `--domain`           | slug                                  | Name the first domain feature when using `--no-demos`                   |
| `--force`            | flag                                  | Allow an existing non-empty destination                                 |
| `--json`             | flag                                  | Print the effective configuration as JSON                               |

Use `craft create --help` to see the complete list:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create --help
```

For a domain-first starting point, omit the explanatory home/services/about
pages and name the feature explicitly:

```bash
npx --yes --package @craft-ts/dev-tools@beta craft create pet-foster \
  --yes --no-demos --domain animal --frontend-runtime=effect \
  --backend-runtime=effect
```

The generated feature lives under `src/app/features/animal/`. Add a form to
that feature with the existing primitives and its unit/submission test:

```bash
craft add form animal
# advanced nested/schema variant:
craft add form animal --advanced
```

## After generation

The generator creates a Git repository when the destination is not already
inside another repository. It does not create a commit. The generated
`.gitignore` excludes `node_modules/`, build outputs, test reports, and local
reference clones.

Install dependencies and start the generated application:

```bash
cd my-app
npm install
npm run dev
```

The generated project also includes the following checks:

```bash
npm run lint
npm run typecheck
npm test
npm run architecture
npm run build
```

With a backend, `src/server/application.ts` owns the registry and runtime
Layer, while `src/server/node-http.ts` is only the Node stream adapter.
`server.ts` re-exports both for compatibility. In the backend-only Effect
profile, the browser remains plain CraftTS; Effect services, middleware and
error projections stay under the server boundary.

## Troubleshooting

### `could not determine executable to run`

If the error mentions `craft@0.1.0`, `npx` resolved the unrelated public npm
package named `craft`. Use the explicit `--package @craft-ts/dev-tools@beta`
form shown above.

If `@craft-ts/dev-tools` is already installed in the project, its local binary
can also be called with:

```bash
npx craft create my-app
```

The explicit form is still the safest command when bootstrapping a project
that has no `package.json` yet.
