import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { type Router } from '@angular/router';
import {
  Console,
  CraftRouterLink,
  CraftRouterToYield,
  craftMethod,
  craftService,
  insertLocalStoragePersister,
  provideHostName,
  query,
  toValue,
  ɵHOST_TAG_LIST,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
  type MaybeSignal,
} from '@craft-ng/core';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { ApiServiceToYield } from './api.service';

const { injectUserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  (inputs: { userId: MaybeSignal<string | undefined> }) => {
    return query(
      {
        params: () => toValue(inputs.userId),
        loader: function* ({ params: userId }) {
          yield* Console.log('Loading user with id:', userId);
          return yield* ApiServiceToYield.getItemById(userId);
        },
      },
      insertLocalStoragePersister({
        storeName: 'demo-app-craft',
        key: 'user-query',
      }),
    );
  },
);

@Component({
  selector: 'app-query',
  imports: [JsonPipe, StatusComponent, CraftRouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['query.css'],
  template: `
    <div>
      User
      <app-status [status]="user.status()" />

      :
      @if (user.hasValue()) {
        <pre>{{ user.value() | json }}</pre>
      }
    </div>

    <div>
      <p>
        > Reload the page to see the query result to be retrieved from the cache
      </p>
    </div>

    <button (click)="previousPage()">Previous user</button>
    <button (click)="nextPage()">Next user</button>

    <a [craftRouterLink]="{ to: 'login-form' }" routerLinkActive="active"
      >Login Form</a
    >
  `,
  providers: [provideHostName('GlobalQuery')],
})
export default class GlobalQuery {
  public readonly userId = input<string>();

  protected readonly user = injectUserQuery({
    userId: this.userId,
  });

  protected nextPage = craftMethod(this, function* () {
    yield* Console.log('Navigating to next user');
    const { navigate } = yield* CraftRouterToYield(
      undefined,
      ({ navigate }) => ({ navigate }),
    );
    const name = inject(ɵHOST_TAG_LIST);
    debugger;
    void navigate({
      to: 'craft/query/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '0', 10) + 1),
      },
    });
  });

  protected previousPage = craftMethod(this, function* () {
    const { navigate } = yield* CraftRouterToYield(
      undefined,
      ({ navigate }) => ({ navigate }),
    );
    void navigate({
      to: 'craft/query/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '10', 10) - 1),
      },
    });
  });
}

export type GenDeps_GlobalQuery = GetDeps<{
  deps: {
    JsonPipe: JsonPipe;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
  };
  propertiesDeps: {
    userId: ExtractDeps<GlobalQuery['userId']>;
    user: {
      UserQuery: ExtractDeps<typeof injectUserQuery>['UserQuery'];
    };
    nextPage: ExtractDeps<GlobalQuery['nextPage']>;
    previousPage: ExtractDeps<GlobalQuery['previousPage']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<GlobalQuery>;
  missingProvider: {
    Router: Router;
  };
}>;
