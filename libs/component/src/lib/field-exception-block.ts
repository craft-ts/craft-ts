import type {
  AnyCraftException,
  CEmailException,
  CMaxException,
  CMaxLengthException,
  CMinException,
  CMinLengthException,
  CRequiredException,
  CraftField,
  FieldExceptionVisibility,
  FieldValidationCase,
} from '@craft-ts/core';
import {
  CRAFT_DIRECTIVE,
  COMPONENT_FIELD_EXCEPTION_BLOCK,
  FIELD_EXCEPTION_BLOCK_DIRECTIVE,
  type CraftDirective,
} from './types';
import type {
  CraftNodeChildren,
  CraftNodeChildrenFieldExceptions,
} from './render/vnode';

export { FIELD_EXCEPTION_BLOCK_DIRECTIVE } from './types';

export type FieldExceptionBlockMode = 'first' | 'all';
export type FieldExceptionBlockPosition = 'before' | 'after';

export type FieldExceptionBlockOptions = {
  readonly visibility?: FieldExceptionVisibility;
  readonly mode?: FieldExceptionBlockMode;
  readonly position?: FieldExceptionBlockPosition;
};

export type FieldExceptionHandlerContext<
  Field extends CraftField<any> = CraftField<any>,
  Path extends string = string,
  Exception extends AnyCraftException = AnyCraftException,
> = {
  readonly field: Field;
  readonly path: Path;
  readonly runtimePath: ReadonlyArray<string | number>;
  readonly validatorName: string;
  readonly exception: Exception;
};

export type FieldExceptionHandler<
  Context extends FieldExceptionHandlerContext = FieldExceptionHandlerContext,
> = (context: Context) => CraftNodeChildren;

type AnyFieldExceptionHandler = (...args: any[]) => CraftNodeChildren;

export type FieldExceptionCodeHandlers = Readonly<
  Record<string, AnyFieldExceptionHandler>
>;
export type FieldExceptionHandlers = Readonly<
  Record<string, AnyFieldExceptionHandler | FieldExceptionCodeHandlers>
>;

type KnownFieldException =
  | CRequiredException
  | CEmailException
  | CMinException
  | CMaxException
  | CMinLengthException
  | CMaxLengthException;

type KnownFieldExceptionForCode<Code extends string> = Extract<
  KnownFieldException,
  { readonly code: Code }
>;

type FieldExceptionForCode<Code extends string> = [
  KnownFieldExceptionForCode<Code>,
] extends [never]
  ? AnyCraftException & { readonly code: Code }
  : KnownFieldExceptionForCode<Code>;

type LocalHandlerMap = Readonly<Record<string, AnyFieldExceptionHandler>>;
type GroupedHandlerMap = Readonly<Record<string, LocalHandlerMap>>;

type ContextualLocalHandlers<Handlers extends LocalHandlerMap> = {
  readonly [Code in keyof Handlers]: Code extends string
    ? (
        context: FieldExceptionHandlerContext<
          CraftField<any>,
          string,
          FieldExceptionForCode<Code>
        >,
      ) => ReturnType<Handlers[Code]>
    : never;
};

type ContextualGroupedHandlers<Handlers extends GroupedHandlerMap> = {
  readonly [Path in keyof Handlers]: Path extends string
    ? {
        readonly [Code in keyof Handlers[Path]]: Code extends string
          ? (
              context: FieldExceptionHandlerContext<
                CraftField<any>,
                Path,
                FieldExceptionForCode<Code>
              >,
            ) => ReturnType<Handlers[Path][Code]>
          : never;
      }
    : never;
};

export type FieldExceptionHandlerChildren<Handler> = Handler extends (
  ...args: any[]
) => infer Children
  ? Children
  : Handler extends Readonly<Record<string, infer Nested>>
    ? FieldExceptionHandlerChildren<Nested>
    : never;

type CaseIdentity<Case> =
  Case extends FieldValidationCase<infer Path, any, infer Exception>
    ? `${Path}.${Exception['code']}`
    : never;

