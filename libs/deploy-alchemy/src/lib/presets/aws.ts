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
 * through a Function URL so a server-function keeps the same protocol it has
 * locally. `static` becomes a bucket behind a distribution, and `node` falls
 * back to a Fargate service because nothing else on AWS runs a long-lived Node
 * server without more infrastructure than a manifest describes.
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
        type: 'aws:LambdaFunction',
        name: functionName,
        properties: {
          entry: manifest.lambda.entry,
          environment: environmentNames(request),
          permissions: manifest.lambda.permissions.join(', '),
        },
      },
      {
        type: 'aws:LambdaFunctionUrl',
        name: name('function-url'),
        properties: { function: functionName, authType: 'NONE' },
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
    const bucketName = name('assets');
    const spa = manifest.static.mode === 'spa';
    return {
      resources: [
        {
          type: 'aws:Bucket',
          name: bucketName,
          properties: { directory: publicDir, public: false },
        },
        {
          type: 'aws:CloudFrontDistribution',
          name: name('cdn'),
          properties: {
            origin: bucketName,
            defaultRootObject: 'index.html',
            ...(spa
              ? { notFoundResponse: manifest.static.fallback }
              : { prerenderedRoutes: manifest.static.routes.length }),
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
    if (!manifest.artifact.start) {
      return {
        resources: [],
        notes: [],
        diagnostics: [
          unsupported(
            'A Fargate service needs a start command and the manifest declares none.',
            'Declare `server.start`, or `artifact.start`.',
            request,
          ),
        ],
      };
    }
    const clusterName = name('cluster');
    return {
      resources: [
        {
          type: 'aws:EcsCluster',
          name: clusterName,
          properties: {},
        },
        {
          type: 'aws:EcsService',
          name: name('service'),
          properties: {
            cluster: clusterName,
            start: manifest.artifact.start,
            healthPath: manifest.server.healthPath,
            readyPath: manifest.server.readyPath,
            environment: environmentNames(request),
          },
        },
      ],
      notes: [
        'The Fargate fallback runs the artefact as a container: the image build stays outside CraftTS.',
        `Readiness is taken from \`${manifest.server.readyPath}\`, so a rollout waits for the application, not for the container.`,
      ],
      diagnostics: [],
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
