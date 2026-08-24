import { describe, expect, it } from 'vitest';
import { alchemyResourceName } from './naming.js';

describe('alchemyResourceName', () => {
  it('always carries the stage, so a preview cannot overwrite production', () => {
    expect(alchemyResourceName('demo', 'preview-42', 'worker')).toBe(
      'demo-preview-42-worker',
    );
    expect(alchemyResourceName('demo', 'production', 'worker')).toBe(
      'demo-production-worker',
    );
  });

  it('reduces anything a platform would reject', () => {
    expect(alchemyResourceName('Demo App', 'PR/42', 'KV_SESSIONS')).toBe(
      'demo-app-pr-42-kv-sessions',
    );
  });

  it('drops the parts that reduce to nothing', () => {
    expect(alchemyResourceName('demo', '', 'site')).toBe('demo-site');
  });
});