type HandlerIdentity<Handlers> = {
  [PathOrCode in keyof Handlers & string]: Handlers[PathOrCode] extends (
    ...args: any[]
  ) => any
    ? PathOrCode
    : Handlers[PathOrCode] extends Readonly<Record<string, unknown>>
      ? `${PathOrCode}.${keyof Handlers[PathOrCode] & string}`
      : never;
}[keyof Handlers & string];

/** Type-only coverage emitted by a field-exception block in a template. */
export declare const FIELD_VALIDATION_HANDLED_IDENTITIES: unique symbol;

export type FieldValidationHandledIdentitiesCarrier<Identities> = {
  readonly [FIELD_VALIDATION_HANDLED_IDENTITIES]?: Identities;
};

export type FieldValidationHandledIdentitiesOf<Cases> =
  Cases extends FieldValidationHandledIdentitiesCarrier<infer Identities>
    ? Identities
    : never;

export type UnhandledFieldValidationCases<Cases> = Exclude<
  Cases,
  FieldValidationHandledIdentitiesCarrier<any>
>;

type CaseCode<Case> =
  Case extends FieldValidationCase<any, any, infer Exception>
    ? Exception['code']
    : never;

type CasePath<Case> =
  Case extends FieldValidationCase<infer Path, any, any> ? Path : never;

type IsUnion<Value, Whole = Value> = Value extends unknown
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type HasSeveralPaths<Cases> =
  true extends IsUnion<CasePath<Cases>> ? true : false;

type HandlersAreLocal<Handlers> = Handlers[keyof Handlers] extends (
  ...args: any[]
) => any
  ? true
  : false;

type ReachableHandlerKeys<Cases, Handlers> =
  HandlersAreLocal<Handlers> extends true
    ? HasSeveralPaths<Cases> extends true
      ? CaseIdentity<Cases>
      : CaseCode<Cases>
    : CaseIdentity<Cases>;

type ProvidedHandlerKeys<Handlers> =
  HandlersAreLocal<Handlers> extends true
    ? HandlerIdentity<Handlers>
    : HandlerIdentity<Handlers>;

export type FieldExceptionBlockExhaustiveCheck<Cases, Handlers> = [
  Exclude<ReachableHandlerKeys<Cases, Handlers>, ProvidedHandlerKeys<Handlers>>,
] extends [never]
  ? [
      Exclude<
        ProvidedHandlerKeys<Handlers>,
        ReachableHandlerKeys<Cases, Handlers>
      >,
    ] extends [never]
    ? unknown
    : {
        'fieldExceptionBlock.exhaustive has handlers for unreachable field exceptions': Exclude<
          ProvidedHandlerKeys<Handlers>,
          ReachableHandlerKeys<Cases, Handlers>
        >;
      }
  : {
      'fieldExceptionBlock.exhaustive is missing handlers for field exceptions': Exclude<
        ReachableHandlerKeys<Cases, Handlers>,
        ProvidedHandlerKeys<Handlers>
      >;
    };

export type FieldExceptionBlockPartialCheck<Cases, Handlers> = [
  Exclude<ProvidedHandlerKeys<Handlers>, ReachableHandlerKeys<Cases, Handlers>>,
] extends [never]
  ? unknown
  : {
      'fieldExceptionBlock.partial has handlers for unreachable field exceptions': Exclude<
        ProvidedHandlerKeys<Handlers>,
        ReachableHandlerKeys<Cases, Handlers>
      >;
    };

type HandledIdentity<Cases, Handlers> =
  HandlersAreLocal<Handlers> extends true
    ? Cases extends FieldValidationCase<infer Path, any, infer Exception>
      ? Exception['code'] extends keyof Handlers
        ? `${Path}.${Exception['code']}`
        : never
      : never
    : HandlerIdentity<Handlers>;

export type FieldValidationHandledIdentities<Cases, Handlers> =
  | HandledIdentity<UnhandledFieldValidationCases<Cases>, Handlers>
  | ([UnhandledFieldValidationCases<Cases>] extends [never]
      ? HandlerIdentity<Handlers>
      : never);

export type ResidualFieldValidationCases<Cases, Handlers> =
  Cases extends unknown
    ? CaseIdentity<Cases> extends HandledIdentity<Cases, Handlers>
      ? never
      : Cases
    : never;

