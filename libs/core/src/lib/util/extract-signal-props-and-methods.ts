import { Signal } from '../host/craft-compat';
import { FilterSource, RemoveIndexSignature } from './util.type';

export type ExtractSignalPropsAndMethods<
  State,
  StateKeysTuple,
  Acc extends { props: {}; methods: Record<string, Function> }
> = StateKeysTuple extends [infer Head, ...infer Tail]
  ? Head extends keyof State
    ? [State[Head]] extends [Signal<any>]
      ? ExtractSignalPropsAndMethods<
          State,
          Tail,
          {
            props: { [K in Head]: State[Head] } & Acc['props'];
            methods: Acc['methods'];
          }
        >
      : ExtractSignalPropsAndMethods<
          State,
          Tail,
          {
            props: Acc['props'];
            methods: Acc['methods'] &
              FilterSource<{ [K in Head]: State[Head] }>;
          }
        >
    : Acc
  : {
      props: Acc['props'];
      methods: RemoveIndexSignature<Acc['methods']>;
    };
