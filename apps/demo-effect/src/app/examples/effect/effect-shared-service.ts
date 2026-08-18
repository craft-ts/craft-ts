/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  button,
  craftComponent,
  div,
  heading,
  ifBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, state } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { checkUserAccess } from '../../shared/access-domain';

/**
 * Demonstrates a shared business operation whose service dependency is
 * provided by the application Layer, not resolved by the component.
 */
const EffectSharedServiceComponent = craftComponent(
  'EffectSharedServiceComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #dbeafe; border-radius: 12px; color: #1e293b; background: #eff6ff; }
      :scope h1 { margin: 0 0 0.5rem; color: #172554; }
      .intro { margin: 0 0 1.25rem; color: #334155; line-height: 1.55; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
      .actions button { padding: 0.5rem 0.9rem; border: 1px solid #93c5fd; border-radius: 6px; color: #1e3a8a; background: #fff; cursor: pointer; }
      .panel { padding: 1rem 1.1rem; border: 1px solid #bfdbfe; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.65rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .row { margin: 0.45rem 0; line-height: 1.5; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #dbeafe; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      .note { margin-top: 1rem; color: #475569; font-size: 0.85rem; line-height: 1.55; }
      button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const request = yield* state(
      'request',
      { userId: 'user-ada' },
      ({ update }) => ({
        select: (userId: string) => update(() => ({ userId })),
      }),
    );

    const accessQuery = yield* queryEffect(
      'accessQuery',
      {
        params: request,
        loader: ({ params }) => checkUserAccess(params.userId),
      },
      ({ resource }) => ({
        hasDecision: craftComputed('hasDecision', () => resource.hasValue()),
        showUnknown: craftComputed(
          'showUnknown',
          () => !resource.isLoading() && !resource.hasValue(),
        ),
        userName: craftComputed('userName', function* () {
          return (yield* resource.value())?.user.name ?? '…';
        }),
        accessLabel: craftComputed('accessLabel', function* () {
          return (yield* resource.value())?.label ?? '…';
        }),
        accessReason: craftComputed('accessReason', function* () {
          return (yield* resource.value())?.reason ?? '…';
        }),
      }),
    );

    return { request, accessQuery };
  },
  ({ request, accessQuery }) =>
    div([
      heading('Vérifier les droits'),
      p(
        { class: 'intro' },
        'Un opérateur veut savoir ce qu’il peut faire avec le profil d’un membre. La décision est calculée par une opération métier partagée qui utilise un service de politique d’accès mocké.',
      ),
      div({ class: 'actions' }, [
        button(
          'adaButton',
          { type: 'button', *click() { yield* request.select('user-ada'); } },
          'Ada — administratrice',
        ),
        button(
          'graceButton',
          { type: 'button', *click() { yield* request.select('user-grace'); } },
          'Grace — membre',
        ),
        button(
          'linusButton',
          {
            type: 'button',
            *click() {
              yield* request.select('user-linus');
            },
          },
          'Linus — compte suspendu',
        ),
      ]),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Décision d’accès'),
        ifBlock(accessQuery.isLoading, () => p('Vérification en cours…')),
        ifBlock(accessQuery.hasDecision, () => [
          p({ class: 'row' }, [strong('Utilisateur : '), accessQuery.userName]),
          p({ class: 'row' }, [strong('Niveau : '), accessQuery.accessLabel]),
          p({ class: 'row' }, [strong('Pourquoi : '), accessQuery.accessReason]),
        ]),
        ifBlock(accessQuery.showUnknown, () =>
          p({ class: 'row' }, 'Utilisateur inconnu.'),
        ),
      ]),
      p({ class: 'note' }, [
        'Le composant appelle ',
        span({ class: 'mono' }, 'checkUserAccess(userId)'),
        '. Il ne connaît pas ',
        span({ class: 'mono' }, 'AccessPolicyService'),
        ' : le Layer applicatif fournit cette dépendance à l’opération Effect.',
      ]),
    ]),
);

export default EffectSharedServiceComponent;
