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
} from '@ng-craft/core';
@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: `resourceByIdRef 1: {{ resourceByIdRef()['1']?.status() | json }} &
    source : {{ innerResourceByIdRef()['1']?.status() }} <br />
    resourceByIdRef 2: {{ resourceByIdRef()['2']?.status() | json }} & source :
    {{ innerResourceByIdRef()['2']?.status() }} <br />
    resourceByIdRef 3: {{ resourceByIdRef()['3']?.status() | json }} & source :
    {{ innerResourceByIdRef()['3']?.status() }} <br />`,
})
export default class TestComponent {
  resourceByIdRef!: ResourceByIdRef<string, { id: string }, { id: string }>;
  innerResourceByIdRef!: ResourceByIdRef<
    string,
    { id: string },
    { id: string }
  >;
  constructor() {
    const sourceParams = signal<{ id: string } | undefined>(undefined);
    this.innerResourceByIdRef = resourceById({
      params: sourceParams,
      identifier: (params) => params.id,
      loader: async ({ params }) => {
        console.log('innerResourceByIdRef params', params);
        // Simulate a stream
        return params;
      },
    });
    this.innerResourceByIdRef.add({ id: '1' });
    this.innerResourceByIdRef.add(
      { id: '2' },
      {
        defaultValue: { id: '2' },
      },
    );
    this.innerResourceByIdRef.add(
      { id: '3' },
      {
        defaultValue: { id: '3' },
      },
    );

    this.resourceByIdRef = resourceById({
      fromResourceById: this.innerResourceByIdRef,
      params: ({ value, status }) => {
        return status() === 'resolved' || status() === 'local'
          ? value()
          : undefined;
      },
      identifier: (params) => params.id,
      loader: async ({ params }) => {
        // Simulate a stream
        return params;
      },
    });
  }
}
