import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
    injectCraftRouter,
    insertLocalStoragePersister,
    insertReactOnMutation,
    mutation,
    provideHostName,
    query,
    type DerivedService,
    type ExtractDeps,
    type GetDeps,
    type GetInjectedServiceDependencies,
    type GetPublicComponentProperties,
    type GetServiceOutput
} from '@craft-ng/core';
import {
    StatusComponent,
    type GenDeps_StatusComponent,
} from '../../../ui/status.component';
import { injectApiService, User } from './api.service';

@Component({
  selector: 'app-mutation',
  imports: [CommonModule, StatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['mutation.css'],
  template: `
    <div>
      User
      <app-status [status]="userQuery.status()" />

      :
      @if (userQuery.hasValue()) {
        <pre>{{ userQuery.value() | json }}</pre>
      }
    </div>

    <div>
      <p>
        > Reload the page to see the query result to be retrieved from the cache
      </p>
      <p>> Update the user name to see optimistic updates in action</p>
    </div>

    <input #nameInput type="text" placeholder="New name" />
    <button
      (click)="updateUserNameFn(nameInput.value)"
      [disabled]="updateUserName.isLoading()"
    >
      Update name (<app-status [status]="updateUserName.status()" />)
    </button>
  `,
  providers: [provideHostName('MutationDemoComponent')]
})
export default class MutationDemoComponent {
  public readonly userId = input<string>();
  private readonly apiService = injectApiService();

  protected readonly updateUserName = mutation({
    method: (payload: { userName: string; user: User }) => ({
      ...payload.user,
      name: payload.userName,
    }),
    loader: ({ params: user }) => this.apiService.updateItem(user),
  });

  protected readonly userQuery = query(
    {
      params: this.userId,
      loader: ({ params: userId }) => this.apiService.getItemById(userId),
      preservePreviousValue: () => true, // keep the previous user display while the new one fetching
    },
    insertLocalStoragePersister({
      storeName: 'demo-app',
      key: 'mutation',
    }),
    insertReactOnMutation(this.updateUserName, {
      optimisticPatch: {
        name: ({ mutationParams: { name } }) => name,
      },
    }),
  );

  private readonly router = injectCraftRouter(undefined, ({ navigate }) => ({
    navigate,
  }));

  protected updateUserNameFn(newName: string) {
    const user = this.userQuery.hasValue() ? this.userQuery.value() : null;
    if (!user) {
      return;
    }
    this.updateUserName.mutate({ userName: newName, user });
  }

  protected nextPage() {
    void this.router.navigate({
      to: 'mutation/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '0', 10) + 1),
      },
    });
  }

  protected previousPage() {
    void this.router.navigate({
      to: 'mutation/:userId',
      params: {
        userId: String(parseInt(this.userId() ?? '10', 10) - 1),
      },
    });
  }
}

export type GenDeps_GlobalQuery = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    GenDeps_StatusComponent: GenDeps_StatusComponent;
    ApiService: GetInjectedServiceDependencies<typeof injectApiService>;
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
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<MutationDemoComponent>;
}>;
export type GenDeps_MutationDemoComponent = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        GenDeps_StatusComponent: GenDeps_StatusComponent;
      };
      propertiesDeps: {
        userId: ExtractDeps<MutationDemoComponent["userId"]>;
        apiService: {
            ApiService: ExtractDeps<typeof injectApiService>["ApiService"];
          };
        updateUserName: ExtractDeps<MutationDemoComponent["updateUserName"]>;
        userQuery: ExtractDeps<MutationDemoComponent["userQuery"]>;
        router: {
            CraftRouter: ReturnType<typeof injectCraftRouter>;
          };
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<MutationDemoComponent>;
      missingProvider: {
        CraftRouter: ReturnType<typeof injectCraftRouter>;
      };
    }>;
