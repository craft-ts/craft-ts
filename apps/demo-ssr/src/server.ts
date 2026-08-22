import { renderCraft } from '@craft-ts/component';
import { createSsrAppConfig } from './app/app.config';

export type RenderResult = Readonly<{ status: number; html: string }>;
export type RenderAssets = Readonly<{
  scriptSrc: string;
  styleHref: string;
}>;

const DEVELOPMENT_ASSETS: RenderAssets = {
  scriptSrc: '/src/main.ts',
  styleHref: '/src/styles.css',
};

const KNOWN_PATHS = new Set([
  '/',
  '/static',
  '/request',
  '/data',
  '/fallback',
  '/client-only',
]);

export async function renderPage(
  url: URL,
  assets: RenderAssets = DEVELOPMENT_ASSETS,
): Promise<RenderResult> {
  const rendered = await renderCraft({
    config: createSsrAppConfig(),
    url: `${url.pathname}${url.search}${url.hash}`,
  });
  const normalizedPath = url.pathname.replace(/\/$/, '') || '/';

  return {
    status: KNOWN_PATHS.has(normalizedPath) ? 200 : 404,
    html: documentShell(rendered.html, assets),
  };
}

export async function renderDeferredApi(): Promise<{
  readonly message: string;
  readonly generatedAt: string;
}> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  return {
    message: 'Le bloc différé est arrivé après le premier rendu.',
    generatedAt: new Date().toLocaleTimeString('fr-FR'),
  };
}

function documentShell(body: string, assets: RenderAssets): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>SSR lab · CraftTS</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Démonstration SSR et hydratation avec CraftTS." />
    <link rel="stylesheet" href="${assets.styleHref}" />
  </head>
  <body>
    ${body}
    <script type="module" src="${assets.scriptSrc}"></script>
  </body>
</html>`;
}
