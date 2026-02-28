import { FieldTree, form } from '@angular/forms/signals';
import {
  InsertionsStateFactory,
  InsertionStateFactoryContext,
} from './query.core';
import {
  inject,
  InjectionToken,
  Injector,
  linkedSignal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { MergeObjects } from './util/util.type';

const RESOURCE_INSTANCE_TOKEN = new InjectionToken<FieldTree<unknown, any>>(
  'Injection token used to provide a dynamically created signal form instance.',
);

/**
 * It is not possible to instantiate a form from within an effect/linked signal directly:
 * NG0602: effect() cannot be called from within a reactive context.
 *
 * The workaround is to create a dynamic injection token using a factory function,
 * which instantiates the form using the provided model.
 *
 * Maybe there is a better way to instantiate a form dynamically.
 */
function createDynamicSignalForm<Model>(
  parentInjector: Injector,
  model: WritableSignal<Model>,
) {
  const injector = Injector.create({
    providers: [
      {
        provide: RESOURCE_INSTANCE_TOKEN,
        useFactory: () => form(model),
      },
    ],
    parent: parentInjector,
  });

  const formRef = injector.get(RESOURCE_INSTANCE_TOKEN);
  return formRef as FieldTree<Model, any>;
}

// todo should only works with writable signal

export type InsertionsFormFactory<
  State,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionStateFactoryContext<State, PreviousInsertionsOutputs>,
) => InsertionsOutputs;

type InsertFormReturn<
  StateType,
  GroupIdentifier extends string | number | undefined,
  Insertions extends readonly unknown[],
  PreviousInsertionsOutputs,
> = InsertionsStateFactory<
  StateType,
  MergeObjects<
    [
      Insertions,
      [undefined] extends [GroupIdentifier]
        ? { form: FieldTree<StateType, string | number> }
        : {
            forms: Signal<
              FieldTree<ExtractItemType<StateType>, string | number>[]
            >;
            select: (
              formIdentifier: string | number,
            ) => FieldTree<ExtractItemType<StateType>, string | number>;
          },
    ]
  >,
  PreviousInsertionsOutputs
>;

type ExtractItemType<T> = T extends (infer R)[] ? R : never;

type CoerceToString<T extends string | number> = T extends number ? string : T;

export function insertForm<
  StateType,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    StateType,
    Insertions1,
    PreviousInsertionsOutputs
  >,
): InsertFormReturn<
  StateType,
  undefined,
  [Insertions1],
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  GroupIdentifier extends string | number,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
>(
  config: {
    identifier: (context: {
      item: ExtractItemType<NoInfer<StateType>>;
      index: number;
    }) => GroupIdentifier;
  },
  insertion1: InsertionsStateFactory<
    StateType,
    Insertions1,
    PreviousInsertionsOutputs
  >,
): InsertFormReturn<
  StateType,
  CoerceToString<GroupIdentifier>,
  [Insertions1],
  PreviousInsertionsOutputs
>;
export function insertForm(
  configOrIndentation1: any,
  ...insertions: InsertionsStateFactory<any, any, any>[]
): any {
  //@ts-ignore
  return (context) => {
    const hasIdentifier =
      typeof configOrIndentation1 === 'object' &&
      'identifier' in configOrIndentation1;
    if (!hasIdentifier) {
      const model = Object.assign(() => context.state(), {
        set: context.set,
        update: context.update,
        asReadonly: () => context.state,
      }) as unknown as WritableSignal<unknown>;
      return {
        form: form(model),
      };
    }
    const identifierFn = configOrIndentation1.identifier;
    const injector = inject(Injector);
    const forms = linkedSignal(() => {
      const state = context.state();
      if (!state || !Array.isArray(state)) {
        return [];
      }
      return state.map((item, index) => {
        const formIdentifier = identifierFn({ item, index });
        const model = Object.assign(() => item, {
          set: (value: unknown) =>
            context.update((state: unknown) => {
              if (!state || !Array.isArray(state)) {
                return state;
              }
              const newState = [...state];
              newState[index] = value;
              return newState;
            }),
          update: (updater: (currentValue: unknown) => unknown) =>
            context.update((state: unknown) => {
              if (!state || !Array.isArray(state)) {
                return state;
              }
              const newState = [...state];
              newState[index] = updater(newState[index]);
              return newState;
            }),
          asReadonly: () => item,
        }) as unknown as WritableSignal<unknown>;
        return {
          formIdentifier,
          form: createDynamicSignalForm(injector, model),
        };
      });
    });
    return {
      forms: forms,
      select: (formIdentifier: string | number) => {
        const form = forms().find((f) => f.formIdentifier === formIdentifier);
        if (!form) {
          throw new Error(`Form with identifier ${formIdentifier} not found`);
        }
        return form.form();
      },
    };
  };
}
