import { Signal } from '@angular/core';
import { SourceBranded } from './util';
import { ReactionInsertionException } from '../business-exception';

export type ReadonlySource<
  T,
  ReactionInsertionExceptions extends ReactionInsertionException = never,
> = Signal<T | undefined> & {
  preserveLastValue: Signal<T | undefined>;
} & SourceBranded<ReactionInsertionExceptions>;
