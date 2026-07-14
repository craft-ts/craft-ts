import { Component, input } from '@angular/core';
import {
  craftUse,
  componentMonitoring,
  provideHostName,
  state,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  selector: 'app-send-context-counter',
  template: `
    <h2>Counter</h2>
    <p>Value: {{ counter() }}</p>
    <button (click)="counter.increment()">Increment</button>
    <button (click)="counter.decrement()">Decrement</button>
  `,
  providers: [provideHostName('component:SendContextCounterComponent')],
})
export class SendContextCounterComponent {
  private readonly _monitoring = componentMonitoring();
  readonly initialValue = input.required<number>();

  protected counter = craftUse(
    state(this.initialValue, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    })),
  );
}

export type GenDeps_SendContextCounterComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<SendContextCounterComponent['_monitoring']>;
    initialValue: ExtractDeps<SendContextCounterComponent['initialValue']>;
    counter: ExtractDeps<SendContextCounterComponent['counter']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<SendContextCounterComponent>;
}>;
