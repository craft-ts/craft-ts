import { Component } from '@angular/core';
import {
    craftException,
    CraftHttpClient,
    craftService,
    provideHostName,
    query,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';
import { User } from '../query/api.service';
import { injectOtherService, provideOtherService } from './to-provide.service';

const { injectUsersApiOnError } = craftService(
  { name: 'UsersApiOnError', scope: 'global' },
  function* () {
    const users = yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response<User[]>(),
      exceptions: [
        function* ({ status, code, content }) {
          if (!(yield* status(400))) {
            return;
          }

          if (!(yield* code('PASSWORD_REQUIRED'))) {
            return;
          }

          if (!(yield* content('Password is required'))) {
            return;
          }

          return craftException(
            {
              code: 'PASSWORD_REQUIRED',
              scope: 'AuthApi',
            },
            {
              field: 'password',
            },
          );
        },
      ],
    }));

    return {
      users,
      query: query({
        params: () => true,
        loader: () => users(),
      }),
    };
  },
);

const { TestToYield } = craftService({ name: 'test', scope: 'global' }, () => {
  return {
    getValue: () => 'test service value',
    getValue2: () => 'test service value2',
  };
});
const { injectTest2 } = craftService(
  { name: 'test2', scope: 'global' },
  function* () {
    yield* TestToYield(undefined, ({ getValue }) => ({ getValue }));

    return {};
  },
);

@Component({
  selector: 'app-other',
  providers: [provideOtherService(), provideHostName('component:OtherComponent')],
  template: ` {{ _injectOtherService.getValue() }}
    query status: {{ _injectUsersApiOnError.query.status() }}`,
})
export class OtherComponent {
  _injectOtherService = injectOtherService();
  _injectUsersApiOnError = injectUsersApiOnError();
  _injectTest2 = injectTest2();
}

export type GenDeps_OtherComponent = GetDeps<{
      deps: {};
      propertiesDeps: {
        _injectOtherService: {
            OtherService: ExtractDeps<typeof injectOtherService>["OtherService"];
          };
        _injectUsersApiOnError: {
            UsersApiOnError: ExtractDeps<typeof injectUsersApiOnError>["UsersApiOnError"];
          };
        _injectTest2: {
            test2: ExtractDeps<typeof injectTest2>["test2"];
          };
      };
      provided: {
        OtherService: ReturnType<typeof provideOtherService>;
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<OtherComponent>;
    }>;
