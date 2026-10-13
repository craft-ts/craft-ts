import { describe, expect, it, vi } from 'vitest';
import {
  GUARD_AWAIT_REQUEST_MARKER,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';
import { awaitCraftProgramRequest } from './craft-program-runtime';
import { createEnvironmentInjector, Injector } from './host/craft-compat';
import { TemporalCancelledError } from './temporal-runtime';

function promiseRequest(
  value: PromiseLike<unknown>,
  cancel?: () => void,
): RuntimeGuardAwaitRequest {
  return {
    [GUARD_AWAIT_REQUEST_MARKER]: true,
    kind: 'promise',
    value,
    ...(cancel ? { cancel } : {}),
  };
}

describe('awaitCraftProgramRequest — promise requests with a cancel hook', () => {
  it('resolves with the value and never calls cancel once settled', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const controller = new AbortController();

    await expect(
      awaitCraftProgramRequest(
        promiseRequest(Promise.resolve(7), cancel),
        injector,
        controller.signal,
      ),
    ).resolves.toBe(7);
    controller.abort();
    injector.destroy();

    expect(cancel).not.toHaveBeenCalled();
  });

  it('rejects with the promise rejection and does not cancel', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const failure = new Error('nope');

    await expect(
      awaitCraftProgramRequest(
        promiseRequest(Promise.reject(failure), cancel),
        injector,
      ),
    ).rejects.toBe(failure);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('calls cancel and rejects with TemporalCancelledError on abort', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const controller = new AbortController();
    const pending = awaitCraftProgramRequest(
      promiseRequest(new Promise(() => undefined), cancel),
      injector,
      controller.signal,
    );

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('calls cancel at once when the signal is already aborted', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await expect(
      awaitCraftProgramRequest(
        promiseRequest(new Promise(() => undefined), cancel),
        injector,
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('calls cancel when the injector is destroyed (backstop without an abort signal)', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const pending = awaitCraftProgramRequest(
      promiseRequest(new Promise(() => undefined), cancel),
      injector,
    );

    injector.destroy();

    await expect(pending).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels at most once when abort and destroy both fire', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const cancel = vi.fn();
    const controller = new AbortController();
    const pending = awaitCraftProgramRequest(
      promiseRequest(new Promise(() => undefined), cancel),
      injector,
      controller.signal,
    );

    controller.abort();
    injector.destroy();

    await expect(pending).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('is a plain promise await when there is no cancel hook', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);

    await expect(
      awaitCraftProgramRequest(promiseRequest(Promise.resolve('ok')), injector),
    ).resolves.toBe('ok');
  });
});
