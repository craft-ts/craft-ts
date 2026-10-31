import {
  button,
  craftComponent,
  div,
  heading,
  p,
  section,
  span,
} from '@craft-ts/component';
import { craftMethod, craftService, subject } from '@craft-ts/core';
import {
  catchTag,
  fromSubscribable,
  map,
  streamSignal,
  timeout,
} from '@craft-ts/stream';
import { example } from '../../shared/example.style';

export const { TemporalReplayView, provideTemporalReplayView } = craftService(
  { name: 'temporalReplayView', providedIn: 'toProvide' },
  function* () {
    const aliceHeartbeat = subject<void>();
    yield* streamSignal(
      'aliceSession',
      fromSubscribable(aliceHeartbeat).pipe(
        map(() => 'heartbeat'),
        timeout({ each: 1_200 }),
        catchTag(
          'StreamTimeout',
          (error) => `timeout (${error.payload.ms} ms)`,
        ),
      ),
    );
    yield* craftMethod('pingAlice', function* () {
      aliceHeartbeat.next();
    });

    const bobHeartbeat = subject<void>();
    yield* streamSignal(
      'bobSession',
      fromSubscribable(bobHeartbeat).pipe(
        map(() => 'heartbeat'),
        timeout({ first: 700, each: 1_500 }),
        catchTag(
          'StreamTimeout',
          (error) => `timeout (${error.payload.ms} ms)`,
        ),
      ),
    );
    yield* craftMethod('pingBob', function* () {
      bobHeartbeat.next();
    });

    const chloeHeartbeat = subject<void>();
    yield* streamSignal(
      'chloeSession',
      fromSubscribable(chloeHeartbeat).pipe(
        map(() => 'heartbeat'),
        timeout({ each: 2_000 }),
        catchTag(
          'StreamTimeout',
          (error) => `timeout (${error.payload.ms} ms)`,
        ),
      ),
    );
    yield* craftMethod('pingChloe', function* () {
      chloeHeartbeat.next();
    });
  },
);

const TemporalStreamReplay = craftComponent(
  'TemporalStreamReplay',
  { providers: [provideTemporalReplayView()] },
  () =>
    div({ class: example.card, 'data-testid': 'temporal-stream-replay' }, [
      heading({ class: example.title }, 'Replay · streams et délais'),
      p(
        { class: example.text },
        'Capture cette page avec le debug session replay. Chaque utilisateur démarre son propre stream à l’ouverture de la page : envoie quelques heartbeats, puis laisse expirer certaines sessions. Le replay doit retrouver le même ordre d’événements et les mêmes expirations.',
      ),
      section({ class: example.panel, 'data-testid': 'alice-session' }, [
        heading(
          { class: example.subtitle },
          'Alice · timeout entre événements',
        ),
        p({ class: example.text }, 'Timeout après 1 200 ms de silence.'),
        p([
          'État : ',
          span(
            { 'data-testid': 'alice-status' },
            TemporalReplayView.aliceSession.status,
          ),
        ]),
        p([
          'Dernier événement : ',
          span({ 'data-testid': 'alice-value' }, function* () {
            return String(
              (yield* TemporalReplayView.aliceSession.value()) ?? '—',
            );
          }),
        ]),
        div({ class: example.toolbar }, [
          button(
            'aliceHeartbeat',
            {
              type: 'button',
              'data-testid': 'alice-heartbeat',
              click: TemporalReplayView.pingAlice,
            },
            'Envoyer un heartbeat',
          ),
        ]),
      ]),
      section({ class: example.panel, 'data-testid': 'bob-session' }, [
        heading(
          { class: example.subtitle },
          'Bob · délai initial puis timeout',
        ),
        p(
          { class: example.text },
          '700 ms pour le premier heartbeat, puis 1 500 ms.',
        ),
        p([
          'État : ',
          span(
            { 'data-testid': 'bob-status' },
            TemporalReplayView.bobSession.status,
          ),
        ]),
        p([
          'Dernier événement : ',
          span({ 'data-testid': 'bob-value' }, function* () {
            return String(
              (yield* TemporalReplayView.bobSession.value()) ?? '—',
            );
          }),
        ]),
        div({ class: example.toolbar }, [
          button(
            'bobHeartbeat',
            {
              type: 'button',
              'data-testid': 'bob-heartbeat',
              click: TemporalReplayView.pingBob,
            },
            'Envoyer un heartbeat',
          ),
        ]),
      ]),
      section({ class: example.panel, 'data-testid': 'chloe-session' }, [
        heading({ class: example.subtitle }, 'Chloé · stream indépendant'),
        p({ class: example.text }, 'Timeout après 2 000 ms entre événements.'),
        p([
          'État : ',
          span(
            { 'data-testid': 'chloe-status' },
            TemporalReplayView.chloeSession.status,
          ),
        ]),
        p([
          'Dernier événement : ',
          span({ 'data-testid': 'chloe-value' }, function* () {
            return String(
              (yield* TemporalReplayView.chloeSession.value()) ?? '—',
            );
          }),
        ]),
        div({ class: example.toolbar }, [
          button(
            'chloeHeartbeat',
            {
              type: 'button',
              'data-testid': 'chloe-heartbeat',
              click: TemporalReplayView.pingChloe,
            },
            'Envoyer un heartbeat',
          ),
        ]),
      ]),
    ]),
);

export default TemporalStreamReplay;
