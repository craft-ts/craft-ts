# docs-herbier

The documentation of `@craft-ts`, drawn with `@craft-ts/docs-ui` (the Herbier theme) instead of
VitePress. It reads the Markdown of [`apps/docs`](../docs) **in place** — nothing is copied — and
takes its navigation from the VitePress configuration of that app, so the two sites show the same
pages under the same sections and can be put side by side.

```bash
nx serve docs-herbier      # http://localhost:4420  — a page is parsed and drawn when asked for
nx build docs-herbier      # dist/apps/docs-herbier
nx preview docs-herbier    # http://localhost:4421/craft/  — the built site, served under its base
nx serve docs              # the VitePress site, http://localhost:5173, to compare
```

## How a page is made

1. **Parse.** `@craft-ts/docs-ui/node` turns a Markdown file into a tree (`parsePage`), and
   `rebasePage` resolves its links and images for the base (`/craft/` when built, `/` in dev).
2. **Draw.** `renderCraft` renders `DocsRoot` with that page on the server. The HTML is the page.
3. **Hydrate.** The browser bundle reads the same page from `#__DOCS_DATA__` and `startCraft`
   claims the HTML. Pages are separate documents: following a link loads the next page, as a
   static site does.

`nx build` is three steps in order: the browser bundle (it writes the manifest the pages link),
the prerender script bundled for Node, then the script itself, which writes every page, `404.html`,
`search-index.json` and `llms.txt`.

## What is the site's own

`src/components`: the author's note, the "Start with an agent" card and the template migrator —
the three things the VitePress theme carried as Vue components. Everything else is `docs-ui`.

## Settings

| Variable | Default | |
| --- | --- | --- |
| `DOCS_SRC` | `apps/docs` | the Markdown folder |
| `DOCS_BASE` | `/craft/` built, `/` in dev | where the site is mounted |
| `DOCS_ORIGIN` | `https://craft-ts.github.io` | the host `llms.txt` links to |
| `DOCS_OUT` | `dist/apps/docs-herbier` | where `nx build` writes (and `preview` reads) |
