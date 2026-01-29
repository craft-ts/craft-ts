import { ResourceRef, Signal } from '@angular/core';

export type CraftResourceRef<Value, Params> = ResourceRef<Value> & {
  paramSrc: Signal<Params>;
};
