# @craft-ts Documentation

This is the VitePress documentation site for the `@craft-ts` packages.

The current beta supports Angular 21 with Node.js 20.19+ (or 22.12+).

## Development

Start the development server:

```bash
nx dev docs
# or
npm run docs:dev
```

The documentation site will be available at `http://localhost:5173`

## Build

Build the documentation site:

```bash
nx build docs
```

The built site will be in `apps/docs/.vitepress/dist/`

## Structure

```
apps/docs/
├── .vitepress/
│   ├── config.mts          # VitePress configuration
│   └── theme/              # Custom theme
├── index.md                # Homepage and package overview
├── learn/                  # Guided tutorial
├── guide/                  # Task-oriented documentation
├── reference/              # Public API index
└── resources/              # Examples, migration, roadmap and press kit
```

## Adding Content

1. Create or edit markdown files in the appropriate directory
2. The sidebar is configured in `.vitepress/config.mts`
3. Add links to new pages in the sidebar configuration
4. Each page should include the import statement for the feature it documents

## Assets

Add images, logos, and other assets to `public/assets/`

- `craft-ts-logo.png` - Main logo
- `favicon.png` - Site favicon
