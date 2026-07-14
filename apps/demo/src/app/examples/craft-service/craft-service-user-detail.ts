import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  craftUse,
  componentMonitoring,
  craftService,
  provideHostName,
  query,
  state,
  toValue,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
  type MaybeSignal,
} from '@craft-ng/core';

// -- Types --

type User = {
  id: string;
  name: string;
  email: string;
};

// -- Fake API delay --

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// -- Fake data --

const USERS: User[] = [
  { id: '1', name: 'Romain', email: 'romain@craft.dev' },
  { id: '2', name: 'Julien', email: 'julien@craft.dev' },
  { id: '3', name: 'Daniel', email: 'daniel@craft.dev' },
  { id: '4', name: 'Kevin', email: 'kevin@craft.dev' },
  { id: '5', name: 'Lucie', email: 'lucie@craft.dev' },
];

// -- UsersApi: global craftService exposing multiple endpoints --

const { UsersApiToYield } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    getUser: (userId: string) => {
      const user = USERS.find((u) => u.id === userId);
      if (!user) throw new Error(`User ${userId} not found`);
      return delay(user, 1500);
    },
    getUsers: () => delay(USERS, 1500),
    updateUser: (updated: User) => {
      const index = USERS.findIndex((u) => u.id === updated.id);
      if (index === -1) throw new Error(`User ${updated.id} not found`);
      USERS[index] = updated;
      return delay(updated, 1000);
    },
    availableUserIds: ['1', '2', '3', '4', '5'],
  }),
);

// -- User: toProvide craftService that yields UsersApi and exposes a query --

const { injectUser, provideUser } = craftService(
  { name: 'User', scope: 'toProvide' },
  function* (inputs: { userId: MaybeSignal<string> }) {
    const usersApi = yield* UsersApiToYield();

    return {
      ...(yield* query({
        params: () => toValue(inputs.userId),
        loader: ({ params: userId }) => usersApi.getUser(userId),
      })),
      userIds: usersApi.availableUserIds,
    };
  },
);

// -- Component --

@Component({
  selector: 'app-craft-service-user-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideUser(),
    provideHostName('component:CraftServiceUserDetailComponent'),
  ],
  template: `
    <div class="user-detail">
      <h2>craftService User Detail (query)</h2>

      <div class="controls">
        <label>
          User ID:
          <select [value]="userId()" (change)="userId.setUserId($event)">
            @for (id of user.userIds; track id) {
              <option [value]="id">User {{ id }}</option>
            }
          </select>
        </label>
      </div>

      <div class="card">
        @switch (user.status()) {
          @case ('loading') {
            <p class="loading">Loading user...</p>
          }
          @case ('exception') {
            <p class="error">Failed to load user.</p>
          }
          @case ('resolved') {
            @if (user.safeValue(); as userData) {
              <dl>
                <dt>ID</dt>
                <dd>{{ userData.id }}</dd>
                <dt>Name</dt>
                <dd>{{ userData.name }}</dd>
                <dt>Email</dt>
                <dd>{{ userData.email }}</dd>
              </dl>
            }
          }
        }
      </div>
    </div>
  `,
  styles: `
    .user-detail {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 32px;
      font-family: sans-serif;
    }
    .controls {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    select {
      padding: 6px 12px;
      font-size: 1rem;
      border: 1px solid #ccc;
      border-radius: 6px;
    }
    .card {
      min-width: 280px;
      padding: 24px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #fafafa;
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dt {
      font-weight: 600;
      color: #374151;
    }
    dd {
      margin: 0;
      color: #6b7280;
    }
    .loading {
      color: #6b7280;
      font-style: italic;
    }
    .error {
      color: #dc2626;
    }
  `,
})
export default class CraftServiceUserDetailComponent {
  private readonly _monitoring = componentMonitoring();
  protected readonly userId = craftUse(
    state(signal('1'), ({ set }) => ({
      setUserId: (event: Event | null) => {
        if (event) {
          set((event.target as HTMLSelectElement).value);
        }
      },
    })),
  );
  protected readonly user = injectUser({ userId: this.userId });
}

export type GenDeps_CraftServiceUserDetailComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<CraftServiceUserDetailComponent['_monitoring']>;
    userId: ExtractDeps<CraftServiceUserDetailComponent['userId']>;
    user: {
      User: ExtractDeps<typeof injectUser>['User'];
    };
  };
  provided: {
    User: ReturnType<typeof provideUser>;
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<CraftServiceUserDetailComponent>;
}>;
