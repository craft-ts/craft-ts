import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { craftService } from '../craft-service';
import { query } from '../query';
import { queryParams } from '../query-params';
import { state } from '../state';
import { insertForm } from './insert-form';
import { craftUse } from '../craft-use';

type User = {
  id: string;
  name: string;
  email: string;
};

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('insertForm compatibility with queryParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('infers the field tree type from the query param state (not unknown)', () => {
    TestBed.runInInjectionContext(() => {
      craftUse(
        queryParams(
          {
            state: {
              name: {
                fallbackValue: 'romain',
                parse: (value: string) => value,
                serialize: (value: unknown) => String(value),
              },
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          },
          insertForm(({ field }) => {
            // The whole point: `field` is typed from the query param state,
            // so accessing nested fields is type-safe (not `unknown`).
            expectTypeOf(field.name.value()).toEqualTypeOf<string>();
            expectTypeOf(field.page.value()).toEqualTypeOf<number>();
            return {};
          }),
        ),
      );
    });
  });

  it('exposes a working form at runtime over the query param state', () => {
    TestBed.runInInjectionContext(() => {
      const params = craftUse(
        queryParams(
          {
            state: {
              name: {
                fallbackValue: 'romain',
                parse: (value: string) => value,
                serialize: (value: unknown) => String(value),
              },
              page: {
                fallbackValue: 1,
                parse: (value: string) => parseInt(value, 10),
                serialize: (value: unknown) => String(value),
              },
            },
          },
          insertForm(),
        ),
      );

      expect(params.form).toBeDefined();
      expect(params.form.name.value()).toBe('romain');
      expect(params.form.page.value()).toBe(1);
      expect(params.form.value()).toEqual({ name: 'romain', page: 1 });
    });
  });

  it('runs chained insertions inside a queryParams context', () => {
    TestBed.runInInjectionContext(() => {
      const params = craftUse(
        queryParams(
          {
            state: {
              name: {
                fallbackValue: 'romain',
                parse: (value: string) => value,
                serialize: (value: unknown) => String(value),
              },
            },
          },
          insertForm(
            ({ field }) => ({
              getName: () => field.name.value(),
            }),
            ({ insertions }) => ({
              upperName: () => insertions.getName().toUpperCase(),
            }),
          ),
        ),
      );

      expect(params.form.getName()).toBe('romain');
      expect(params.form.upperName()).toBe('ROMAIN');
    });
  });
});

describe('insertForm compatibility with query', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('infers the field tree type from the resource state (not unknown)', () => {
    craftService({ name: 'UserStoreTyping', scope: 'global' }, function* () {
      return {
        user: yield* query(
          {
            params: () => '5',
            loader: async ({ params }): Promise<User> => ({
              id: params,
              name: 'John Doe',
              email: 'john@doe.com',
            }),
          },
          insertForm(({ field }) => {
            expectTypeOf(field.name.value()).toEqualTypeOf<string>();
            expectTypeOf(field.email.value()).toEqualTypeOf<string>();
            expectTypeOf(field.id.value()).toEqualTypeOf<string>();
            return {};
          }),
        ),
      };
    });
  });

  it('exposes a working form at runtime over the resolved resource state', async () => {
    const { injectUserStore } = craftService(
      { name: 'UserStore', scope: 'global' },
      function* () {
        return {
          user: yield* query(
            {
              params: () => '5',
              loader: async ({ params }): Promise<User> => ({
                id: params,
                name: 'John Doe',
                email: 'john@doe.com',
              }),
            },
            insertForm(),
          ),
        };
      },
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectUserStore();
      expect(store.user.form).toBeDefined();

      await vi.runAllTimersAsync();

      expect(store.user.form.name.value()).toBe('John Doe');
      expect(store.user.form.email.value()).toBe('john@doe.com');
    });
  });
});

describe('insertForm regression with state primitive', () => {
  it('still infers the field tree type and works over a plain state', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = craftUse(
        state(
          { name: 'romain', password: 'secret' },
          insertForm(({ field }) => {
            expectTypeOf(field.name.value()).toEqualTypeOf<string>();
            expectTypeOf(field.password.value()).toEqualTypeOf<string>();
            return {
              getName: () => field.name.value(),
            };
          }),
        ),
      );

      expect(loginForm.form.name.value()).toBe('romain');
      expect(loginForm.form.getName()).toBe('romain');
    });
  });
});
