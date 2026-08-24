import { state } from '../state';
import { mapLens, splitLens } from './field-lens';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import { insertSubFormField } from './insert-sub-form-field';
import { cRequired } from './validator';
import { craftUse } from '../craft-use';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from '../setup-craft-service-test';


const runInInjectionContext = <T>(fn: () => T): T => {
  const { injector } = setupCraftServiceTest();
  lastInjector = injector;
  return injector.run(fn);
};
let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const flushHost = () => flushCraftTest(lastInjector);

describe('insertSubFormField', () => {
  it('exposes a derived sub-field that reads from the parent', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const dateForm = form.form.selectDate();
      expect(dateForm.value()).toBe('2026-05-10');
    });
  });

  it('writes back to the parent through the lens.write function', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
          '2026-05-10 12:00',
          insertForm(
            insertSubFormField('date', splitLens(' ', 0)),
            insertSubFormField('time', splitLens(' ', 1)),
          ),
        ),
      );

      form.form.selectDate().set('2026-05-11');
      flushHost();
      expect(craftUse(form())).toBe('2026-05-11 12:00');

      form.form.selectTime().set('09:30');
      flushHost();
      expect(craftUse(form())).toBe('2026-05-11 09:30');
    });
  });

  it('reflects external parent updates in the sub-field value', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const dateForm = form.form.selectDate();
      expect(dateForm.value()).toBe('2026-05-10');

      form.form.set('2027-01-01 18:00');
      flushHost();
      expect(dateForm.value()).toBe('2027-01-01');
    });
  });

  it('runs validators registered via nested insertFormAttributes', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
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
      flushHost();
      expect(dateForm.valid()).toBe(true);
    });
  });

  it('marks the parent dirty when the sub-field is edited', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      expect(craftUse(form.form.dirty())).toBe(false);
      form.form.selectDate().set('2026-05-11');
      flushHost();
      expect(craftUse(form.form.dirty())).toBe(true);
    });
  });

  it('round-trips through splitLens (read → set → read)', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
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
      flushHost();
      expect(craftUse(form())).toBe('2026-05-10 12:00');
      expect(timeForm.value()).toBe('12:00');
    });
  });

  it('supports two derived sub-fields on the same parent without collision', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
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

  it('caches the derived form so repeated calls return the same instance', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
          '2026-05-10 12:00',
          insertForm(insertSubFormField('date', splitLens(' ', 0))),
        ),
      );

      const a = form.form.selectDate();
      const b = form.form.selectDate();
      expect(a).toBe(b);
    });
  });

  it('mapLens converts string ↔ number for nested numeric editing', async () => {
    await runInInjectionContext(async () => {
      const form = craftUse(
        state(
          'form',
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
      flushHost();
      expect(craftUse(form()).ageStr).toBe('43');
    });
  });
});
