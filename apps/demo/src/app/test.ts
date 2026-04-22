import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { craftService, MaybeSignal, state, toValue } from '@craft-ng/core';

const { injectCounter } = craftService(
  { name: 'Counter', scope: 'function' },
  (inputs: { initialValue: MaybeSignal<number> }) => {
    return state(toValue(inputs.initialValue), ({ update }) => ({
      increment: () => update((c) => c + 1),
    }));
  },
);

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      Counter 1: {{ counter1() }}
      <button (click)="counter1.increment()">Increment Counter 1</button>
    </div>

    <div>
      Counter 2: {{ counter2() }}
      <button (click)="counter2.increment()">Increment Counter 2</button>
    </div>
  `,
})
export default class TestComponent {
  counter1 = injectCounter({ initialValue: 0 });
  counter2 = injectCounter({ initialValue: 200 });
}
