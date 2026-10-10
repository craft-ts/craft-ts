import type { Unsubscribable } from '@craft-ts/core';
import type { Teardown } from '../craft-stream';

type Task = (done: () => void) => Unsubscribable | void;

/**
 * Runs per-value handler tasks one at a time, in arrival order. When every
 * task settles synchronously the stage is a pass-through (nothing is queued,
 * nothing is reordered); a task that suspends makes later values wait — there
 * is no implicit buffer beyond that, and no concurrency.
 *
 * A terminal `complete` is deferred until the queue drains; `exception` and
 * `error` from upstream bypass the stage (the caller forwards them at once).
 */
export class SerialStage {
  private readonly queue: Task[] = [];
  private busy = false;
  private sequence = 0;
  private ended: (() => void) | undefined;
  private current: Unsubscribable | void | undefined = undefined;

  constructor(teardown: Teardown) {
    teardown.add(() => {
      this.queue.length = 0;
      this.ended = undefined;
      this.current?.unsubscribe();
    });
  }

  push(task: Task): void {
    this.queue.push(task);
    this.advance();
  }

  /** Runs `terminal` once the queue is empty and nothing is in flight. */
  end(terminal: () => void): void {
    this.ended = terminal;
    this.advance();
  }

  private advance(): void {
    while (!this.busy && this.queue.length > 0) {
      const task = this.queue.shift() as Task;
      const id = ++this.sequence;
      this.busy = true;
      const handle = task(() => {
        // Ignore a late or repeated completion of a task that is no longer current.
        if (id !== this.sequence || !this.busy) return;
        this.busy = false;
        this.current = undefined;
        this.advance();
      });
      // The task may already have settled (and a later one started) in place.
      if (this.busy && id === this.sequence) this.current = handle;
    }

    if (!this.busy && this.queue.length === 0 && this.ended) {
      const terminal = this.ended;
      this.ended = undefined;
      terminal();
    }
  }
}
