/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './query.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  heading,
  ifBlock,
  p,
  pre,
  type Input,
} from '@craft-ts/component';
import {
  Console,
  craftComputed,
  craftMethod,
  CraftRouter,
  craftService,
  insertStoragePersister,
  craftUnique,
  query,
  craftUse,
} from '@craft-ts/core';
import { StatusComponent } from '../../../ui/status.component';
import { ApiService } from './api.service';

const { UserQuery } = craftService(
  { name: 'UserQuery', scope: 'global' },
  function* (inputs: { userId: () => string | undefined }) {
    return yield* query(
      'userQuery',
      {
        params: inputs.userId,
        loader: function* ({ params }) {
          yield* Console.log('Loading user with id:', params);
          return yield* ApiService.getItemById(params as string);
        },
      },
      insertStoragePersister(craftUnique({
        storeName: 'demo-app-craft',
        key: 'user-query',
      })),
    );
  },
);

const CraftGlobalQuery = craftComponent(
  'CraftGlobalQuery',
  {
    stylesUrl: styles,
    cssVars: {
      '--query-ink': '#172033',
      '--query-muted': '#64748b',
      '--query-border': '#dce4ef',
      '--query-accent': '#2563eb',
      '--query-accent-dark': '#1d4ed8',
    },
  },
  function* (userId: Input<string | undefined>) {
    const user = yield* UserQuery({
      userId: () => {
        return craftUse(userId());
      },
    });

    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));

    const navigate = craftMethod('navigate', function* (offset: number) {
      void router.navigate({
        to: 'craft/query/:userId',
        params: {
          userId: String(Number((yield* userId()) ?? '0') + offset),
        },
      });
    });
    const hasUser = craftComputed('hasUser', () => user.hasValue());
    return { user, hasUser, navigate };
  },
  ({ user, hasUser, navigate }) =>
    div({ class: 'query-shell' }, [
      heading('User query'),
      div({ class: 'query-result' }, [
        'User ',
        StatusComponent({ status: user.status }),
        ifBlock(hasUser, () =>
          pre('QueryValue', {}, function* () {
            return JSON.stringify(yield* user.value(), null, 2);
          }),
        ),
      ]),
      p(
        { class: 'query-note' },
        'Reload the page to retrieve the query result from the cache.',
      ),
      div({ class: 'query-actions' }, [
        button(
          'GoToPreviousUser',
          { type: 'button',
            *click() {
              yield* navigate(-1);
            },
          },
          'Previous user',
        ),
        button(
          'GoToNextUser',
          { type: 'button',
            *click() {
              yield* navigate(1);
            },
          },
          'Next user',
        ),
      ]),
    ]),
);

export default CraftGlobalQuery;
