type Depth = [unknown, unknown, unknown, unknown, unknown, unknown];

type StepKey<K> = K extends `select${string}` ? K : K extends 'items' ? K : never;

type FormFieldPath<Form, D extends ReadonlyArray<unknown> = []> =
  D['length'] extends Depth['length']
    ? never
    : {
        [K in keyof Form & string as StepKey<K>]: Form[K] extends (
          ...args: never[]
        ) => infer R
          ?
              | K
              | (NonNullable<R> extends object
                  ? `${K}.${FormFieldPath<NonNullable<R>, [...D, unknown]>}`
                  : never)
          : never;
      }[StepKey<keyof Form & string>];

type ResolveFormFieldPath<Form, Path extends string> =
  Path extends `${infer Head}.${infer Rest}`
    ? Head extends keyof Form
      ? Form[Head] extends (...args: never[]) => infer R
        ? ResolveFormFieldPath<NonNullable<R>, Rest>
        : never
      : never
    : Path extends keyof Form
      ? Form[Path] extends (...args: never[]) => infer R
        ? R extends ReadonlyArray<infer Item>
          ? Item
          : NonNullable<R>
        : never
      : never;

export type TargetFormField<
  Form,
  Path extends FormFieldPath<Form>,
> = ResolveFormFieldPath<Form, Path>;
