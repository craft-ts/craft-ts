export type CraftSessionMode = 'update' | 'compare' | 'off';

export function resolveCraftSessionMode(
  env: Readonly<Record<string, string | undefined>>,
  options: Readonly<{ update?: 'on-success' | 'never' }> = {},
): CraftSessionMode {
  const configured = env['CRAFT_SESSIONS'];
  if (configured === 'off' || configured === 'compare' || configured === 'update') return configured;
  if (configured !== undefined) throw new Error('CRAFT_SESSIONS doit valoir off, compare ou update.');
  if (env['CI'] !== undefined) return 'compare';
  return options.update === 'never' ? 'compare' : 'update';
}
