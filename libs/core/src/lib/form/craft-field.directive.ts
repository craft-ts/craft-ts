import {
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  isDevMode,
  OnDestroy,
  OnInit,
  Renderer2,
  untracked,
} from '@angular/core';
import {
  ControlSyncer,
  CraftCheckboxControl,
  CraftField,
  CraftValueControl,
} from './craft-field';

/**
 * Token used by custom controls to declare themselves as Craft form value controls.
 * A custom component should provide itself via this token to opt into [craftField] binding.
 *
 * @example
 * @Component({
 *   providers: [{ provide: CRAFT_FIELD_VALUE_CONTROL, useExisting: forwardRef(() => MyControl) }]
 * })
 * export class MyControl implements CraftValueControl<string> {
 *   readonly value = model<string>('');
 * }
 */
export const CRAFT_FIELD_VALUE_CONTROL = new InjectionToken<CraftValueControl<unknown>>(
  'CRAFT_FIELD_VALUE_CONTROL',
);

/**
 * Token used by custom checkbox-style controls to declare themselves as Craft form checkbox controls.
 */
export const CRAFT_FIELD_CHECKBOX_CONTROL = new InjectionToken<CraftCheckboxControl>(
  'CRAFT_FIELD_CHECKBOX_CONTROL',
);

type Strategy =
  | 'text'
  | 'numeric'
  | 'temporal'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'signal-value-control'
  | 'signal-checkbox-control'
  | 'unsupported';

const TEMPORAL_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week']);
const NUMERIC_TYPES = new Set(['number', 'range']);

@Directive({
  selector: '[craftField]',
  standalone: true,
  exportAs: 'craftField',
})
export class CraftFieldDirective<T> implements OnInit, OnDestroy {
  readonly craftField = input.required<CraftField<T>>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly injector = inject(Injector);
  private readonly customValueControl = inject(CRAFT_FIELD_VALUE_CONTROL, {
    optional: true,
    self: true,
  });
  private readonly customCheckboxControl = inject(CRAFT_FIELD_CHECKBOX_CONTROL, {
    optional: true,
    self: true,
  });

  private cleanupFns: Array<() => void> = [];
  private strategy: Strategy = 'unsupported';

  ngOnInit(): void {
    const el = this.elementRef.nativeElement;
    this.strategy = this.detectStrategy(el);

    switch (this.strategy) {
      case 'text':
        this.bindTextInput(el as HTMLInputElement | HTMLTextAreaElement);
        break;
      case 'numeric':
        this.bindNumericInput(el as HTMLInputElement);
        break;
      case 'temporal':
        this.bindTemporalInput(el as HTMLInputElement);
        break;
      case 'checkbox':
        this.bindCheckboxInput(el as HTMLInputElement);
        break;
      case 'radio':
        this.bindRadioInput(el as HTMLInputElement);
        break;
      case 'select':
        this.bindSelectInput(el as HTMLSelectElement);
        break;
      case 'signal-value-control':
        this.bindSignalValueControl();
        break;
      case 'signal-checkbox-control':
        this.bindSignalCheckboxControl();
        break;
      case 'unsupported':
      default:
        if (isDevMode()) {
          // eslint-disable-next-line no-console
          console.warn(
            `[craftField] Unsupported host element <${(el as HTMLElement).tagName?.toLowerCase()}>. ` +
              'Provide CRAFT_FIELD_VALUE_CONTROL or CRAFT_FIELD_CHECKBOX_CONTROL on the host component to enable binding.',
          );
        }
        break;
    }

    this.bindStateAttributes(el);
  }

  ngOnDestroy(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }

  // ---------------------- Strategy detection ----------------------

