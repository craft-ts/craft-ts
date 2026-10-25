import type { TestInfo } from '@playwright/test';

export const CRAFT_SESSION_ANNOTATION = 'craft-session';
export const CRAFT_SESSION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export type CraftSessionOptions = Readonly<{
  id: string;
  keep?: number;
  reason?: string;
  capture?: 'required' | 'none';
}>;

export type CraftSessionContract = Readonly<{
  id: string;
  keep: number;
  reason?: string;
  capture: 'required' | 'none';
}>;

export function craftSession(options: CraftSessionOptions) {
  return {
    type: CRAFT_SESSION_ANNOTATION,
    description: JSON.stringify(options),
  } as const;
}

export function parseCraftSessionAnnotation(
  annotations: readonly Readonly<{ type: string; description?: string }>[],
  testName = 'test',
): CraftSessionContract {
  const matching = annotations.filter((annotation) => annotation.type === CRAFT_SESSION_ANNOTATION);
  if (matching.length !== 1) throw new Error(`${testName}: une annotation craftSession(...) est obligatoire (exactement une).`);
  let value: unknown;
  try {
    value = JSON.parse(matching[0]?.description ?? '');
  } catch {
    throw new Error(`${testName}: l’annotation craft-session doit contenir un objet JSON valide.`);
  }
  if (!isRecord(value)) throw new Error(`${testName}: l’annotation craft-session doit contenir un objet.`);
  const { id, keep = 1, reason, capture = 'required' } = value;
  if (typeof id !== 'string' || id.length > 80 || !CRAFT_SESSION_ID.test(id))
    throw new Error(`${testName}: id craftSession invalide (format attendu, 80 caractères maximum).`);
  if (!Number.isInteger(keep) || Number(keep) < 1 || Number(keep) > 10)
    throw new Error(`${testName}: keep craftSession doit être un entier entre 1 et 10.`);
  if (Number(keep) > 1 && (typeof reason !== 'string' || reason.trim().length === 0))
    throw new Error(`${testName}: reason craftSession est obligatoire lorsque keep est supérieur à 1.`);
  if (reason !== undefined && typeof reason !== 'string')
    throw new Error(`${testName}: reason craftSession doit être une chaîne.`);
  if (capture !== 'required' && capture !== 'none')
    throw new Error(`${testName}: capture craftSession doit valoir 'required' ou 'none'.`);
  return { id, keep: Number(keep), ...(reason ? { reason } : {}), capture };
}

export function parseTestCraftSession(testInfo: TestInfo): CraftSessionContract {
  return parseCraftSessionAnnotation(testInfo.annotations, testInfo.titlePath.join(' › '));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
