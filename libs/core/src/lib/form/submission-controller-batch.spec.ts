import { describe, expect, it } from 'vitest';
import { craftWatch } from '../host/craft-signal';
import { createSubmissionController } from './insert-form-internals';

// "A submission is under way" implies "a submission was attempted". The two are written
// one after the other, and effects run synchronously, so a reader woken in between sees a
// form submitting without any attempt, or the reverse after a reset.
function witness(read: () => string) {
  const seen: string[] = [];
  const watch = craftWatch(() => {
    seen.push(read());
  });
  seen.length = 0;
  return { seen, stop: () => watch.destroy() };
}

describe('the submission controller publishing a change', () => {
  it('starts a submission and records the attempt in one step', () => {
    const controller = createSubmissionController();
    const { seen, stop } = witness(
      () => `${controller.hasAttemptedSubmit()}|${controller.submitting()}`,
    );

    controller.setSubmitting(true);

    expect(seen).toEqual(['true|true']);
    stop();
  });

  it('resets the attempt and the submission in one step', () => {
    const controller = createSubmissionController();
    controller.setSubmitting(true);
    const { seen, stop } = witness(
      () => `${controller.hasAttemptedSubmit()}|${controller.submitting()}`,
    );

    controller.reset();

    expect(seen).toEqual(['false|false']);
    stop();
  });
});
