/** A value accepted by a CSS custom property. */
export type CssVarValue = string | number;

declare const REQUIRED_CSS_VAR: unique symbol;
declare const INHERIT_CSS_VAR: unique symbol;
declare const OMIT_CSS_VAR: unique symbol;
declare const FORWARD_CSS_VAR: unique symbol;

/** Metadata marker used by `ComponentMeta.cssVars` for a required variable. */
export type RequiredCssVar<Value extends CssVarValue = CssVarValue> = {
  readonly [REQUIRED_CSS_VAR]: Value;
};

export type InheritCssVar = { readonly [INHERIT_CSS_VAR]: true };
export type OmitCssVar = { readonly [OMIT_CSS_VAR]: true };
export type ForwardCssVar<
  Value extends CssVarValue | undefined = CssVarValue | undefined,
> = {
  readonly [FORWARD_CSS_VAR]: true;
  readonly value: Value;
};

const REQUIRED = Symbol('craft-required-css-var');
const INHERIT = Symbol('craft-inherit-css-var');
const OMIT = Symbol('craft-omit-css-var');
const FORWARD = Symbol('craft-forward-css-var');

export function required<
  Value extends CssVarValue = CssVarValue,
>(): RequiredCssVar<Value> {
  return { [REQUIRED]: true } as unknown as RequiredCssVar<Value>;
}

export const inherit = { [INHERIT]: true } as unknown as InheritCssVar;
export const omit = { [OMIT]: true } as unknown as OmitCssVar;

export function forward(): ForwardCssVar<undefined>;
export function forward<const Value extends CssVarValue>(
  value: Value,
): ForwardCssVar<Value>;
export function forward(value?: CssVarValue): ForwardCssVar {
  return { [FORWARD]: true, value } as unknown as ForwardCssVar;
}

export type CssVarDisposition =
  | CssVarValue
  | InheritCssVar
  | OmitCssVar
  | ForwardCssVar;

export function isForwardCssVar(value: unknown): value is ForwardCssVar {
  return typeof value === 'object' && value !== null && FORWARD in value;
}

export function cssVarStyles(
  cssVars: Readonly<Record<`--${string}`, CssVarDisposition>> | undefined,
): Readonly<Record<`--${string}`, CssVarValue>> {
  if (!cssVars) return {};
  return Object.fromEntries(
    Object.entries(cssVars).flatMap(([name, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        return [[name, value]];
      }
      return [];
    }),
  ) as Readonly<Record<`--${string}`, CssVarValue>>;
}

export function forwardedCssVarStyles(
  value: unknown,
  seen = new Set<object>(),
): Readonly<Record<`--${string}`, CssVarValue>> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return {};
  seen.add(value);
  if (Array.isArray(value)) {
    return Object.assign(
      {},
      ...value.map((item) => forwardedCssVarStyles(item, seen)),
    );
  }
  const candidate = value as {
    readonly kind?: string;
    readonly props?: {
      readonly cssVars?: Readonly<Record<`--${string}`, unknown>>;
    };
    readonly children?: unknown;
    readonly node?: unknown;
  };
  const own = Object.fromEntries(
    Object.entries(candidate.props?.cssVars ?? {}).flatMap(
      ([name, disposition]) =>
        isForwardCssVar(disposition) && disposition.value !== undefined
          ? [[name, disposition.value]]
          : [],
    ),
  );
  return {
    ...forwardedCssVarStyles(candidate.children, seen),
    ...forwardedCssVarStyles(candidate.node, seen),
    ...own,
  } as Readonly<Record<`--${string}`, CssVarValue>>;
}
