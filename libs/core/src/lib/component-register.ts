import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ComponentRegister {
  #counter = 0;

  next(): number {
    this.#counter += 1;
    return this.#counter;
  }
}

export const ɵfallbackComponentRegister = new ComponentRegister();
