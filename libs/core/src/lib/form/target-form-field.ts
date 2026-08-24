type Depth = [unknown, unknown, unknown, unknown, unknown, unknown];

type StepKey<K> = K extends `select${string}`
  ? K
  : K extends 'items' | 'forms'
    ? K
    : never;

type DescendInto<R, D extends ReadonlyArray<unknown>> =
  NonNullable<R> extends ReadonlyArray<infer Item>
    ? Item extends object
      ? FormFieldPath<Item, [...D, unknown]>
      : never
    : NonNullable<R> extends object
      ? FormFieldPath<NonNullable<R>, [...D, unknown]>
      : never;

// Split out so the lookup below indexes by the mapped type's OWN keys.
// Indexing with `StepKey<keyof Form & string>` is not provably a key of the
// map when `Form` is still generic, which TS rejects (TS2536).
type FormFieldPathMap<Form, D extends ReadonlyArray<unknown>> = {
  [K in keyof Form & string as StepKey<K>]: Form[K] extends (
    ...args: never[]
  ) => infer R
    ? K | (DescendInto<R, D> extends infer Next extends string ? `${K}.${Next}` : never)
    : never;
};

export type FormFieldPath<Form, D extends ReadonlyArray<unknown> = []> =
  D['length'] extends Depth['length']
    ? never
    : FormFieldPathMap<Form, D>[keyof FormFieldPathMap<Form, D>];

type ResolveFormFieldPath<Form, Path extends string> =
  Path extends `${infer Head}.${infer Rest}`
    ? Head extends keyof Form
      ? Form[Head] extends (...args: never[]) => infer R
        ? NonNullable<R> extends ReadonlyArray<infer Item>
          ? ResolveFormFieldPath<Item, Rest>
          : ResolveFormFieldPath<NonNullable<R>, Rest>
        : never
      : never
    : Path extends keyof Form
      ? Form[Path] extends (...args: never[]) => infer R
        ? NonNullable<R> extends ReadonlyArray<infer Item>
          ? Item
          : NonNullable<R>
        : never
      : never;

export type TargetFormField<
  Form,
  Path extends FormFieldPath<Form>,
> = ResolveFormFieldPath<Form, Path>;
