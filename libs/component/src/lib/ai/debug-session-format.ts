import {
  DEBUG_SESSION_EXPORT_VERSION,
  DEBUG_SESSION_REPLAY_VERSION,
  type SendContextReplayExport,
} from '@craft-ts/core';

/** A one-version-at-a-time conversion to the next portable session schema. */
export type DebugSessionExportMigration = (
  value: Readonly<Record<string, unknown>>,
) => Readonly<Record<string, unknown>>;

/**
 * Add a migration here when a later schema can safely consume an older one.
 * Each entry is keyed by the source version and must return version + 1.
 * Missing entries mean that the format is intentionally unsupported.
 */
export const DEBUG_SESSION_EXPORT_MIGRATIONS: ReadonlyMap<
  number,
  DebugSessionExportMigration
> = new Map([[6, (value) => ({ ...value, version: 7 })]]);

/** Replay versions this dashboard explicitly promises to support. */
export const SUPPORTED_DEBUG_SESSION_REPLAY_VERSIONS: ReadonlySet<number> =
  new Set([DEBUG_SESSION_REPLAY_VERSION]);

export function supportsDebugSessionExportVersion(version: unknown): boolean {
  if (
    !Number.isSafeInteger(version) ||
    (version as number) < 1 ||
    (version as number) > DEBUG_SESSION_EXPORT_VERSION
  )
    return false;
  let current = version as number;
  while (current < DEBUG_SESSION_EXPORT_VERSION) {
    if (!DEBUG_SESSION_EXPORT_MIGRATIONS.has(current)) return false;
    current += 1;
  }
  return true;
}

/** Resume requires v7 reference provenance; v6 remains replayable after migration. */
export function supportsDebugSessionResume(input: unknown): boolean {
  return (
    isRecord(input) &&
    input['format'] === 'craft-debug-session' &&
    input['version'] === DEBUG_SESSION_EXPORT_VERSION &&
    input['referenceCaptureVersion'] === 1
  );
}

export function supportsDebugSessionReplayVersion(version: unknown): boolean {
  return (
    Number.isSafeInteger(version) &&
    SUPPORTED_DEBUG_SESSION_REPLAY_VERSIONS.has(version as number)
  );
}

export type DebugSessionFormatResult =
  | Readonly<{ ok: true; value: SendContextReplayExport }>
  | Readonly<{ ok: false; error: string }>;

/** Upgrade a portable export to the current schema using an explicit chain. */
export function migrateDebugSessionExport(
  input: Readonly<Record<string, unknown>>,
): DebugSessionFormatResult {
  const sourceVersion = input['version'];
  if (!Number.isSafeInteger(sourceVersion) || (sourceVersion as number) < 1)
    return {
      ok: false,
      error: 'La version du format de session est invalide.',
    };
  if ((sourceVersion as number) > DEBUG_SESSION_EXPORT_VERSION)
    return {
      ok: false,
      error: `Cette session utilise le format v${sourceVersion}, plus récent que le format pris en charge (v${DEBUG_SESSION_EXPORT_VERSION}). Mets à jour le dashboard pour la lire.`,
    };

  const replayVersion = input['replayVersion'] ?? DEBUG_SESSION_REPLAY_VERSION;
  if (!Number.isSafeInteger(replayVersion) || (replayVersion as number) < 1)
    return { ok: false, error: 'La version du replay est invalide.' };
  if (!supportsDebugSessionReplayVersion(replayVersion))
    return {
      ok: false,
      error: `Cette session utilise la version de replay v${replayVersion}, incompatible avec cette version du dashboard. Mets à jour le dashboard pour la rejouer.`,
    };

  let value: Readonly<Record<string, unknown>> = {
    ...input,
    replayVersion,
  };
  let version = sourceVersion as number;
  while (version < DEBUG_SESSION_EXPORT_VERSION) {
    const migrate = DEBUG_SESSION_EXPORT_MIGRATIONS.get(version);
    if (!migrate)
      return {
        ok: false,
        error: `Aucune migration n’est définie du format v${version} vers v${version + 1}. Cette session peut être inspectée avec une version compatible du dashboard.`,
      };
    try {
      const migrated = migrate(value);
      if (migrated['version'] !== version + 1)
        return {
          ok: false,
          error: `La migration du format v${version} doit produire une session v${version + 1}.`,
        };
      value = migrated;
      version += 1;
    } catch (error) {
      return {
        ok: false,
        error: `La migration du format v${version} a échoué : ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { ok: true, value: value as unknown as SendContextReplayExport };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
