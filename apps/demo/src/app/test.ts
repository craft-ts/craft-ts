import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  addMany,
  afterRecomputation,
  cAsyncValidate,
  craft,
  craftException,
  craftQueryParams,
  craftSources,
  cRequired,
  injectService,
  insertEntities,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelect,
  insertSelectFormTree,
  query,
  queryParam,
  signalSource,
  source$,
  state,
  toSource,
  updateOne,
} from '@craft-ng/core';

const { craftGenericQueryParams } = craft(
  {
    name: 'GenericQueryParams',
    providedIn: 'feature',
  },
  craftQueryParams(() => ({
    page: queryParam(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set }) => ({
        reset: () => set({ page: 1 }),
        goTo: (page: number) => set({ page }),
      }),
    ),
  })),
);

const { injectHostCraft } = craft(
  {
    name: 'host',
    providedIn: 'root',
  },
  craftSources(() => ({
    reset: source$<void>(),
    goTo: source$<number>(),
  })),
  craftGenericQueryParams(({ reset, goTo }) => ({
    methods: {
      resetPage: reset,
      goToPage: goTo,
    },
  })),
);

const { injectHost1Craft } = craft(
  {
    name: 'host1',
    providedIn: 'root',
  },
  craftSources(() => ({
    reset: signalSource<{}>(),
    goTo: signalSource<number>({
      equal: () => false,
    }),
  })),
  craftGenericQueryParams(({ reset, goTo }) => ({
    methods: {
      resetPage: reset,
      goToPage: goTo,
    },
  })),
);

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule, FormField],
  template: `
    page: {{ store.pagePage() | json }}
    <button (click)="store.emitReset()">Reset page</button
    ><button (click)="store.emitGoTo(5)">Go to page 5</button> ---- page:
    {{ store1.pagePage() | json }}
    <button (click)="store1.setReset({})">Reset page</button
    ><button (click)="store1.setGoTo(5)">Go to page 5</button>
    <br />
    @for (item of pState(); track $index) {
      <br />
      {{ item() | json }}
      <input
        type="text"
        [value]="item().text"
        (input)="item.search($event.target.value)"
      />
    }
    <button (click)="pState.add()">Add</button>

    <input [formField]="loginStateWithForm.form().selectPassword()" />
    {{ loginStateWithForm.form().selectPassword()().exceptions().list | json }}

    <hr />
  `,
})
export default class TestComponent {
  usersState = state(
    {
      filters: { search: '' },
      users: [] as User[],
    },
    insertEntities({
      path: 'users',
      methods: [addMany, updateOne],
    }),
    insertSelect('filters', ({ set }) => ({
      setSearch: (search: string) => set({ search }),
    })),
  );

  t = this.usersState.usersAddMany({
    newEntities: [{ id: '1', name: 'Romain', selected: false }],
  });
  t2 = this.usersState.selectFilters().setSearch('@craft-ng');
  store = injectHostCraft();
  store1 = injectHost1Craft();

  instance = (page: number) =>
    state(
      {
        page,
        text: '',
      },
      ({ state, update }) => ({
        pageNumber: computed(() => state().page),
        search: (text: string) => update((v) => ({ ...v, text })),
      }),
    );

  pState = state([this.instance(1)], ({ state, update }) => ({
    child: computed(() => state()),
    add: () => update((v) => [...v, this.instance(v.length + 1)]),
  }));

  test = state(
    {
      myProperty: 1,
    },
    ({ state }) => {
      effect(() => {
        console.log('state', state());
      });
      return {};
    },
  );

  checkEmailValidity = query({
    method: (payload: { name: string; password: string; id: string }) => {
      return payload.name === 'errorParams'
        ? craftException({ code: 'INVALID_EMAIL' })
        : payload;
    },
    // identifier: (payload) => payload.id,
    loader: async ({ params }) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return params.name === 'errorLoader'
        ? craftException({ code: 'LOADER_ERROR' })
        : { email: params };
    },
  });

  loginStateWithForm = state(
    {
      id: 1,
      name: '1',
      password: '',
    },
    insertForm(
      insertSelectFormTree(
        'password',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [
            cRequired(),
            cAsyncValidate(this.checkEmailValidity, {
              name: 'emailValidator',
            }),
          ],
        })),
      ),
    ),
  );

  shouldFail = signal(false);

  s = signal('init');

  r = toSource(this.s);

  protected readonly router = injectService(Router, ({ navigate }) => ({
    cancel: () => navigate(['/']),
    backOnSaveSuccess: afterRecomputation(this.r, () => navigate(['/'])),
  }));
}
type User = { id: string; name: string; selected: boolean };
