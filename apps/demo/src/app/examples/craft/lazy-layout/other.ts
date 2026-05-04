import { Component } from '@angular/core';
import {
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { injectOtherService, provideOtherService } from './to-provide.service';

@Component({
  selector: 'app-other',
  providers: [provideOtherService()],
  template: ` {{ _injectOtherService.getValue() }} `,
})
export class OtherComponent {
  _injectOtherService = injectOtherService();
}

export type GenDeps_OtherComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _injectOtherService: {
      OtherService: ExtractDeps<typeof injectOtherService>['OtherService'];
    };
  };
  provided: {
    OtherService: ReturnType<typeof provideOtherService>;
  };
  publicProperties: GetPublicComponentProperties<OtherComponent>;
}>;
