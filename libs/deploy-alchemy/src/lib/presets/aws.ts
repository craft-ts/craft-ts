import type { CraftDeploymentRequest } from '@craft-ts/deploy';
import { alchemyResourceName } from '../naming.js';
import type { AlchemyResourceRequest } from '../runtime.js';
import {
  environmentNames,
  unsupported,
  type AlchemyPresetResult,
} from './preset.js';

/**
 * AWS preset.
 *
 * `lambda` is the first-class shape: one function per deployment unit, exposed
 * through Alchemy's built-in Function URL support. `static` uses Alchemy's
 * current `AWS.Website.StaticSite`. A generic CraftTS `node` artefact is
 * intentionally refused because Alchemy ECS needs an image, Docker context,
 * or an Effect server entrypoint that cannot be inferred from a start command.
 */
export function awsPreset(
  request: CraftDeploymentRequest,
): AlchemyPresetResult {
  const manifest = request.manifest;
  const name = (suffix: string) =>
    alchemyResourceName(manifest.name, request.stage, suffix);

  if (manifest.runtime === 'lambda') {
    const functionName = name('function');
    const resources: AlchemyResourceRequest[] = [
      {
        type: 'aws:Lambda.Function',
        name: functionName,
        properties: {
          entry: manifest.lambda.entry,
          environment: environmentNames(request),
          permissions: manifest.lambda.permissions.join(', '),
          functionUrl: true,
        },
      },
    ];
    const notes = [
      'The Function URL keeps the `{ id, input, context }` protocol, so a server-function behaves as it does locally.',
      ...(manifest.functions && manifest.functions.ids.length > 0
        ? [
            `${manifest.functions.ids.length} server-function(s) share this deployment unit.`,
          ]
        : []),
      ...(manifest.lambda.permissions.length === 0
        ? [
            'No permission is declared: the function will only reach what its default execution role allows.',
          ]
        : []),
    ];
    return { resources, notes, diagnostics: [] };
  }

  if (manifest.runtime === 'static') {
    const publicDir = manifest.artifact.publicDir;
    if (!publicDir) {
      return {
        resources: [],
        notes: [],
        diagnostics: [
          unsupported(
            'The static manifest declares no public directory to upload.',
            'Declare `client.outDir`, or `artifact.publicDir`.',
            request,
          ),
        ],
      };
    }
    const spa = manifest.static.mode === 'spa';
    return {
      resources: [
        {
          type: 'aws:Website.StaticSite',
          name: name('site'),
          properties: {
            path: publicDir,
            ...(spa ? { spa: true } : { errorPage: '404.html' }),
          },
        },
      ],
      notes: [
        spa
          ? `Unknown paths are rewritten to \`${manifest.static.fallback}\` by the distribution.`
          : `${manifest.static.routes.length} pre-rendered document(s) are served directly by the distribution.`,
      ],
      diagnostics: [],
    };
  }

  if (manifest.runtime === 'node') {
    return {
      resources: [],
      notes: ['A generic Node artefact is not converted to an ECS service automatically.'],
      diagnostics: [
        unsupported(
          'Alchemy ECS needs an image, Docker context or an Effect server entrypoint; a generic CraftTS Node start command is not enough.',
          'Deploy this Node artefact with the Docker provider, or add an AWS-specific container/image preset.',
          request,
        ),
      ],
    };
  }

  return {
    resources: [],
    notes: [],
    diagnostics: [
      unsupported(
        `AWS cannot execute the \`${manifest.runtime}\` runtime.`,
        'Use `lambda`, `static` or `node` on AWS.',
        request,
      ),
    ],
  };
}
