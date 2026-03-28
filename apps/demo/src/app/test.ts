import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import {
  cAsyncValidate,
  cEmail,
  craft,
  craftException,
  craftQueryParams,
  craftSources,
  cRequired,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  query,
  queryParam,
  signalSource,
  source$,
  state,
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
      debugger;
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
}

function t() {
  const userFormState = state(
    { name: '', email: '' },
    insertForm(
      insertSelectFormTree(
        'name',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired()],
        })),
      ),
      insertSelectFormTree(
        'email',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired(), cEmail()],
        })),
      ),
    ),
  );

  const form = userFormState.form();
  const nameField = form.selectName();
  const emailField = form.selectEmail();
}
