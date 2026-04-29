import { ChangeDetectionStrategy, Component } from '@angular/core';
import { craftService, state, type GetDeps, type GetInjectedServiceDependencies, type GetPublicComponentProperties } from '@craft-ng/core';

const { injectCounter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  () =>
    state(0, ({ update, set }) => ({
      increment: () => update((v) => v + 1),
      decrement: () => update((v) => v - 1),
      reset: () => set(0),
    })),
);

@Component({
  selector: 'app-craft-service-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideCounter()],
  template: `
    <div class="counter-demo">
      <h2>craftService Counter (toProvide scope)</h2>
      <p class="value">{{ counter() }}</p>
      <div class="actions">
        <button (click)="counter.decrement()">-</button>
        <button (click)="counter.reset()">Reset</button>
        <button (click)="counter.increment()">+</button>
      </div>
    </div>
  `,
  styles: `
    .counter-demo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 32px;
      font-family: sans-serif;
    }
    .value {
      font-size: 3rem;
      font-weight: bold;
      margin: 0;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    button {
      padding: 8px 20px;
      font-size: 1.2rem;
      cursor: pointer;
      border: 1px solid #ccc;
      border-radius: 6px;
      background: #fff;
    }
    button:hover {
      background: #f0f0f0;
    }
  `,
})
export default class CraftServiceCounterComponent {
  protected readonly counter = injectCounter();
}

export type GenDeps_CraftServiceCounterComponent = GetDeps<{
      deps: {
        Counter: GetInjectedServiceDependencies<typeof injectCounter>;
      };
      provided: {
        Counter: ReturnType<typeof provideCounter>;
      };
      publicProperties: GetPublicComponentProperties<CraftServiceCounterComponent>;
    }>;
