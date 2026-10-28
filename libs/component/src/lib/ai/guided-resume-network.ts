import {
  craftException,
  ɵinstallCraftHttpResumeBarrier,
  type CraftHttpTraceContext,
} from '@craft-ts/core';

export type GuidedResumeMockCase =
  | Readonly<{ id: string; kind: 'success'; response: unknown }>
  | Readonly<{
      id: string;
      kind: 'exception';
      tag: string;
      scope?: string;
      payload?: unknown;
    }>
  | Readonly<{ id: string; kind: 'failure'; message: string }>;

export type GuidedResumeMockEndpoint = Readonly<{
  call: string;
  defaultCaseId?: string;
  cases: readonly GuidedResumeMockCase[];
}>;

export type GuidedResumeNetwork = Readonly<{
  mode: 'functional' | 'mocked';
  mocks: readonly GuidedResumeMockEndpoint[];
}>;

export type GuidedResumeMockResolution =
  | Readonly<{ active: false }>
  | Readonly<{ active: true; value: unknown }>
  | Readonly<{ active: true; error: Error }>;

let activeNetwork: GuidedResumeNetwork | undefined;
let activeChoices: Readonly<Record<string, string>> = {};
let restoreHttpBarrier: (() => void) | undefined;

/** Replace the current resume network mode. Mock mode always fails closed. */
export function setGuidedResumeNetwork(
  network: GuidedResumeNetwork | undefined,
  choices: Readonly<Record<string, string>> = {},
): void {
  restoreHttpBarrier?.();
  restoreHttpBarrier = undefined;
  activeNetwork = network?.mode === 'mocked' ? network : undefined;
  activeChoices = activeNetwork ? choices : {};
  if (!activeNetwork) return;

  restoreHttpBarrier = ɵinstallCraftHttpResumeBarrier({
    decide: (context) => {
      const resolution = resolveGuidedResumeMock(context);
      if (!resolution.active)
        return {
          kind: 'held',
          wait: Promise.reject(
            new Error('The mocked resume network is not configured.'),
          ),
        };
      if ('error' in resolution)
        return { kind: 'held', wait: Promise.reject(resolution.error) };
      return { kind: 'recorded', response: resolution.value };
    },
  });
}

/** True while the resumed tab must not let app HTTP calls reach a server. */
export function isGuidedResumeNetworkMocked(): boolean {
  return activeNetwork !== undefined;
}

/** Resolve a recipe's named mock for a Craft HTTP call or return a fail-closed error. */
export function resolveGuidedResumeMock(
  context: CraftHttpTraceContext,
): GuidedResumeMockResolution {
  const network = activeNetwork;
  if (!network) return { active: false };
  const payload = isRecord(context.payload) ? context.payload : undefined;
  const call = typeof payload?.['id'] === 'string' ? payload['id'] : undefined;
  const endpoint = network.mocks.find((mock) => mock.call === call);
  if (!endpoint)
    return {
      active: true,
      error: new Error(
        `Mode mocké : aucun jeu de données configuré pour l'appel ${call ?? `${context.method} ${context.url}`}. Aucune requête réelle n'a été envoyée.`,
      ),
    };
  const caseId = activeChoices[endpoint.call];
  const selected = endpoint.cases.find((candidate) => candidate.id === caseId);
  if (!selected)
    return {
      active: true,
      error: new Error(
        `Mode mocké : le cas ${caseId ?? '(aucun)'} n'existe pas pour ${endpoint.call}.`,
      ),
    };

  switch (selected.kind) {
    case 'success':
      return { active: true, value: selected.response };
    case 'exception':
      return {
        active: true,
        value: craftException(
          {
            _tag: selected.tag,
            scope: selected.scope ?? 'ServerFunction',
            identifier: endpoint.call,
          },
          selected.payload,
        ),
      };
    case 'failure':
      return { active: true, error: new Error(selected.message) };
  }
}

export function resolveGuidedResumeServerFunctionMock(
  call: string,
  input: unknown,
): GuidedResumeMockResolution {
  return resolveGuidedResumeMock({
    method: 'POST',
    url: '/__server-functions',
    payload: { id: call, input },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
