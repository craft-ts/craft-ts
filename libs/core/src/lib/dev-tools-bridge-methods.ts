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
