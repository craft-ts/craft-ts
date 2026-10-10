import { describe, expect, it } from 'vitest';
import { subject } from '../stream-kernel';
import { ApplicationInitStatus } from './craft-compat';

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ApplicationInitStatus', () => {
  it('is done once every synchronous and promise initializer has settled', async () => {
    const status = new ApplicationInitStatus([
      () => 1,
      () => Promise.resolve(2),
    ]);
    await status.donePromise;

    expect(status.done).toBe(true);
  });

  it('waits for a stream-shaped result (an `appStart` may return one) to complete', async () => {
    const pending = subject<number>();
    const status = new ApplicationInitStatus([() => pending]);
    pending.next(1);
    await settle();
    expect(status.done).toBe(false);

    pending.complete();
    await status.donePromise;

    expect(status.done).toBe(true);
  });

  it('fails when the stream ends with an exception or a defect', async () => {
    const typed = subject<number, { _tag: 'Boom' }>();
    const viaException = new ApplicationInitStatus([() => typed]);
    typed.exception({ _tag: 'Boom' });
    await expect(viaException.donePromise).rejects.toEqual({ _tag: 'Boom' });

    const defect = subject<number>();
    const failure = new Error('defect');
    const viaError = new ApplicationInitStatus([() => defect]);
    defect.error(failure);
    await expect(viaError.donePromise).rejects.toBe(failure);
  });

  it('does not treat a non-stream object as a stream', async () => {
    const status = new ApplicationInitStatus([() => ({ subscribe: 'nope' })]);
    await status.donePromise;

    expect(status.done).toBe(true);
  });
});
