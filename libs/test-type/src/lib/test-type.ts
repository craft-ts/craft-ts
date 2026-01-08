type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Expect<T extends true> = T;
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

export type PrettifyEqual<X, Y, XP = Prettify<X>, YP = Prettify<Y>> =
  (<T>() => T extends XP ? 1 : 2) extends <T>() => T extends YP ? 1 : 2
    ? true
    : false;
