# docs-herbier

The documentation of `@craft-ts`, drawn with `@craft-ts/docs-ui` (the Herbier theme). It reads
the Markdown of [`apps/docs`](../docs) **in place** — nothing is copied — and does not depend on
VitePress: the navigation (top bar and sidebars) is its own, in `src/server/site.ts`.

```bash
nx serve docs-herbier      # http://localhost:4420  — a page is parsed and drawn when asked for
nx build docs-herbier      # dist/apps/docs-herbier
nx preview docs-herbier    # http://localhost:4421/craft/  — the built site, served under its base
```

## How a page is made

1. **Parse.** `@craft-ts/docs-ui/node` turns a Markdown file into a tree (`parsePage`), and
   `rebasePage` resolves its links and images for the base (`/craft/` when built, `/` in dev).
2. **Draw.** `renderCraft` renders `DocsRoot` with that page on the server. The HTML is the page.
3. **Hydrate.** The browser bundle reads the same page from `#__DOCS_DATA__` and `startCraft`
   claims the HTML. Pages are separate documents: following a link loads the next page, as a
   static site does.

`nx build` is three steps in order: the browser bundle (it writes the manifest the pages link),
the prerender script bundled for Node, then the script itself, which writes every page, `404.html`
and `search-index.json`. For coding agents it also writes the Markdown of each page (`guide/a.md`,
`guide.md` for `/guide/`, imports written out), `llms.txt` (linking those files) and `llms-full.txt`
(all of them, in sidebar order).

A heading's id is the one VitePress gave it (so an old anchor still lands), or the one written at
its end: `## Report {#report}`.

## What is the site's own

`src/components`: the author's note, the "Start with an agent" card and the template migrator —
the three things the old VitePress theme carried as Vue components. Everything else is `docs-ui`.

`src/server/site.ts` is the site's navigation: the sections of the top bar and the sidebars, by
path prefix. A page that no sidebar lists still renders, but has no entry highlighted and no
previous/next; `src/server/site.spec.ts` fixes the list of such pages so a new one fails the test.

## Settings

| Variable | Default | |
| --- | --- | --- |
| `DOCS_SRC` | `apps/docs` | the Markdown folder |
| `DOCS_BASE` | `/craft/` built, `/` in dev | where the site is mounted |
| `DOCS_ORIGIN` | `https://craft-ts.github.io` | the host `llms.txt` links to |
| `DOCS_OUT` | `dist/apps/docs-herbier` | where `nx build` writes (and `preview` reads) |