  private detectStrategy(el: HTMLElement): Strategy {
    if (this.customCheckboxControl) return 'signal-checkbox-control';
    if (this.customValueControl) return 'signal-value-control';

    const tag = el.tagName?.toUpperCase();
    if (tag === 'TEXTAREA') return 'text';
    if (tag === 'SELECT') return 'select';
    if (tag === 'INPUT') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (NUMERIC_TYPES.has(type)) return 'numeric';
      if (TEMPORAL_TYPES.has(type)) return 'temporal';
      return 'text';
    }
    return 'unsupported';
  }

  // ---------------------- Common state attributes ----------------------

  private bindStateAttributes(el: HTMLElement): void {
    const ref = effect(
      () => {
        const field = this.craftField();
        const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';

        // Disabled
        if (isInput) {
          (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled =
            field.disabled();
        } else {
          this.toggleAttribute(el, 'aria-disabled', field.disabled());
        }

        // Readonly (not on select)
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          (el as HTMLInputElement | HTMLTextAreaElement).readOnly = field.readonly();
        }

        // Required
        if (isInput) {
          (el as HTMLInputElement).required = field.required();
        }

        // Pattern
        if (el.tagName === 'INPUT') {
          const pattern = field.pattern();
          if (pattern) {
            this.renderer.setAttribute(el, 'pattern', pattern.source);
          } else {
            this.renderer.removeAttribute(el, 'pattern');
          }
        }

        // min/max — applies to numeric and temporal native inputs
        if (el.tagName === 'INPUT') {
          const inputEl = el as HTMLInputElement;
          const inputType = (inputEl.type || 'text').toLowerCase();
          const supportsMinMax = NUMERIC_TYPES.has(inputType) || TEMPORAL_TYPES.has(inputType);
          if (supportsMinMax) {
            const min = field.min();
            const max = field.max();
            if (min !== undefined) this.renderer.setAttribute(el, 'min', formatMinMax(min, inputType));
            else this.renderer.removeAttribute(el, 'min');
            if (max !== undefined) this.renderer.setAttribute(el, 'max', formatMinMax(max, inputType));
            else this.renderer.removeAttribute(el, 'max');
          }
        }

        // minLength/maxLength — text-style inputs only
        if (
          (el.tagName === 'INPUT' &&
            ['text', 'email', 'password', 'tel', 'url', 'search'].includes(
              ((el as HTMLInputElement).type || 'text').toLowerCase(),
            )) ||
          el.tagName === 'TEXTAREA'
        ) {
          const minLength = field.minLength();
          const maxLength = field.maxLength();
          if (minLength !== undefined && minLength >= 0) {
            this.renderer.setAttribute(el, 'minlength', String(minLength));
          } else {
            this.renderer.removeAttribute(el, 'minlength');
          }
          if (maxLength !== undefined && maxLength >= 0) {
            this.renderer.setAttribute(el, 'maxlength', String(maxLength));
          } else {
            this.renderer.removeAttribute(el, 'maxlength');
          }
        }

        // Hidden warning
        if (field.hidden() && isDevMode()) {
          // eslint-disable-next-line no-console
          console.warn(
            `[craftField] Field is marked hidden but is still rendered. Use @if (!field.hidden()) to remove it from the DOM.`,
          );
        }

        // Status CSS classes
        this.toggleClass(el, 'craft-disabled', field.disabled());
        this.toggleClass(el, 'craft-readonly', field.readonly());
        this.toggleClass(el, 'craft-required', field.required());
        this.toggleClass(el, 'craft-invalid', field.invalid());
        this.toggleClass(el, 'craft-valid', field.valid());
        this.toggleClass(el, 'craft-pending', field.pending());
        this.toggleClass(el, 'craft-dirty', field.dirty());
        this.toggleClass(el, 'craft-pristine', !field.dirty());
        this.toggleClass(el, 'craft-touched', field.touched());
        this.toggleClass(el, 'craft-untouched', !field.touched());
      },
      { injector: this.injector },
    );

    this.cleanupFns.push(() => ref.destroy());
  }

  private toggleAttribute(el: HTMLElement, name: string, value: boolean): void {
    if (value) this.renderer.setAttribute(el, name, 'true');
    else this.renderer.removeAttribute(el, name);
  }

  private toggleClass(el: HTMLElement, cls: string, on: boolean): void {
    if (on) this.renderer.addClass(el, cls);
    else this.renderer.removeClass(el, cls);
  }

  // ---------------------- Strategy: text ----------------------

  private bindTextInput(el: HTMLInputElement | HTMLTextAreaElement): void {
    const field = this.craftField as () => CraftField<string>;

    const writeValue = (next: unknown) => {
      const str = next === null || next === undefined ? '' : String(next);
      if (el.value !== str) el.value = str;
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(field().ɵregisterControl(syncer as ControlSyncer<string>));

    // Initial + reactive sync model -> UI
    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    // UI -> model
    const onInput = () => {
      (field().set as (v: unknown) => void)(el.value);
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: numeric ----------------------

  private bindNumericInput(el: HTMLInputElement): void {
    const field = this.craftField as () => CraftField<number | string | null>;

    const writeValue = (next: unknown) => {
      const str =
        next === null || next === undefined
          ? ''
          : typeof next === 'number'
            ? Number.isNaN(next)
              ? ''
              : String(next)
            : String(next);
      if (el.value !== str) el.value = str;
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(
      field().ɵregisterControl(syncer as ControlSyncer<number | string | null>),
    );

    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    const onInput = () => {
      const currentModel = untracked(() => field().value());
      let next: number | string | null;
      if (el.value === '') {
        next = currentModel === null ? null : '';
      } else if (typeof currentModel === 'string') {
        next = el.value;
      } else {
        next = el.valueAsNumber;
      }
      (field().set as (v: unknown) => void)(next);
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: temporal ----------------------

  private bindTemporalInput(el: HTMLInputElement): void {
    const field = this.craftField as () => CraftField<unknown>;

    const writeValue = (next: unknown) => {
      let str = '';
      if (next instanceof Date) {
        str = formatDateForInput(next, el.type);
      } else if (typeof next === 'number') {
        str = formatDateForInput(new Date(next), el.type);
      } else if (typeof next === 'string') {
        str = next;
      }
      if (el.value !== str) el.value = str;
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(field().ɵregisterControl(syncer));

    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    const onInput = () => {
      const currentModel = untracked(() => field().value());
      let next: unknown;
      if (currentModel instanceof Date) {
        next = el.valueAsDate ?? null;
      } else if (typeof currentModel === 'number') {
        next = el.valueAsNumber;
      } else {
        next = el.value;
      }
      (field().set as (v: unknown) => void)(next);
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: checkbox ----------------------

  private bindCheckboxInput(el: HTMLInputElement): void {
    const field = this.craftField as () => CraftField<boolean>;

    const writeValue = (next: unknown) => {
      el.checked = !!next;
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(field().ɵregisterControl(syncer as ControlSyncer<boolean>));

    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      (field().set as (v: unknown) => void)(el.checked);
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('change', onChange);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: radio ----------------------

  private bindRadioInput(el: HTMLInputElement): void {
    const field = this.craftField as () => CraftField<unknown>;

    const writeValue = (next: unknown) => {
      el.checked = next !== null && next !== undefined && el.value === String(next);
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(field().ɵregisterControl(syncer));

    // Set the radio name from the field path so radios bound to the same field group naturally
    const path = field().ɵpath;
    if (path.length > 0 && !el.name) {
      el.name = path.join('.');
    }

    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      if (el.checked) {
        (field().set as (v: unknown) => void)(el.value);
      }
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('change', onChange);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: select ----------------------

  private bindSelectInput(el: HTMLSelectElement): void {
    const field = this.craftField as () => CraftField<string>;

    const writeValue = (next: unknown) => {
      const str = next === null || next === undefined ? '' : String(next);
      if (el.value !== str) el.value = str;
    };

    const syncer: ControlSyncer<unknown> = {
      writeValue,
      resync: () => writeValue(field().value()),
    };
    this.cleanupFns.push(field().ɵregisterControl(syncer as ControlSyncer<string>));

    const ref = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => writeValue(v));
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      (field().set as (v: unknown) => void)(el.value);
    };
    const onBlur = () => field().ɵmarkTouched();
    el.addEventListener('change', onChange);
    el.addEventListener('blur', onBlur);
    this.cleanupFns.push(() => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('blur', onBlur);
    });
  }

  // ---------------------- Strategy: signal value control ----------------------

  private bindSignalValueControl(): void {
    const control = this.customValueControl as CraftValueControl<unknown> | null;
    if (!control) return;
    const field = this.craftField as () => CraftField<unknown>;
    let lastWrittenFromModel: unknown = Symbol('uninitialized');
    let lastReadFromControl: unknown = Symbol('uninitialized');

    // Model -> Control
    const modelEffect = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => {
          lastWrittenFromModel = v;
          if (control.value() !== v) {
            control.value.set(v);
          }
        });
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => modelEffect.destroy());

    // Control -> Model
    const controlEffect = effect(
      () => {
        const v = control.value();
        untracked(() => {
          if (v === lastWrittenFromModel) return;
          if (v === lastReadFromControl) return;
          lastReadFromControl = v;
          (field().set as (v: unknown) => void)(v);
        });
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => controlEffect.destroy());
  }

  // ---------------------- Strategy: signal checkbox control ----------------------

  private bindSignalCheckboxControl(): void {
    const control = this.customCheckboxControl as CraftCheckboxControl | null;
    if (!control) return;
    const field = this.craftField as () => CraftField<boolean>;
    let lastWrittenFromModel: boolean | symbol = Symbol('uninitialized');
    let lastReadFromControl: boolean | symbol = Symbol('uninitialized');

    const modelEffect = effect(
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => {
          lastWrittenFromModel = v;
          if (control.checked() !== v) control.checked.set(v);
        });
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => modelEffect.destroy());

    const controlEffect = effect(
      () => {
        const v = control.checked();
        untracked(() => {
          if (v === lastWrittenFromModel) return;
          if (v === lastReadFromControl) return;
          lastReadFromControl = v;
          (field().set as (v: boolean) => void)(v);
        });
      },
      { injector: this.injector },
    );
    this.cleanupFns.push(() => controlEffect.destroy());
  }
}

function formatMinMax(value: number | Date, inputType: string): string {
  if (value instanceof Date) return formatDateForInput(value, inputType);
  return String(value);
}

function formatDateForInput(date: Date, inputType: string): string {
  if (Number.isNaN(date.getTime())) return '';
  const t = inputType.toLowerCase();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  switch (t) {
    case 'date':
      return `${yyyy}-${mm}-${dd}`;
    case 'datetime-local':
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    case 'time':
      return `${hh}:${mi}`;
    case 'month':
      return `${yyyy}-${mm}`;
    case 'week': {
      // ISO week formatting; simplified
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
      const firstThursday = new Date(target.getFullYear(), 0, 4);
      const week =
        1 +
        Math.round(
          ((target.getTime() - firstThursday.getTime()) / 86400000 -
            3 +
            ((firstThursday.getDay() + 6) % 7)) /
            7,
        );
      return `${target.getFullYear()}-W${pad2(week)}`;
    }
    default:
      return date.toISOString();
  }
}
