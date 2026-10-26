import {
  applyCraftPageActions,
  collectCraftPageControls,
  isCraftPageAction,
} from './dev-tools-page-actor';

/**
 * Methods a development tab answers over the MCP bridge, besides `page`.
 * Other libraries add their own (the guided resume adds `app/*`), so the
 * bridge stays one socket per tab whatever drives it.
 */
export type CraftMcpBridgeMethod = (
  params: Readonly<Record<string, unknown>>,
) => unknown;

const methods = new Map<string, CraftMcpBridgeMethod>();

/** Answers `name` from this tab; returns what removes it again. */
export function ɵregisterCraftMcpBridgeMethod(
  name: string,
  method: CraftMcpBridgeMethod,
): () => void {
  methods.set(name, method);
  return () => {
    if (methods.get(name) === method) methods.delete(name);
  };
}

export function ɵcraftMcpBridgeMethod(
  name: string,
): CraftMcpBridgeMethod | undefined {
  return methods.get(name);
}

/**
 * One request from the broker. `page` answers the page surface the broker
 * expects (`url`, `title`, `controls`), after running `act`; any other method
 * is one a library registered.
 */
export async function ɵanswerCraftBridgeRequest(
  method: string,
  params: Readonly<Record<string, unknown>>,
  navigate: (path: string) => Promise<unknown>,
): Promise<unknown> {
  if (method === 'page') {
    const act = Array.isArray(params['act']) ? params['act'] : [];
    if (!act.every(isCraftPageAction)) throw new Error('page act has an invalid action');
    const outcome = await applyCraftPageActions(globalThis.document, act, navigate);
    return {
      url: globalThis.location.href,
      title: globalThis.document.title,
      status: 'ready',
      controls: collectCraftPageControls(globalThis.document),
      ...outcome,
    };
  }
  const registered = ɵcraftMcpBridgeMethod(method);
  if (!registered) throw new Error(`This app does not answer ${method}.`);
  return registered(params);
}
