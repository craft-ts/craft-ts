import type {
  CssVarDisposition,
  CssVarValue,
  ForwardCssVar,
  InheritCssVar,
  RequiredCssVar,
} from './css-vars';

export type CssVarContract = {
  readonly required: string;
  readonly optional: string;
  readonly declared: string;
  readonly inherited: string;
  readonly nonInherited: string;
  readonly unknownCss: boolean;
};

export type EmptyCssVarContract = {
  readonly required: never;
  readonly optional: never;
  readonly declared: never;
  readonly inherited: never;
  readonly nonInherited: never;
  readonly unknownCss: false;
};

type Ws = ' ' | '\n' | '\r' | '\t' | '\f';
type TrimLeft<Value extends string> = Value extends `${Ws}${infer Rest}`
  ? TrimLeft<Rest>
  : Value;
type NameStop = Ws | ':' | ')' | ',' | '{' | '}' | ';' | '(' | '[' | ']';

type ReadName<
  Value extends string,
  Acc extends string = '',
  Depth extends unknown[] = [],
> = Depth['length'] extends 64
  ? readonly [Acc, Value]
  : Value extends `${infer Char}${infer Rest}`
    ? Char extends NameStop
      ? readonly [Acc, Value]
      : ReadName<Rest, `${Acc}${Char}`, [...Depth, unknown]>
    : readonly [Acc, ''];

type VarScan<
  Css extends string,
  Used extends string = never,
  Fallback extends string = never,
> = Css extends `${string}var(${infer Rest}`
  ? TrimLeft<Rest> extends `--${infer AfterPrefix}`
    ? ReadName<AfterPrefix> extends readonly [
        infer Name extends string,
        infer Tail extends string,
      ]
      ? TrimLeft<Tail> extends `,${infer After}`
        ? VarScan<After, Used | `--${Name}`, Fallback | `--${Name}`>
        : VarScan<Tail, Used | `--${Name}`, Fallback>
      : { readonly used: Used; readonly fallback: Fallback }
    : VarScan<Rest, Used, Fallback>
  : { readonly used: Used; readonly fallback: Fallback };

type DeclarationScan<
  Css extends string,
  Declared extends string = never,
> = Css extends `${string}--${infer Rest}`
  ? ReadName<Rest> extends readonly [
      infer Name extends string,
      infer Tail extends string,
    ]
    ? TrimLeft<Tail> extends `:${infer After}`
      ? DeclarationScan<After, Declared | `--${Name}`>
      : DeclarationScan<Tail, Declared>
    : Declared
  : Declared;

type PropertyScan<
  Css extends string,
  Registered extends string = never,
  NonInherited extends string = never,
> = Css extends `${string}@property${Ws}${infer Rest}`
  ? TrimLeft<Rest> extends `--${infer AfterPrefix}`
    ? ReadName<AfterPrefix> extends readonly [
        infer Name extends string,
        infer Tail extends string,
      ]
      ? Tail extends `${string}{${infer Body}}${infer After}`
        ? PropertyScan<
            After,
            Body extends `${string}initial-value${Ws | ''}:${string}`
              ? Registered | `--${Name}`
              : Registered,
            Body extends `${string}inherits${Ws | ''}:${Ws | ''}false${string}`
              ? NonInherited | `--${Name}`
              : NonInherited
          >
        : {
            readonly registered: Registered;
            readonly nonInherited: NonInherited;
          }
      : { readonly registered: Registered; readonly nonInherited: NonInherited }
    : PropertyScan<Rest, Registered, NonInherited>
  : { readonly registered: Registered; readonly nonInherited: NonInherited };

type LiteralCss<Value> = Value extends string
  ? string extends Value
    ? never
    : Value
  : never;

type CssVarsOfString<Css extends string> =
  VarScan<Css> extends infer Vars extends {
    readonly used: string;
    readonly fallback: string;
  }
    ? PropertyScan<Css> extends infer Properties extends {
        readonly registered: string;
        readonly nonInherited: string;
      }
      ? {
          readonly declared: DeclarationScan<Css> | Properties['registered'];
          readonly used: Vars['used'];
          readonly fallback: Vars['fallback'];
          readonly nonInherited: Properties['nonInherited'];
        }
      : never
    : never;

type CssVarsOfArray<Styles extends readonly unknown[]> =
  Styles[number] extends infer Style
    ? LiteralCss<Style> extends infer Css extends string
      ? CssVarsOfString<Css>
      : never
    : never;

export type CssVarsOf<Styles> = Styles extends readonly unknown[]
  ? CssVarsOfArray<Styles>
  : LiteralCss<Styles> extends infer Css extends string
    ? CssVarsOfString<Css>
    : {
        readonly declared: never;
        readonly used: never;
        readonly fallback: never;
        readonly nonInherited: never;
      };

