import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  craft,
  craftQueryParam,
  craftQueryParams,
  queryParam,
} from '@ng-craft/core';
const { injectMyStoreCraft } = craft(
  {
    name: 'MyStore',
    providedIn: 'root',
  },
  craftQueryParam('search', () =>
    queryParam(
      {
        state: {
          search: {
            fallbackValue: '',
            parse: (value: string) => value,
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set, reset }) => ({ set, reset }),
    ),
  ),
  craftQueryParams(() => ({
    pagination: queryParam(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
          pageSize: {
            fallbackValue: 10,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set, reset }) => ({ set, reset }),
    ),
    active: queryParam(
      {
        state: {
          isActive: {
            fallbackValue: false,
            parse: (value: string) => value === 'true',
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set }) => ({ set }),
    ),
  })),
);

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <h2>Test Component</h2>
      <p>Page: {{ store.pagination().page }}</p>
      <p>Page Size: {{ store.pagination().pageSize }}</p>
      <p>Is Active: {{ store.active().isActive }}</p>
      <p>Search: {{ store.search().search }}</p>
    </div>
    <button
      (click)="
        store.setPagination({
          page: store.pagination().page + 1,
          pageSize: store.pagination().pageSize,
        })
      "
    >
      Next Page
    </button>
    <button (click)="store.resetPagination()">Reset</button>
  `,
})
export default class TestComponent {
  store = injectMyStoreCraft();

  constructor() {
    console.log('store', this.store);
  }
}
