import { CommonModule } from '@angular/common';
import { Component, linkedSignal, ResourceStatus, signal } from '@angular/core';
import {
  afterRecomputation,
  craft,
  craftInputs,
  craftSources,
  craftState,
  resourceById,
  ResourceByIdRef,
  source,
  state,
} from '@ng-angular-stack/craft';
@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: ``,
})
export default class TestComponent {}
