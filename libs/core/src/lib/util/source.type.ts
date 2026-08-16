import { Signal } from '../host/craft-compat';
import { SourceBranded } from './util';

export type ReadonlySource<T> = Signal<T | undefined> & {
  preserveLastValue: Signal<T | undefined>;
} & SourceBranded;
