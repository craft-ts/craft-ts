import { describe, expect, it } from 'vitest';
import {
  migrateDebugSessionExport,
  supportsDebugSessionExportVersion,
  supportsDebugSessionResume,
} from './debug-session-format';

describe('debug session format', () => {
  it('keeps v6 archives replayable while refusing them for verified resume', () => {
    const v6 = {
      format: 'craft-debug-session',
      version: 6,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      events: [],
      clips: [],
    };

    expect(supportsDebugSessionExportVersion(6)).toBe(true);
    expect(supportsDebugSessionResume(v6)).toBe(false);
    const migrated = migrateDebugSessionExport(v6);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.value.version).toBe(7);
      expect(supportsDebugSessionResume(migrated.value)).toBe(false);
    }
  });

  it('allows verified resume only for archives carrying reference metadata', () => {
    expect(
      supportsDebugSessionResume({
        format: 'craft-debug-session',
        version: 7,
        referenceCaptureVersion: 1,
      }),
    ).toBe(true);
  });
});
