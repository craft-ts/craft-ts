import { describe, expect, it } from 'vitest';
import {
  migrateDebugSessionExport,
  supportsDebugSessionExportVersion,
} from './debug-session-format';

describe('debug session format', () => {
  it('keeps v6 archives replayable by migrating them to v7', () => {
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
    const migrated = migrateDebugSessionExport(v6);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) expect(migrated.value.version).toBe(7);
  });
});
