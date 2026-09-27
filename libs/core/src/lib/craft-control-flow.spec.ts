import { Injector, runInInjectionContext } from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CraftGenShortCircuit } from './craft-gen';
import { craftException } from './craft-exception';
import { CraftNotSettled, isCraftNotSettled } from './craft-settled';
import { isCraftControlFlow } from './craft-control-flow';
import {
  AppSnapshotRegistry,
  provideTakeAppSnapshot,
} from './take-app-snapshot';
import { craftUse } from './craft-use';
import { FN_WRAPPER, type FnWrapper } from './fn-wrapper';

afterEach(() => TestBed.resetTestingModule());

describe('isCraftControlFlow', () => {
  it('recognizes expected CraftTS control-flow throws', () => {
    expect(isCraftControlFlow(new CraftNotSettled('issue'))).toBe(true);
    expect(
      isCraftControlFlow(
        new CraftGenShortCircuit(craftException({ _tag: 'EXPECTED' })),
      ),
    ).toBe(true);
  });

  it('does not classify ordinary or unhandled errors as control flow', () => {
    expect(isCraftControlFlow(new Error('failure'))).toBe(false);
    expect(isCraftControlFlow(undefined)).toBe(false);
    expect(isCraftNotSettled(new Error('failure'))).toBe(false);
  });

  it('does not take app snapshots for expected control-flow throws', () => {
    const callback = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(callback)],
    });
    const wrapper = (TestBed.inject(FN_WRAPPER) as readonly FnWrapper[])[0];

    function* throwExpected(): Generator<never, never, unknown> {
      throw new CraftNotSettled('issue');
    }

    expect(() =>
      runInInjectionContext(TestBed.inject(Injector), () =>
        wrapper(throwExpected, undefined, []).next(),
      ),
    ).toThrow(CraftNotSettled);
    expect(callback).not.toHaveBeenCalled();
  });

  it('passes a direct app snapshot to the callback for an ordinary error', () => {
    const reports = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(reports)],
    });
    const registry = TestBed.runInInjectionContext(() =>
      craftUse(AppSnapshotRegistry()),
    );
    registry.registerSnapshotReader('test', ['component:test'], () => 1);
    const wrapper = (TestBed.inject(FN_WRAPPER) as readonly FnWrapper[])[0];

    function* throwUnexpected(): Generator<never, never, unknown> {
      throw new Error('failure');
    }

    expect(() =>
      runInInjectionContext(TestBed.inject(Injector), () =>
        wrapper(throwUnexpected, undefined, []).next(),
      ),
    ).toThrow('failure');
    expect(reports).toHaveBeenCalledOnce();
    expect(reports).toHaveBeenCalledWith([
      { source: 'test', from: ['component:test'], state: 1 },
    ]);
  });
});
