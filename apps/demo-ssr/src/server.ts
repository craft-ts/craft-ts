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
import { DEMO_SECURITY_POLICY } from './app/security-policy';

export type RenderResult = Readonly<{ status: number; html: string }>;
export type RenderAssets = Readonly<{
  scriptSrc: string;
  styleHref: string;
}>;
export type RenderMetadata = Readonly<{
  title: string;
  description: string;
  canonical: string;
  robots: string;
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
  cspNonce?: string,
): Promise<RenderResult> {
  const ownedDemo = application ? undefined : createDemoApplication();
  const activeApplication = application ?? ownedDemo?.application;
  if (!activeApplication) {
    throw new Error(
      'SSR render did not receive a server-function application.',
    );
  }

  try {
    const rendered = await renderCraft({
      config: createSsrAppConfig(activeApplication),
      url: `${url.pathname}${url.search}${url.hash}`,
      // Le transfert est fermé par défaut : cette démo déclare ce qu'elle
      // accepte de faire voyager jusqu'au navigateur, adresse par adresse.
      securityPolicy: DEMO_SECURITY_POLICY,
      ...(cspNonce ? { cspNonce } : {}),
    });
    const normalizedPath = url.pathname.replace(/\/$/, '') || '/';

    const status = KNOWN_PATHS.has(normalizedPath) ? 200 : 404;
    return {
      status,
      html: documentShell(rendered.html, assets, metadataFor(url, status)),
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
  const id =
    typeof idHeader === 'string' && idHeader.length > 0
      ? idHeader
      : demoAuthenticatedUser.id;
  // The role is resolved from the server-side session record, never from a
  // client-provided header. The header only selects a fixture identity for
  // this demo's request-boundary tests.
  const role =
    id === demoAuthenticatedUser.id ? demoAuthenticatedUser.role : 'member';

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

function metadataFor(url: URL, status: number): RenderMetadata {
  const normalizedPath = url.pathname.replace(/\/$/, '') || '/';
  const metadata = PAGE_METADATA[normalizedPath] ?? PAGE_METADATA['/'];
  const origin = process.env.PUBLIC_ORIGIN ?? 'http://localhost:4300';
  const canonical = new URL(normalizedPath, origin).toString();
  return {
    ...metadata,
    canonical,
    robots: status === 200 ? 'index,follow' : 'noindex,nofollow',
  };
}

const PAGE_METADATA: Readonly<
  Record<string, Omit<RenderMetadata, 'canonical' | 'robots'>>
> = {
  '/': {
    title: 'SSR lab · CraftTS',
    description: 'Démonstration SSR et hydratation avec CraftTS.',
  },
  '/static': {
    title: 'Rendu statique · SSR lab',
    description: 'Une page CraftTS rendue entièrement côté serveur.',
  },
  '/request': {
    title: 'Contexte de requête · SSR lab',
    description: 'Une page SSR personnalisée par les paramètres de requête.',
  },
  '/data': {
    title: 'Données bloquantes · SSR lab',
    description: 'Une query résolue côté serveur avant le premier rendu.',
  },
  '/fallback': {
    title: 'Fallback SSR · SSR lab',
    description: 'Un shell SSR affiché avant une donnée différée.',
  },
  '/client-only': {
    title: 'Client only · SSR lab',
    description: 'Une donnée disponible uniquement après hydratation.',
  },
};

function documentShell(
  body: string,
  assets: RenderAssets,
  metadata: RenderMetadata,
): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta name="robots" content="${metadata.robots}" />
    <link rel="canonical" href="${escapeHtml(metadata.canonical)}" />
    <meta property="og:title" content="${escapeHtml(metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(metadata.canonical)}" />
    <link rel="stylesheet" href="${assets.styleHref}" />
  </head>
  <body>
    ${body}
    <script type="module" src="${assets.scriptSrc}"></script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}
