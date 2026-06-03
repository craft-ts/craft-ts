import { Component } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import {
  SendContextCounterComponent,
  type GenDeps_SendContextCounterComponent,
} from './counter';

@Component({
  selector: 'app-demo-send-context',
  providers: [provideHostName('component:DemoSendContextComponent')],
  template: `
    Demo
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
    <app-send-context-counter [initialValue]="1"></app-send-context-counter>
  `,
  imports: [SendContextCounterComponent],
})
export default class DemoSendContextComponent {
  private readonly _monitoring = componentMonitoring();
}

export type GenDeps_DemoSendContextComponent = GetDeps<{
  deps: {
    GenDeps_SendContextCounterComponent: GenDeps_SendContextCounterComponent;
  };
  propertiesDeps: {
    _monitoring: ExtractDeps<DemoSendContextComponent['_monitoring']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<DemoSendContextComponent>;
}>;
