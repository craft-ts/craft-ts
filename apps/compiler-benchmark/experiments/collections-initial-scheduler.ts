import {
  FrameForScheduler,
  SyncForScheduler,
  type ForScheduler,
} from '@craft-ts/component';

/** Benchmark policy only: one progressive cohort, then synchronous updates. */
export class InitialForScheduler implements ForScheduler {
  private readonly sync = new SyncForScheduler();
  private pending = 0;
  private finished = false;
  private closed = false;
  private finishQueued = false;
  private readonly frame: ForScheduler & { destroy?(): void };
  constructor(
    frame: ForScheduler & {
      destroy?(): void;
    } = new FrameForScheduler(4),
  ) {
    this.frame = frame;
  }
  schedule(task: () => void) {
    if (this.closed) return { cancel() {} };
    if (this.finished) return this.sync.schedule(task);
    const ticket = { active: true };
    this.pending++;
    const handle = this.frame.schedule(() => {
      if (!ticket.active || this.closed) return;
      ticket.active = false;
      try {
        task();
      } finally {
        if (!this.closed) this.pending--;
        this.queueFinish();
      }
    });
    return {
      cancel: () => {
        if (!ticket.active) return;
        ticket.active = false;
        handle.cancel();
        if (!this.closed) this.pending--;
        this.queueFinish();
      },
    };
  }
  private queueFinish() {
    if (this.closed || this.finishQueued) return;
    this.finishQueued = true;
    // A source update may cancel its old queue and replace it in one turn.
    // Latch after that turn, so a transient empty queue does not end the phase.
    queueMicrotask(() => {
      this.finishQueued = false;
      if (!this.closed && this.pending === 0) this.finished = true;
    });
  }
  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.frame.destroy?.();
    this.pending = 0;
  }
}
