import { afterEach, describe, expect, it, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CraftGenShortCircuit } from './craft-gen';
import { craftException } from './craft-exception';
import { CraftNotSettled, isCraftNotSettled } from './craft-settled';
import { isCraftControlFlow } from './craft-control-flow';
import {
  APP_SNAPSHOT_REGISTRY,
  provideTakeAppSnapshot,
} from './take-app-snapshot';
import { FN_WRAPPER } from './fn-wrapper';

afterEach(() => TestBed.resetTestingModule());

describe('isCraftControlFlow', () => {
  it('recognizes expected CraftNG control-flow throws', () => {
    expect(isCraftControlFlow(new CraftNotSettled('issue'))).toBe(true);
    expect(
      isCraftControlFlow(
        new CraftGenShortCircuit(craftException({ code: 'EXPECTED' })),
      ),
    ).toBe(true);
  });

  it('does not classify ordinary or unhandled errors as control flow', () => {
    expect(isCraftControlFlow(new Error('failure'))).toBe(false);
    expect(isCraftControlFlow(undefined)).toBe(false);
    expect(isCraftNotSettled(new Error('failure'))).toBe(false);
  });

  it('does not trigger app snapshots for expected control-flow throws', () => {
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(vi.fn())],
    });
    const registry = TestBed.inject(APP_SNAPSHOT_REGISTRY);
    const trigger = vi.fn();
    registry.triggerSnapshot$.subscribe(trigger);
    const wrapper = TestBed.inject(FN_WRAPPER)[0];

    function* throwExpected(): Generator<never, never, unknown> {
      throw new CraftNotSettled('issue');
    }

    expect(() => wrapper(throwExpected, undefined, []).next()).toThrow(
      CraftNotSettled,
    );
    expect(trigger).not.toHaveBeenCalled();
  });

  it('triggers an app snapshot for an ordinary error', () => {
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(vi.fn())],
    });
    const registry = TestBed.inject(APP_SNAPSHOT_REGISTRY);
    const trigger = vi.fn();
    registry.triggerSnapshot$.subscribe(trigger);
    const wrapper = TestBed.inject(FN_WRAPPER)[0];

    function* throwUnexpected(): Generator<never, never, unknown> {
      throw new Error('failure');
    }

    expect(() =>
      runInInjectionContext(TestBed.inject(Injector), () =>
        wrapper(throwUnexpected, undefined, []).next(),
      ),
    ).toThrow('failure');
    expect(trigger).toHaveBeenCalledOnce();
  });
});
