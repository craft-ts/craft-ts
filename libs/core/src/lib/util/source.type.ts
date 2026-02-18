import { Signal } from '@angular/core';
import { SourceBranded } from './util';
import { ReactionException } from '../business-exception';

export type ReadonlySource<
  T,
  ReactionExceptions extends ReactionException = never,
> = Signal<T | undefined> & {
  preserveLastValue: Signal<T | undefined>;
} & SourceBranded<ReactionExceptions>;
