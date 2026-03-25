import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import {
  craft,
  craftException,
  craftQueryParams,
  craftSources,
  insertForm,
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
  imports: [CommonModule],
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

    <hr />

    <button (click)="shouldFail.set(!shouldFail())">
      Toggle query failure (currently: {{ shouldFail() }})
    </button>
    <button (click)="q.call(true)">
      Call query (currently: {{ shouldFail() }})
    </button>
    <div>
      Query status: {{ q.status() }}
      <br />
      Query data: {{ q.safeValue() | json }}
      <br />
      Query error: {{ q.error() | json }}
      <br />
      Query exceptions: {{ q.exceptions().list | json }}
    </div>
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

  loginForm = state(
    [
      {
        id: 1,
        name: '1',
        password: '',
      },
    ],
    insertForm(
      {
        identifier: ({ item }) => item.id,
      },
      ({ form, formIdentifier }) => {
        console.log('formIdentifier', formIdentifier);
        console.log('form', form);
        console.log('form()', form());
        effect(() => {
          console.log('form', form());
        });

        return {
          someInsertion: signal('test').asReadonly(),
        };
      },
      ({ setSubmitting, insertions: { someInsertion } }) => {
        setSubmitting(true);
        console.log('someInsertion', someInsertion());
        return {};
      },
    ),
  );

  shouldFail = signal(false);

  q = query({
    method: (test: boolean) =>
      this.shouldFail()
        ? craftException(
            { code: 'INVALID_USER_ID' },
            { reason: 'missing' as const },
          )
        : 'user-1',
    loader: async ({ params }) => {
      return this.shouldFail()
        ? craftException(
            { code: 'INVALID_USER_ID' },
            { reason: 'missing' as const },
          )
        : {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
    },
  });

  ngAfterViewInit(): void {
    const f = this.loginForm.select(1);
    // const f = this.loginForm.form;
    const r = f();
    console.log('r', r);
    console.log('submitting', r.submitting());
    f().someInsertion();
  }
}
