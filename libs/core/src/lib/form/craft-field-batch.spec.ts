import { TestBed } from '../host/craft-test-bed';
import { craftWatch } from '../host/craft-signal';
import { craftField } from './craft-field';
import { describe, expect, it } from 'vitest';

// A field says several things about itself (its value, whether it is dirty, whether it
// is touched), and so does every ancestor. Effects run synchronously, so each separate
// write wakes a reader on a mixture of old and new. The witness notes what it sees on
// every run: a write to a field is ONE run, on a state that exists.
function witness(read: () => string) {
  const seen: string[] = [];
  const watch = craftWatch(() => {
    seen.push(read());
  });
  seen.length = 0;
  return { seen, stop: () => watch.destroy() };
}

describe('a field publishing a change', () => {
  it('shows the new value with the dirty state it belongs to, and the parent with it', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      const { seen, stop } = witness(
        () =>
          `${form.email.value()}|${form.email.dirty()}|${form.dirty()}`,
      );

      form.email.set('a@b.c');

      expect(seen).toEqual(['a@b.c|true|true']);
      stop();
    });
  });

  it('marks a child touched and its parent in one step', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      const { seen, stop } = witness(
        () => `${form.email.touched()}|${form.touched()}`,
      );

      form.email.ɵmarkTouched();

      expect(seen).toEqual(['true|true']);
      stop();
    });
  });

  it('clears touched on a child and its parent in one step', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      form.email.ɵmarkTouched();
      const { seen, stop } = witness(
        () => `${form.email.touched()}|${form.touched()}`,
      );

      form.email.ɵmarkUntouched();

      expect(seen).toEqual(['false|false']);
      stop();
    });
  });

  it('marks a child dirty and its parent in one step', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      const { seen, stop } = witness(
        () => `${form.email.dirty()}|${form.dirty()}`,
      );

      form.email.ɵmarkDirty();

      expect(seen).toEqual(['true|true']);
      stop();
    });
  });

  it('puts a reset form back as one step: value, dirty and touched, children included', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '', name: '' });
      form.email.set('a@b.c');
      form.name.set('n');
      form.email.ɵmarkTouched();
      const { seen, stop } = witness(
        () =>
          [
            JSON.stringify(form.value()),
            form.dirty(),
            form.touched(),
            form.email.dirty(),
            form.email.touched(),
            form.name.dirty(),
          ].join('|'),
      );

      form.reset({ email: '', name: '' });

      expect(seen).toEqual(['{"email":"","name":""}|false|false|false|false|false']);
      stop();
    });
  });

  it('resets a child and tells its parent in the same step', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      form.email.set('a@b.c');
      form.email.ɵmarkTouched();
      const { seen, stop } = witness(
        () =>
          `${form.email.value()}|${form.email.dirty()}|${form.dirty()}|${form.touched()}`,
      );

      form.email.reset('');

      expect(seen).toEqual(['|false|false|false']);
      stop();
    });
  });
});
