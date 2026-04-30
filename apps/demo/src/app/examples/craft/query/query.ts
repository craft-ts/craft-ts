import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  craftService,
  insertLocalStoragePersister,
  query,
  toValue,
  type DerivedService,
  type GetDeps,
  type GetInjectedServiceDependencies,
  type GetPublicComponentProperties,
  type GetServiceOutput,
  type MaybeSignal,
} from '@craft-ng/core';
import { injectCraftRouter } from '../../../shared/router.service';
import {
  StatusComponent,
  type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { ApiServiceToYield } from './api.service';

const { injectUserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: MaybeSignal<string | undefined> }) {
    const { getItemById } = yield* ApiServiceToYield({}, ({ getItemById }) => ({
      getItemById,
    }));

    return query(
      {
        params: () => toValue(inputs.userId),
        loader: ({ params: userId }) => getItemById(userId),
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
  imports: [JsonPipe, StatusComponent],
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
  `,
})
export default class GlobalQuery {
  public readonly userId = input<string>();

  protected readonly router = injectCraftRouter(undefined, ({ navigate }) => ({
    navigate,
  }));

  protected readonly user = injectUserQuery({
    userId: this.userId,
  });

  protected nextPage() {
    this.router.navigate([
      'craft',
      'query',
      parseInt(this.userId() ?? '0') + 1,
    ]);
  }

  protected previousPage() {
    this.router.navigate([
      'craft',
      'query',
      parseInt(this.userId() ?? '10') - 1,
    ]);
  }
}

export type GenDeps_GlobalQuery = GetDeps<{
  deps: {
    JsonPipe: JsonPipe;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
    CraftRouter: DerivedService<
      GetInjectedServiceDependencies<typeof injectCraftRouter>,
      {
        derivedPropertiesUsed: {
          navigate: GetServiceOutput<typeof injectCraftRouter>['navigate'];
        };
        derivedPropertiesExposed: {
          navigate: GetServiceOutput<typeof injectCraftRouter>['navigate'];
        };
      }
    >;
    UserQuery: GetInjectedServiceDependencies<typeof injectUserQuery>;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<GlobalQuery>;
}>;
