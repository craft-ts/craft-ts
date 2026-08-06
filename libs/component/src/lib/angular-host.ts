import { Component } from '@angular/core';
import {
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  selector: 'craft-angular-directive-host',
  standalone: true,
  template: '',
})
export class CraftAngularDirectiveHost {}

export type GenDeps_CraftAngularDirectiveHost = GetDeps<{
  deps: {};
  propertiesDeps: {};
  provided: {};
  publicProperties: GetPublicComponentProperties<CraftAngularDirectiveHost>;
}>;
