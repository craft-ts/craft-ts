# @craft-ng/core Documentation

This is the VitePress documentation site for @craft-ng/core.

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
├── index.md                # Homepage
├── get-started.md          # Installation guide
├── introduction.md         # Core concepts
├── primitives/             # Primitive APIs
│   ├── state.md
│   ├── async-process.md
│   ├── query-param.md
│   ├── query.md
│   └── mutation.md
├── insertions/             # Insertion features
│   ├── insert-local-storage.md
│   └── insert-react-on-mutation.md
├── store/                  # Store patterns
│   ├── craft.md
│   ├── craft-state.md
│   ├── craft-sources.md
│   ├── craft-inputs.md
│   ├── craft-computed.md
│   ├── craft-async-processed.md
│   ├── craft-query-param.md
│   ├── craft-query-params.md
│   ├── craft-query.md
│   ├── craft-mutation.md
│   ├── craft-set-all-queries-params-standalone.md
│   └── craft-inject.md
├── utils/                  # Utility functions
│   ├── source.md
│   ├── to-source.md
│   ├── stacked-source.md
│   └── source-from-event.md
├── examples.md             # Examples
└── press-kit.md            # Press kit & resources
```

## Adding Content

1. Create or edit markdown files in the appropriate directory
2. The sidebar is configured in `.vitepress/config.mts`
3. Add links to new pages in the sidebar configuration
4. Each page should include the import statement for the feature it documents

## Assets

Add images, logos, and other assets to `public/assets/`

- `ng-craft-logo.png` - Main logo
- `favicon.png` - Site favicon
