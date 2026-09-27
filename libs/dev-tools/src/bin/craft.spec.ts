import { describe, expect, it } from 'vitest';
import { parseCreateArgs } from './craft.ts';

describe('craft create', () => {
  it.each(['--template-obligations', '--no-template-obligations'])(
    'does not accept the retired option %s',
    (option) => {
      expect(() => parseCreateArgs([option])).toThrow(
        `Unknown option ${option}.`,
      );
    },
  );
});
