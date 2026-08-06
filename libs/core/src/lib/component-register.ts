import { Injectable } from '@angular/core';
import type { GetDeps } from './branded-component/branded-component';

@Injectable({ providedIn: 'root' })
export class ComponentRegister {
  #counter = 0;

  next(): number {
    this.#counter += 1;
    return this.#counter;
  }
}

export const ɵfallbackComponentRegister = new ComponentRegister();

export type GenDeps_ComponentRegister = GetDeps<{
  deps: {};
  provided: {};
}>;
