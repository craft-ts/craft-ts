import { describe, expect, it } from 'vitest';
import {
  migrateDebugSessionExport,
  supportsDebugSessionExportVersion,
} from './debug-session-format';

describe('debug session format', () => {
  it('migrates v6 and v7 archives to the current v8 transport contract', () => {
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
    if (migrated.ok) {
      expect(migrated.value.version).toBe(8);
      expect(migrated.value.transportEventVersion).toBe(1);
    }

    const v7 = migrateDebugSessionExport({ ...v6, version: 7 });
    expect(v7.ok).toBe(true);
    if (v7.ok) expect(v7.value.version).toBe(8);
  });
});