export type ResidualFieldValidationCasesByIdentity<Cases, Identities> =
  Cases extends unknown
    ? CaseIdentity<Cases> extends Identities
      ? never
      : Cases
    : never;

export type FieldExceptionHandlerFieldExceptions<Handlers> =
  CraftNodeChildrenFieldExceptions<
    FieldExceptionHandlerChildren<Handlers[keyof Handlers]>
  >;

export type FieldExceptionBlockDirective<
  Handlers extends FieldExceptionHandlers,
  Exhaustive extends boolean = boolean,
> = CraftDirective & {
  readonly [COMPONENT_FIELD_EXCEPTION_BLOCK]: true;
  readonly [FIELD_EXCEPTION_BLOCK_DIRECTIVE]: {
    readonly handlers: Handlers;
    readonly exhaustive: Exhaustive;
    readonly options: Required<
      Pick<FieldExceptionBlockOptions, 'mode' | 'position'>
    > &
      Pick<FieldExceptionBlockOptions, 'visibility'>;
  };
};

function createFieldExceptionBlockDirective<
  Handlers extends FieldExceptionHandlers,
  Exhaustive extends boolean,
>(
  name: `fieldExceptionBlock.${'exhaustive' | 'partial'}`,
  handlers: Handlers,
  options: FieldExceptionBlockOptions,
  exhaustive: Exhaustive,
): FieldExceptionBlockDirective<Handlers, Exhaustive> {
  const definition = {
    handlers,
    exhaustive,
    options: {
      visibility: options.visibility,
      mode: options.mode ?? 'first',
      position: options.position ?? 'after',
    },
  } as const;
  const directive = (() =>
    undefined) as unknown as FieldExceptionBlockDirective<Handlers, Exhaustive>;
  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: {
      name,
      meta: {},
      logic: (baseLogic: (...args: any[]) => any) => baseLogic,
      template: (baseTemplate: (...args: any[]) => any) => baseTemplate,
      componentOperator: {
        fieldExceptionHandlers: handlers,
        fieldExceptionOptions: definition.options,
      },
    },
    enumerable: false,
  });
  Object.defineProperty(directive, FIELD_EXCEPTION_BLOCK_DIRECTIVE, {
    value: definition,
    enumerable: false,
  });
  Object.defineProperty(directive, COMPONENT_FIELD_EXCEPTION_BLOCK, {
    value: true,
    enumerable: false,
  });
  return directive;
}

function exhaustive<const Handlers extends LocalHandlerMap>(
  handlers: Handlers & ContextualLocalHandlers<Handlers>,
  options?: FieldExceptionBlockOptions,
): FieldExceptionBlockDirective<Handlers, true>;
function exhaustive<const Handlers extends GroupedHandlerMap>(
  handlers: Handlers & ContextualGroupedHandlers<Handlers>,
  options?: FieldExceptionBlockOptions,
): FieldExceptionBlockDirective<Handlers, true>;
function exhaustive(
  handlers: FieldExceptionHandlers,
  options: FieldExceptionBlockOptions = {},
): FieldExceptionBlockDirective<FieldExceptionHandlers, true> {
  return createFieldExceptionBlockDirective(
    'fieldExceptionBlock.exhaustive',
    handlers,
    options,
    true,
  );
}

function partial<const Handlers extends LocalHandlerMap>(
  handlers: Handlers & ContextualLocalHandlers<Handlers>,
  options?: FieldExceptionBlockOptions,
): FieldExceptionBlockDirective<Handlers, false>;
function partial<const Handlers extends GroupedHandlerMap>(
  handlers: Handlers & ContextualGroupedHandlers<Handlers>,
  options?: FieldExceptionBlockOptions,
): FieldExceptionBlockDirective<Handlers, false>;
function partial(
  handlers: FieldExceptionHandlers,
  options: FieldExceptionBlockOptions = {},
): FieldExceptionBlockDirective<FieldExceptionHandlers, false> {
  return createFieldExceptionBlockDirective(
    'fieldExceptionBlock.partial',
    handlers,
    options,
    false,
  );
}

export const fieldExceptionBlock = { exhaustive, partial };
