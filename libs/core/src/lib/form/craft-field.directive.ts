import {
  effect,
  InjectionToken,
  Injector,
  isDevMode,
  Renderer2,
  type Signal,
  untracked,
} from '@angular/core';
import type { GetDeps } from '../branded-component/branded-component';
import { REACTIVE_VALUE_TYPE, rawReactiveFacade } from '../reactive-read';
import {
  CRAFT_NODE_EFFECT_FACTORY,
  craftNodeDirective,
  type CraftNodeDirective,
  type CraftNodeEffectFactory,
} from '../craft-node-directive';
import type { CraftDomAdapter } from '../host/craft-dom';
import {
  ControlSyncer,
  CraftCheckboxControl,
  CraftField,
  CraftValueControl,
  isCraftField,
} from './craft-field';
import {
  CRAFT_FIELD_EXCEPTION_BOUNDARY,
  CRAFT_FIELD_EXCEPTION_SOURCE,
  type CraftFieldExceptionSourceCarrier,
  type CraftFieldValidationCasesCarrier,
  type FieldValidationCasesOf,
} from './field-exception';

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
export const CRAFT_FIELD_VALUE_CONTROL = new InjectionToken<
  CraftValueControl<unknown>
>('CRAFT_FIELD_VALUE_CONTROL');

/**
 * Token used by custom checkbox-style controls to declare themselves as Craft form checkbox controls.
 */
export const CRAFT_FIELD_CHECKBOX_CONTROL =
  new InjectionToken<CraftCheckboxControl>('CRAFT_FIELD_CHECKBOX_CONTROL');

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

const TEMPORAL_TYPES = new Set([
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
]);
const NUMERIC_TYPES = new Set(['number', 'range']);

export class CraftFieldBinding<T> {
  private cleanupFns: Array<() => void> = [];
  private strategy: Strategy = 'unsupported';
  private readonly craftField = () =>
    rawReactiveFacade(this.field) as CraftField<T>;
  private readonly createEffect: CraftNodeEffectFactory;
  private readonly element: HTMLElement;
  private readonly renderer: CraftDomAdapter;
  private readonly injector: Injector;
  private readonly field: CraftField<T>;
  private readonly customValueControl: CraftValueControl<unknown> | null;
  private readonly customCheckboxControl: CraftCheckboxControl | null;

  constructor(
    element: HTMLElement,
    renderer: CraftDomAdapter,
    injector: Injector,
    field: CraftField<T>,
    customValueControl: CraftValueControl<unknown> | null = null,
    customCheckboxControl: CraftCheckboxControl | null = null,
    createEffect?: CraftNodeEffectFactory,
  ) {
    this.element = element;
    this.renderer = renderer;
    this.injector = injector;
    this.field = field;
    this.customValueControl = customValueControl;
    this.customCheckboxControl = customCheckboxControl;
    this.createEffect =
      createEffect ??
      ((_name, effectFn) => effect(effectFn, { injector: this.injector }));
  }