type ParsedContract<Styles> =
  CssVarsOf<Styles> extends infer Parsed extends {
    readonly declared: string;
    readonly used: string;
    readonly fallback: string;
    readonly nonInherited: string;
  }
    ? {
        readonly required: Exclude<
          Parsed['used'],
          Parsed['declared'] | Parsed['fallback'] | Parsed['nonInherited']
        >;
        readonly optional: Exclude<
          Parsed['declared'] | Parsed['fallback'],
          Parsed['nonInherited']
        >;
        readonly declared: Parsed['declared'];
        readonly inherited: never;
        readonly nonInherited: Parsed['nonInherited'];
        readonly unknownCss: false;
      }
    : EmptyCssVarContract;

type ExplicitRequired<Vars> = {
  [Key in keyof Vars]: Vars[Key] extends RequiredCssVar<any> ? Key : never;
}[keyof Vars] &
  string;
type ExplicitOptional<Vars> = Exclude<
  keyof Vars & string,
  ExplicitRequired<Vars>
>;

type ExplicitContract<Vars> = {
  readonly required: ExplicitRequired<Vars>;
  readonly optional: ExplicitOptional<Vars>;
  readonly declared: ExplicitOptional<Vars>;
  readonly inherited: never;
  readonly nonInherited: never;
  readonly unknownCss: false;
};

export type CssVarsContractOfMeta<Meta> = Meta extends {
  readonly cssVars: infer Vars;
}
  ? ExplicitContract<Vars>
  : Meta extends { readonly styles: infer Styles }
    ? ParsedContract<Styles>
    : Meta extends { readonly stylesUrl: infer Styles }
      ? string extends Styles
        ? Omit<EmptyCssVarContract, 'unknownCss'> & {
            readonly unknownCss: true;
          }
        : ParsedContract<Styles>
      : EmptyCssVarContract;

export type MergeCssVarContracts<
  Left extends CssVarContract,
  Right extends CssVarContract,
> = {
  readonly required: Exclude<
    Left['required'] | Right['required'],
    Left['declared']
  >;
  readonly optional: Left['optional'] | Right['optional'];
  readonly declared: Left['declared'];
  readonly inherited: Right['inherited'];
  readonly nonInherited: Left['nonInherited'] | Right['nonInherited'];
  readonly unknownCss: Left['unknownCss'] extends true
    ? true
    : Right['unknownCss'];
};

type DispositionAt<Props, Key extends string> = Props extends {
  readonly cssVars?: infer Vars;
}
  ? Key extends keyof NonNullable<Vars>
    ? NonNullable<Vars>[Key]
    : never
  : never;
type SuppliedKeys<Props> = Props extends { readonly cssVars?: infer Vars }
  ? keyof NonNullable<Vars> & string
  : never;
type ForwardedWithoutDefault<Contract extends CssVarContract, Props> = {
  [Key in Contract['required']]: [DispositionAt<Props, Key>] extends [never]
    ? never
    : DispositionAt<Props, Key> extends ForwardCssVar<undefined>
      ? Key
      : never;
}[Contract['required']];
type ForwardedOptional<Contract extends CssVarContract, Props> = {
  [Key in Contract['required'] | Contract['optional']]: [
    DispositionAt<Props, Key>,
  ] extends [never]
    ? never
    : DispositionAt<Props, Key> extends ForwardCssVar<any>
      ? Key
      : never;
}[Contract['required'] | Contract['optional']];
type InheritedKeys<Contract extends CssVarContract, Props> = {
  [Key in Contract['required'] | Contract['optional']]: [
    DispositionAt<Props, Key>,
  ] extends [never]
    ? never
    : DispositionAt<Props, Key> extends InheritCssVar
      ? Key
      : never;
}[Contract['required'] | Contract['optional']];

export type CssVarsAfterCall<Contract extends CssVarContract, Props> = {
  readonly required:
    | Exclude<Contract['required'], SuppliedKeys<Props>>
    | ForwardedWithoutDefault<Contract, Props>;
  readonly optional: ForwardedOptional<Contract, Props>;
  readonly declared: never;
  readonly inherited: InheritedKeys<Contract, Props>;
  readonly nonInherited: Contract['nonInherited'];
  readonly unknownCss: Contract['unknownCss'];
};

export type CssVarsCallProps<Contract extends CssVarContract> = [
  Contract['required'] | Contract['optional'],
] extends [never]
  ? { readonly cssVars?: never }
  : {
      readonly cssVars?: {
        readonly [Key in Contract['required']]: CssVarDisposition;
      } & {
        readonly [Key in Contract['optional']]?: CssVarDisposition;
      };
    };

export type CssVarsMetaDeclaration = Readonly<
  Record<`--${string}`, CssVarValue | RequiredCssVar>
>;
