import {
  button,
  craftComponent,
  div,
  fieldset,
  form,
  heading,
  ifNode,
  input,
  label,
  legend,
  option,
  p,
  select,
  span,
  textarea,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { buttonUi, fieldUi } from '@craft-ts/ui/style';
import { CLOUD_WAITLIST_ENDPOINT } from '../cloud.ts';
import { cloudWaitlistUi } from './cloud.style.ts';

/** What the cloud would do. The reader ticks the ones they would use first. */
export const CLOUD_FEATURES = [
  {
    value: 'session-replay',
    label: 'Replay real user sessions to reproduce a bug',
  },
  {
    value: 'e2e-from-sessions',
    label: 'Turn real sessions into end-to-end tests',
  },
  { value: 'frustration', label: 'Find where users get stuck or frustrated' },
  { value: 'business-analytics', label: 'Analytics on business events' },
] as const;

const TEAM_SIZES = [
  'Just me',
  '2–10',
  '11–50',
  '51–200',
  'More than 200',
] as const;

const CRAFT_USAGE = [
  { value: 'production', label: 'Yes, in production' },
  { value: 'side-project', label: 'Yes, on a side project' },
  { value: 'evaluating', label: 'I am evaluating it' },
  { value: 'not-yet', label: 'Not yet' },
] as const;

type Status = 'idle' | 'sending' | 'sent' | 'failed' | 'closed';

/**
 * Where the submission stands. The form is posted to Formspree; without an endpoint
 * the waitlist is `closed` and nothing leaves the page.
 */
const { CloudWaitlistView, provideCloudWaitlistView } = craftService(
  { name: 'cloudWaitlistView', providedIn: 'toProvide' },
  function* () {
    const submission = yield* state(
      'submission',
      { status: 'idle' } as { readonly status: Status },
      ({ update }) => ({
        send: (data: FormData) => {
          if (!CLOUD_WAITLIST_ENDPOINT) {
            update(() => ({ status: 'closed' }));
            return;
          }
          update(() => ({ status: 'sending' }));
          fetch(CLOUD_WAITLIST_ENDPOINT, {
            method: 'POST',
            body: data,
            headers: { Accept: 'application/json' },
          })
            .then((response) =>
              update(() => ({ status: response.ok ? 'sent' : 'failed' })),
            )
            .catch(() => update(() => ({ status: 'failed' })));
        },
      }),
    );
    yield* craftExpose('send', submission.send);
  },
);

const failureText: Partial<Record<Status, string>> = {
  failed: 'Sending failed. Please try again in a moment.',
  closed: 'The waitlist is not open yet. Please come back soon.',
};

/**
 * The waitlist of CraftTS Cloud: an email and three short questions, so the cloud is
 * built for the people who asked for it. Without JavaScript the form still posts, and
 * Formspree answers with its own page.
 */
export const CloudWaitlist = craftComponent(
  'CloudWaitlist',
  { providers: [provideCloudWaitlistView()] },
  function* () {
    const view = yield* CloudWaitlistView();
    const status = function* () {
      return (yield* view.submission()).status;
    };
    return div({ id: 'waitlist' }, [
      ifNode(
        'cloudWaitlistSent',
        function* () {
          return (yield* status()) === 'sent';
        },
        () =>
          div({ class: cloudWaitlistUi.thanks, role: 'status' }, [
            heading(
              { class: cloudWaitlistUi.thanksHeading },
              'You are on the list. Thank you!',
            ),
            p(
              { class: cloudWaitlistUi.thanksText },
              'You will hear about CraftTS Cloud before anyone else — early access first, then the launch.',
            ),
          ]),
        () =>
          form(
            'cloudWaitlistForm',
            {
              class: cloudWaitlistUi.root,
              method: 'post',
              ...(CLOUD_WAITLIST_ENDPOINT
                ? { action: CLOUD_WAITLIST_ENDPOINT }
                : {}),
              'aria-label': 'CraftTS Cloud waitlist',
              *submit(event) {
                event.preventDefault();
                if ((yield* status()) === 'sending') return;
                view.send(new FormData(event.target as HTMLFormElement));
              },
            },
            [
              div({ class: cloudWaitlistUi.field }, [
                label(
                  { class: fieldUi.label, htmlFor: 'cloud-waitlist-email' },
                  'Work email',
                ),
                input('cloudWaitlistEmail', {
                  id: 'cloud-waitlist-email',
                  class: fieldUi.input,
                  type: 'email',
                  name: 'email',
                  required: true,
                  autocomplete: 'email',
                  placeholder: 'you@company.com',
                }),
              ]),
              fieldset({ class: cloudWaitlistUi.group }, [
                legend(
                  { class: cloudWaitlistUi.legend },
                  'What would you use first?',
                ),
                label({ class: cloudWaitlistUi.choice }, [
                  input('cloudFeatureSessionReplay', {
                    class: cloudWaitlistUi.box,
                    type: 'checkbox',
                    name: 'features',
                    value: 'session-replay',
                  }),
                  span(CLOUD_FEATURES[0].label),
                ]),
                label({ class: cloudWaitlistUi.choice }, [
                  input('cloudFeatureGeneratedTests', {
                    class: cloudWaitlistUi.box,
                    type: 'checkbox',
                    name: 'features',
                    value: 'e2e-from-sessions',
                  }),
                  span(CLOUD_FEATURES[1].label),
                ]),
                label({ class: cloudWaitlistUi.choice }, [
                  input('cloudFeatureFrustration', {
                    class: cloudWaitlistUi.box,
                    type: 'checkbox',
                    name: 'features',
                    value: 'frustration',
                  }),
                  span(CLOUD_FEATURES[2].label),
                ]),
                label({ class: cloudWaitlistUi.choice }, [
                  input('cloudFeatureBusinessAnalytics', {
                    class: cloudWaitlistUi.box,
                    type: 'checkbox',
                    name: 'features',
                    value: 'business-analytics',
                  }),
                  span(CLOUD_FEATURES[3].label),
                ]),
              ]),
              div({ class: cloudWaitlistUi.field }, [
                label(
                  { class: fieldUi.label, htmlFor: 'cloud-waitlist-team' },
                  'Team size',
                ),
                select(
                  'cloudWaitlistTeam',
                  {
                    id: 'cloud-waitlist-team',
                    class: fieldUi.input,
                    name: 'team_size',
                  },
                  [
                    option({ value: '' }, 'Choose…'),
                    ...TEAM_SIZES.map((size) => option({ value: size }, size)),
                  ],
                ),
              ]),
              div({ class: cloudWaitlistUi.field }, [
                label(
                  { class: fieldUi.label, htmlFor: 'cloud-waitlist-usage' },
                  'Do you use CraftTS today?',
                ),
                select(
                  'cloudWaitlistUsage',
                  {
                    id: 'cloud-waitlist-usage',
                    class: fieldUi.input,
                    name: 'craft_usage',
                  },
                  [
                    option({ value: '' }, 'Choose…'),
                    ...CRAFT_USAGE.map((usage) =>
                      option({ value: usage.value }, usage.label),
                    ),
                  ],
                ),
              ]),
              div({ class: cloudWaitlistUi.field }, [
                label(
                  { class: fieldUi.label, htmlFor: 'cloud-waitlist-message' },
                  'What would make it a must-have for you? (optional)',
                ),
                textarea('cloudWaitlistMessage', {
                  id: 'cloud-waitlist-message',
                  'aria-label': 'What would make it a must-have for you?',
                  class: fieldUi.input,
                  name: 'message',
                  rows: 3,
                }),
              ]),
              // Formspree drops a submission whose hidden field a bot filled in.
              input('cloudWaitlistTrap', {
                class: cloudWaitlistUi.trap,
                type: 'text',
                name: '_gotcha',
                tabIndex: -1,
                autocomplete: 'off',
                'aria-hidden': 'true',
              }),
              input('cloudWaitlistSubject', {
                type: 'hidden',
                name: '_subject',
                value: 'CraftTS Cloud waitlist',
              }),
              p(
                { class: cloudWaitlistUi.privacy },
                'Your email is only used to tell you about CraftTS Cloud: early access, then the launch. It is never shared, and one reply is enough to have it deleted.',
              ),
              div({ class: cloudWaitlistUi.footer }, [
                button(
                  'cloudWaitlistSubmit',
                  {
                    type: 'submit',
                    class: buttonUi.root,
                    'data-variant': 'primary',
                    'data-fit': 'fixed',
                    'data-loading': function* () {
                      return (yield* status()) === 'sending' ? 'true' : 'false';
                    },
                    'aria-busy': function* () {
                      return (yield* status()) === 'sending' ? 'true' : 'false';
                    },
                  },
                  [
                    span(function* () {
                      return (yield* status()) === 'sending'
                        ? 'Sending…'
                        : 'Join the waitlist';
                    }),
                  ],
                ),
                p(
                  { class: cloudWaitlistUi.failed, 'aria-live': 'polite' },
                  function* () {
                    return failureText[yield* status()] ?? '';
                  },
                ),
              ]),
            ],
          ),
      ),
    ]);
  },
);
