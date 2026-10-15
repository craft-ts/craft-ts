# @craft-ts Documentation

The Markdown pages of the `@craft-ts` documentation, and the tests that keep them true. The site
that draws them is [`apps/docs-herbier`](../docs-herbier).

The current beta requires Node.js 20.19+ (or 22.12+).

## Development

Start the documentation site:

```bash
nx serve docs-herbier
```

The site is at `http://localhost:4420`. A page is parsed and drawn when it is asked for.

## Build

```bash
nx build docs-herbier
```

The built site is in `dist/apps/docs-herbier/`.

## Tests

```bash
nx test docs
```

The specs in `tests/` check the pages: every `<<<` snippet import resolves to a region, the
examples compile, the sidebar lists the pages it should.

## Structure

```
apps/docs/
├── index.md                # Homepage and package overview
├── learn/                  # Guided tutorial
├── guide/                  # Task-oriented documentation
├── reference/              # Public API index
├── resources/              # Examples, migration, roadmap and press kit
├── public/                 # Images, logos and other static files
└── tests/                  # Specs and the code snippets the pages import
```

## Adding Content

1. Create or edit Markdown files in the appropriate directory.
2. Add the page to the sidebar in `apps/docs-herbier/src/server/site.ts`.
   `apps/docs-herbier/src/server/site.spec.ts` lists the pages that no sidebar has; a new one
   fails the test.
3. Each page should include the import statement for the feature it documents.

## Assets

Add images, logos, and other assets to `public/assets/`

- `craft-ts-logo.png` - Main logo
- `favicon.png` - Site favicon
