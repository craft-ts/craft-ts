import { renderCraft } from '@craft-ts/component';
import type { Server } from '@craft-ts/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createDemoApplication,
  handleDemoNodeRequest,
} from '../../demo-with-server-function/src/server/server';
import {
  demoAuthenticatedUser,
  type AuthenticatedUser,
} from '../../demo-with-server-function/src/server/authentication';
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
  application?: Pick<Server, 'invoke'>,
): Promise<RenderResult> {
  const ownedDemo = application ? undefined : createDemoApplication();
  const activeApplication = application ?? ownedDemo?.application;
  if (!activeApplication) {
    throw new Error('SSR render did not receive a server-function application.');
  }

  try {
    const rendered = await renderCraft({
      config: createSsrAppConfig(activeApplication),
      url: `${url.pathname}${url.search}${url.hash}`,
    });
    const normalizedPath = url.pathname.replace(/\/$/, '') || '/';

    return {
      status: KNOWN_PATHS.has(normalizedPath) ? 200 : 404,
      html: documentShell(rendered.html, assets),
    };
  } finally {
    ownedDemo?.close();
  }
}

/** Handles the internal server-function protocol on the same Node process. */
export function handleServerFunctionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
): Promise<void> {
  return handleDemoNodeRequest(request, response, authenticatedUser);
}

/**
 * Resolves the demo session at the request boundary. A real application would
 * replace this with its authentication/session adapter; the important part is
 * that the resulting value is passed to a new runtime layer per request.
 */
export function authenticatedUserFromRequest(
  request: IncomingMessage,
): AuthenticatedUser {
  const idHeader = request.headers['x-demo-user-id'];
  const id = typeof idHeader === 'string' && idHeader.length > 0
    ? idHeader
    : demoAuthenticatedUser.id;
  // The role is resolved from the server-side session record, never from a
  // client-provided header. The header only selects a fixture identity for
  // this demo's request-boundary tests.
  const role = id === demoAuthenticatedUser.id ? demoAuthenticatedUser.role : 'member';

  return { ...demoAuthenticatedUser, id, role };
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