  mount(): void {
    const el = this.element;
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
          console.warn(
            `[craftField] Unsupported host element <${(el as HTMLElement).tagName?.toLowerCase()}>. ` +
              'Provide CRAFT_FIELD_VALUE_CONTROL or CRAFT_FIELD_CHECKBOX_CONTROL on the host component to enable binding.',
          );
        }
        break;
    }

    this.bindStateAttributes(el);
  }

  destroy(): void {
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
    const ref = this.createEffect('field-state-attributes', () => {
      const field = this.craftField();
      const isInput =
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT';

      // Disabled
      if (isInput) {
        (
          el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        ).disabled = field.disabled();
      } else {
        this.toggleAttribute(el, 'aria-disabled', field.disabled());
      }

      // Readonly (not on select)
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        (el as HTMLInputElement | HTMLTextAreaElement).readOnly =
          field.readonly();
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
        const supportsMinMax =
          NUMERIC_TYPES.has(inputType) || TEMPORAL_TYPES.has(inputType);
        if (supportsMinMax) {
          const min = field.min();
          const max = field.max();
          if (min !== undefined)
            this.renderer.setAttribute(el, 'min', formatMinMax(min, inputType));
          else this.renderer.removeAttribute(el, 'min');
          if (max !== undefined)
            this.renderer.setAttribute(el, 'max', formatMinMax(max, inputType));
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
    });

    this.cleanupFns.push(() => ref.destroy());
  }

  private toggleAttribute(el: HTMLElement, name: string, value: boolean): void {
    if (value) this.renderer.setAttribute(el, name, 'true');
    else this.renderer.removeAttribute(el, name);
  }

  private toggleClass(el: HTMLElement, cls: string, on: boolean): void {
    el.classList.toggle(cls, on);
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
    this.cleanupFns.push(
      field().ɵregisterControl(syncer as ControlSyncer<string>),
    );

    // Initial + reactive sync model -> UI
    const ref = this.createEffect('text-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
    this.cleanupFns.push(() => ref.destroy());

    // UI -> model
    const onInput = () => {
      (field().set as (v: unknown) => void)(el.value);
    };
    const onBlur = () => field().ɵmarkTouched();
    this.cleanupFns.push(
      this.renderer.listen(el, 'input', onInput),
      this.renderer.listen(el, 'blur', onBlur),
    );
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

    const ref = this.createEffect('numeric-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
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
    this.cleanupFns.push(
      this.renderer.listen(el, 'input', onInput),
      this.renderer.listen(el, 'blur', onBlur),
    );
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

    const ref = this.createEffect('temporal-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
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
    this.cleanupFns.push(
      this.renderer.listen(el, 'input', onInput),
      this.renderer.listen(el, 'blur', onBlur),
    );
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
    this.cleanupFns.push(
      field().ɵregisterControl(syncer as ControlSyncer<boolean>),
    );

    const ref = this.createEffect('checkbox-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      (field().set as (v: unknown) => void)(el.checked);
    };
    const onBlur = () => field().ɵmarkTouched();
    this.cleanupFns.push(
      this.renderer.listen(el, 'change', onChange),
      this.renderer.listen(el, 'blur', onBlur),
    );
  }

  // ---------------------- Strategy: radio ----------------------

  private bindRadioInput(el: HTMLInputElement): void {
    const field = this.craftField as () => CraftField<unknown>;

    const writeValue = (next: unknown) => {
      el.checked =
        next !== null && next !== undefined && el.value === String(next);
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

    const ref = this.createEffect('radio-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      if (el.checked) {
        (field().set as (v: unknown) => void)(el.value);
      }
    };
    const onBlur = () => field().ɵmarkTouched();
    this.cleanupFns.push(
      this.renderer.listen(el, 'change', onChange),
      this.renderer.listen(el, 'blur', onBlur),
    );
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
    this.cleanupFns.push(
      field().ɵregisterControl(syncer as ControlSyncer<string>),
    );

    const ref = this.createEffect('select-field-model-to-dom', () => {
      field().ɵresetTrigger();
      const v = field().value();
      untracked(() => writeValue(v));
    });
    this.cleanupFns.push(() => ref.destroy());

    const onChange = () => {
      (field().set as (v: unknown) => void)(el.value);
    };
    const onBlur = () => field().ɵmarkTouched();
    this.cleanupFns.push(
      this.renderer.listen(el, 'change', onChange),
      this.renderer.listen(el, 'blur', onBlur),
    );
  }

  // ---------------------- Strategy: signal value control ----------------------

  private bindSignalValueControl(): void {
    const control = this
      .customValueControl as CraftValueControl<unknown> | null;
    if (!control) return;
    const field = this.craftField as () => CraftField<unknown>;
    let lastWrittenFromModel: unknown = Symbol('uninitialized');
    let lastReadFromControl: unknown = Symbol('uninitialized');

    // Model -> Control
    const modelEffect = this.createEffect(
      'custom-value-model-to-control',
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
    );
    this.cleanupFns.push(() => modelEffect.destroy());

    // Control -> Model
    const controlEffect = this.createEffect(
      'custom-value-control-to-model',
      () => {
        const v = control.value();
        untracked(() => {
          if (v === lastWrittenFromModel) return;
          if (v === lastReadFromControl) return;
          lastReadFromControl = v;
          (field().set as (v: unknown) => void)(v);
        });
      },
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

    const modelEffect = this.createEffect(
      'custom-checkbox-model-to-control',
      () => {
        field().ɵresetTrigger();
        const v = field().value();
        untracked(() => {
          lastWrittenFromModel = v;
          if (control.checked() !== v) control.checked.set(v);
        });
      },
    );
    this.cleanupFns.push(() => modelEffect.destroy());

    const controlEffect = this.createEffect(
      'custom-checkbox-control-to-model',
      () => {
        const v = control.checked();
        untracked(() => {
          if (v === lastWrittenFromModel) return;
          if (v === lastReadFromControl) return;
          lastReadFromControl = v;
          (field().set as (v: boolean) => void)(v);
        });
      },
    );
    this.cleanupFns.push(() => controlEffect.destroy());
  }
}

/** Mounts the complete native/custom-control field synchronization contract. */
export function bindCraftField<T>(
  element: HTMLElement,
  field: CraftField<T>,
  renderer: CraftDomAdapter,
  injector: Injector,
  customValueControl: CraftValueControl<unknown> | null = null,
  customCheckboxControl: CraftCheckboxControl | null = null,
  createEffect?: CraftNodeEffectFactory,
): () => void {
  const binding = new CraftFieldBinding(
    element,
    renderer,
    injector,
    field,
    customValueControl,
    customCheckboxControl,
    createEffect,
  );
  binding.mount();
  return () => binding.destroy();
}

export type BoundCraftFieldDirective<Field> = CraftNodeDirective<
  Readonly<Record<never, never>>
> &
  CraftFieldValidationCasesCarrier<FieldValidationCasesOf<Field>> &
  CraftFieldExceptionSourceCarrier;

const functionalFieldDirectives = new WeakMap<
  object,
  CraftNodeDirective<Readonly<Record<never, never>>>
>();

/**
 * Binds a `CraftField` to one concrete Craft DOM node.
 *
 * @example
 * input({ type: 'email' }).pipe(CraftFieldDirective(form.selectEmail()))
 *
 * Use the field returned by `selectXxx()` when it is configured through
 * `insertSelectFormTree`, because selection materializes the branch insertions.
 */
type CraftFieldValueOf<Field> = Field extends {
  readonly value: { readonly [REACTIVE_VALUE_TYPE]: infer Value };
}
  ? Value
  : Field extends { set: (next: infer Value) => void }
    ? Value
    : Field extends { readonly value: Signal<infer Value> }
      ? Value
      : never;

export function CraftFieldDirective<
  Field extends {
    readonly value: (...args: any[]) => unknown;
    set: (next: any) => void;
  },
>(field: Field): BoundCraftFieldDirective<Field> {
  if (!isCraftField(field)) {
    throw new TypeError('CraftFieldDirective requires a CraftField.');
  }

  const key = field as object;
  const existing = functionalFieldDirectives.get(key);
  if (existing) return existing as BoundCraftFieldDirective<Field>;

  const directive = craftNodeDirective<Readonly<Record<never, never>>>(
    'CraftFieldDirective',
    [],
    (context) => {
      const releaseBinding = bindCraftField(
        context.element as HTMLElement,
        field as unknown as CraftField<CraftFieldValueOf<Field>>,
        context.renderer,
        context.injector,
        context.injector.get(CRAFT_FIELD_VALUE_CONTROL, null),
        context.injector.get(CRAFT_FIELD_CHECKBOX_CONTROL, null),
        context.injector.get(CRAFT_NODE_EFFECT_FACTORY),
      );
      const source = (field as Field & CraftFieldExceptionSourceCarrier)[
        CRAFT_FIELD_EXCEPTION_SOURCE
      ];
      const boundary = context.injector.get(
        CRAFT_FIELD_EXCEPTION_BOUNDARY,
        null,
      );
      const releaseBoundary =
        source && boundary
          ? boundary.register(source, context.element)
          : undefined;
      return () => {
        releaseBoundary?.();
        releaseBinding();
      };
    },
  );
  functionalFieldDirectives.set(key, directive);
  return directive as BoundCraftFieldDirective<Field>;
}

export type GenDeps_LegacyCraftFieldDirective = GetDeps<{
  deps: Record<never, never>;
  provided: Record<never, never>;
  missingProvider: {
    Renderer2: Renderer2;
    Injector: Injector;
    CRAFT_FIELD_VALUE_CONTROL: typeof CRAFT_FIELD_VALUE_CONTROL;
    CRAFT_FIELD_CHECKBOX_CONTROL: typeof CRAFT_FIELD_CHECKBOX_CONTROL;
  };
}>;

/** @deprecated DI metadata belongs to `LegacyCraftFieldDirective` only. */
export type GenDeps_CraftFieldDirective = GenDeps_LegacyCraftFieldDirective;

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
