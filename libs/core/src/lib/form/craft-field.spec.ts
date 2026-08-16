import {
  computed,
  signal,
} from '../host/craft-compat';
import { TestBed } from '../host/craft-test-bed';
import { craftException } from '../craft-exception';
import { craftField, CraftValidator, FieldAttributeMeta } from './craft-field';

describe('craftField', () => {
  it('creates a field tree from an initial value', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ name: 'romain', age: 35 });

      expect(form.value()).toEqual({ name: 'romain', age: 35 });
      expect(form.name.value()).toBe('romain');
      expect(form.age.value()).toBe(35);
    });
  });

  it('preserves child identity across reads', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });

      expect(form.email).toBe(form.email);
    });
  });

  it('updates the model when set is called on a child', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });

      form.email.set('hello@example.com');

      expect(form.value()).toEqual({ email: 'hello@example.com' });
      expect(form.email.value()).toBe('hello@example.com');
    });
  });

  it('marks the field dirty after a set', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });

      expect(form.email.dirty()).toBe(false);
      expect(form.dirty()).toBe(false);

      form.email.set('foo');

      expect(form.email.dirty()).toBe(true);
      expect(form.dirty()).toBe(true);
    });
  });

  it('marks touched independently from dirty', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });

      form.email.ɵmarkTouched();

      expect(form.email.touched()).toBe(true);
      expect(form.touched()).toBe(true);
      expect(form.email.dirty()).toBe(false);
    });
  });

  it('resets value, dirty, and touched recursively', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });

      form.email.set('foo');
      form.email.ɵmarkTouched();
      expect(form.dirty()).toBe(true);
      expect(form.touched()).toBe(true);

      form.reset();

      expect(form.dirty()).toBe(false);
      expect(form.touched()).toBe(false);
      expect(form.email.dirty()).toBe(false);
      expect(form.email.touched()).toBe(false);
    });
  });

  it('patch updates a subset of properties', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ name: 'a', age: 1 });

      form.patch(() => ({ age: 42 }));

      expect(form.value()).toEqual({ name: 'a', age: 42 });
    });
  });

  it('runs registered sync validators and exposes errors', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      const requiredValidator: CraftValidator<string> = ({ value }) => ({
        result: computed(() =>
          value() === '' ? craftException({ code: 'required' }) : undefined,
        ),
      });
      form.email.ɵregisterValidator(requiredValidator);

      expect(form.email.errors().length).toBe(1);
      expect(form.email.errors()[0].code).toBe('required');
      expect(form.email.invalid()).toBe(true);
      expect(form.email.valid()).toBe(false);

      form.email.set('hello');
      expect(form.email.errors().length).toBe(0);
      expect(form.email.invalid()).toBe(false);
      expect(form.email.valid()).toBe(true);
    });
  });

  it('exposes native constraint metadata via signals', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ age: 0 });
      const minValidator: CraftValidator<number> = () => ({
        result: signal(undefined).asReadonly(),
        attribute: signal({
          kind: 'native-constraint',
          target: 'min',
          value: 5,
        } satisfies FieldAttributeMeta).asReadonly(),
      });
      form.age.ɵregisterValidator(minValidator);

      expect(form.age.min()).toBe(5);
    });
  });

  it('aggregates multiple required validators with OR semantics', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ name: '' });
      const requiredAttr: CraftValidator<string> = () => ({
        result: signal(undefined).asReadonly(),
        attribute: signal({
          kind: 'native-constraint',
          target: 'required',
          value: true,
        } satisfies FieldAttributeMeta).asReadonly(),
      });
      form.name.ɵregisterValidator(requiredAttr);

      expect(form.name.required()).toBe(true);
    });
  });

  it('inherits disabled state from a parent', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ profile: { name: '' } });
      const disableSource = signal(false);
      form.ɵregisterStateBinding('disabled', disableSource);

      expect(form.profile.disabled()).toBe(false);
      disableSource.set(true);
      expect(form.profile.disabled()).toBe(true);
      expect(form.profile.name.disabled()).toBe(true);
    });
  });

  it('resets force-resyncs registered controls via the reset trigger', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ email: '' });
      const trigger = form.email.ɵresetTrigger;
      const initial = trigger();

      form.email.set('foo');
      form.reset();

      expect(trigger()).toBeGreaterThan(initial);
    });
  });

  it('reset accepts an optional fresh value', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ name: 'a' });

      form.name.set('b');
      expect(form.name.value()).toBe('b');

      form.reset({ name: 'fresh' });

      expect(form.name.value()).toBe('fresh');
      expect(form.dirty()).toBe(false);
    });
  });

  it('treats pending validators as not invalid but pending', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftField({ name: '' });
      const pendingValidator: CraftValidator<string> = () => ({
        result: signal({ pending: true } as const).asReadonly(),
      });
      form.name.ɵregisterValidator(pendingValidator);

      expect(form.name.pending()).toBe(true);
      expect(form.name.invalid()).toBe(false);
      expect(form.name.valid()).toBe(false);
    });
  });
});
