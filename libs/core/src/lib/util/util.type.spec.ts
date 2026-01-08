import { Equal, Expect } from 'test-type';
import { FlatRecord } from './util.type';

describe('FlatRecord', () => {
  it('should flatten a record type', () => {
    type Result = FlatRecord<{
      a: { x: number; y: string };
      b: { z: boolean };
    }>;
    type Expected = { x: number; y: string; z: boolean };
    type _Test = Expect<Equal<Result, Expected>>;
  });
});
