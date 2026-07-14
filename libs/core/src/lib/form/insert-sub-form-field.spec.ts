import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import { mapLens, splitLens } from './field-lens';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import { insertSubFormField } from './insert-sub-form-field';
import { cRequired } from './validator';
import { craftUse } from '../craft-use';

describe('insertSubFormField', () => {
  it('exposes a derived sub-field that reads from the parent', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const dateForm = form.form.selectDate();
      expect(dateForm.value()).toBe('2026-05-10');
    });
  });

  it('writes back to the parent through the lens.write function', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(
            insertSubFormField('date', splitLens(' ', 0)),
            insertSubFormField('time', splitLens(' ', 1)),
          ),
        ),
      );

      form.form.selectDate().set('2026-05-11');
      TestBed.tick();
      expect(form()).toBe('2026-05-11 12:00');

      form.form.selectTime().set('09:30');
      TestBed.tick();
      expect(form()).toBe('2026-05-11 09:30');
    });
  });

  it('reflects external parent updates in the sub-field value', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const dateForm = form.form.selectDate();
      expect(dateForm.value()).toBe('2026-05-10');

      form.form.set('2027-01-01 18:00');
      TestBed.tick();
      expect(dateForm.value()).toBe('2027-01-01');
    });
  });

  it('runs validators registered via nested insertFormAttributes', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          ' 12:00',
          insertForm(
            insertSubFormField(
              'date',
              splitLens(' ', 0),
              insertFormAttributes(() => ({ validators: [cRequired()] })),
            ),
          ),
        ),
      );

      const dateForm = form.form.selectDate();
      expect(dateForm.invalid()).toBe(true);

      dateForm.set('2026-05-10');
      TestBed.tick();
      expect(dateForm.valid()).toBe(true);
    });
  });

  it('marks the parent dirty when the sub-field is edited', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      expect(form.form.dirty()).toBe(false);
      form.form.selectDate().set('2026-05-11');
      TestBed.tick();
      expect(form.form.dirty()).toBe(true);
    });
  });

  it('round-trips through splitLens (read → set → read)', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(
            insertSubFormField('date', splitLens(' ', 0)),
            insertSubFormField('time', splitLens(' ', 1)),
          ),
        ),
      );

      const dateForm = form.form.selectDate();
      const timeForm = form.form.selectTime();
      const initialDate = dateForm.value();
      dateForm.set(initialDate);
      TestBed.tick();
      expect(form()).toBe('2026-05-10 12:00');
      expect(timeForm.value()).toBe('12:00');
    });
  });

  it('supports two derived sub-fields on the same parent without collision', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(
            insertSubFormField('date', splitLens(' ', 0)),
            insertSubFormField('time', splitLens(' ', 1)),
          ),
        ),
      );

      expect(form.form.selectDate().value()).toBe('2026-05-10');
      expect(form.form.selectTime().value()).toBe('12:00');
    });
  });

  it('caches the derived form so repeated calls return the same instance', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const a = form.form.selectDate();
      const b = form.form.selectDate();
      expect(a).toBe(b);
    });
  });

  it('mapLens converts string ↔ number for nested numeric editing', () => {
    TestBed.runInInjectionContext(() => {
      const form = craftUse(
        state(
          { ageStr: '42' },
          insertForm(
            insertSelectFormTree(
              'ageStr',
              insertSubFormField(
                'asNumber',
                mapLens<string, number>(
                  (s) => Number(s),
                  (n) => String(n),
                ),
              ),
            ),
          ),
        ),
      );

      const ageStrForm = form.form.selectAgeStr();
      expect(ageStrForm).toBeDefined();
      const numberForm = (
        ageStrForm as unknown as {
          selectAsNumber: () => {
            value: () => number;
            set: (n: number) => void;
          };
        }
      ).selectAsNumber();

      expect(numberForm.value()).toBe(42);
      numberForm.set(43);
      TestBed.tick();
      expect(form().ageStr).toBe('43');
    });
  });
});
