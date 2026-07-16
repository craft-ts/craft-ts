import { Component } from '@angular/core';
import {
  componentMonitoring,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
  provideHostName,
} from '@craft-ng/core';

@Component({
  selector: 'app-guard-demo',
  imports: [],
  template: `Should not be displayed`,
  providers: [provideHostName('component:GuardDemo')],
})
export class GuardDemo {
  private readonly _monitoring = componentMonitoring();
}

export type GenDeps_GuardDemo = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<GuardDemo['_monitoring']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<GuardDemo>;
}>;
