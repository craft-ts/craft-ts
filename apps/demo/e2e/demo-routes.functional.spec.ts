import { expect, test, type Page } from '@playwright/test';
import {
  captureTemplateTrace,
  expectTemplateUpdate,
  type TemplateTraceEvent,
} from './template-trace';

type RouteScenario = {
  readonly title: string;
  readonly path: string;
  readonly content: string;
  readonly action?: (page: Page) => Promise<void>;
  readonly verify?: (page: Page) => Promise<void>;
  readonly setup?: (page: Page) => Promise<void>;
  readonly redirectedTo?: RegExp;
  readonly traceUpdate?: boolean;
};

const scenarios: readonly RouteScenario[] = [
  {
    title: 'home: add a functional component to the keyed list',
    path: '/',
    content: 'Functional SFC components',
    action: async (page) => page.getByTestId('add-user').click(),
    verify: async (page) => {
      await expect(page.getByText('Grace Hopper', { exact: true })).toBeVisible();
      await expect(page.getByText('User 3', { exact: true })).toBeVisible();
    },
  },
  {
    title: 'query: navigate between user ids and refresh the displayed record',
    path: '/query/1',
    content: 'User query',
    action: async (page) => page.getByRole('button', { name: 'Next user' }).click(),
    verify: async (page) => {
      await expect(page).toHaveURL(/\/query\/2$/);
      await expect(page.locator('main pre')).toContainText('"id": "2"');
    },
  },
  {
    title: 'mutation: update a name and retain the record identity',
    path: '/mutation/1',
    content: 'Update user',
    action: async (page) => {
      await expect(page.locator('main pre')).toContainText('"id": "1"');
      const input = page.getByPlaceholder('New name');
      await input.fill('Ada');
      await expect(input).toHaveValue('Ada');
      await page.getByTestId('update-user-name').click();
    },
    verify: async (page) => {
      await expect(page.locator('main pre')).toContainText('"name": "Ada"');
      await expect(page.locator('main pre')).toContainText('"id": "1"');
    },
  },
  {
    title: 'debounced search: render results from a deterministic response',
    path: '/debounced-web-search',
    content: 'Debounced web search',
    setup: async (page) => {
      await page.route(/https:\/\/openlibrary\.org\/search\.json/, (route) => {
        return route.fulfill({
          json: {
            numFound: 1,
            docs: [
              {
                key: '/works/OL123W',
                title: 'Dune',
                author_name: ['Frank Herbert'],
                first_publish_year: 1965,
              },
            ],
          },
        });
      });
      await page.route('https://covers.openlibrary.org/**', (route) =>
        route.fulfill({ status: 204, body: '' }),
      );
    },
    action: async (page) => {
      const search = page.getByRole('searchbox');
      await search.fill('dune');
      await expect(search).toHaveValue('dune');
      await expect(page.getByText('Dune', { exact: true })).toBeVisible();
    },
    verify: async (page) => expect(page.getByText('Frank Herbert')).toBeVisible(),
  },
  {
    title: 'slow page: settle its guard and route data',
    path: '/slow-page',
    content: 'Slow page loaded',
    verify: async (page) => expect(page.getByText('1234')).toBeVisible(),
  },
  {
    title: 'view transitions: open a photo and return to the gallery',
    path: '/view-transitions',
    content: 'View Transitions',
    action: async (page) => page.locator('a[href="/view-transitions/aurora"]').click(),
    verify: async (page) => {
      await expect(page).toHaveURL(/\/view-transitions\/aurora$/);
      await expect(page.getByRole('heading', { name: 'Aurora' })).toBeVisible();
    },
    traceUpdate: false,
  },
  {
    title: 'view transition detail: return to the gallery',
    path: '/view-transitions/aurora',
    content: 'Aurora',
    action: async (page) => page.getByTestId('vt-back').click(),
    verify: async (page) => {
      await expect(page).toHaveURL(/\/view-transitions$/);
      await expect(page.getByRole('heading', { name: 'View Transitions' })).toBeVisible();
    },
    traceUpdate: false,
  },
  {
    title: 'i18n: change the active language',
    path: '/i18n',
    content: 'Type-safe i18n',
    action: async (page) => {
      const language = page.getByRole('combobox').first();
      await language.selectOption('fr-FR');
    },
    verify: async (page) =>
      expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('fr-FR'),
  },
  {
    title: 'design system: render its component examples',
    path: '/design-system',
    content: 'A mini design system',
    action: async (page) => page.getByRole('button', { name: 'danger', exact: true }).click(),
    verify: async (page) => expect(page.locator('[data-testid="design-system"]')).toContainText('selected: danger'),
  },
  {
    title: 'design system scroll: reveal the sticky return control',
    path: '/design-system/scroll',
    content: 'A demand that travels',
    action: async (page) => {
      const port = page.locator('[data-scroll-port] > *');
      await port.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.locator('button[data-craft-name="backToTop"]')).toHaveCSS('visibility', 'visible');
    },
    verify: async (page) =>
      expect(page.locator('button[data-craft-name="backToTop"]')).toBeVisible(),
    traceUpdate: false,
  },
  {
    title: 'herbier: show feedback after saving',
    path: '/herbier',
    content: 'Herbier design system',
    action: async (page) => page.getByRole('button', { name: 'Push a tip' }).click(),
    verify: async (page) => expect(page.getByText('Saved to the herbarium.')).toBeVisible(),
  },
  {
    title: 'component composition: toggle restricted content',
    path: '/component-composition',
    content: 'Reactive composition with providers',
    action: async (page) => page.getByRole('button', { name: 'Toggle access' }).click(),
    verify: async (page) => expect(page.getByText('Private data: accessible')).toBeVisible(),
  },
  {
    title: 'content projection: invoke a projected toolbar action',
    path: '/content-projection',
    content: 'Content projection and logical contracts',
    action: async (page) => page.getByRole('button', { name: 'Direct action' }).click(),
    verify: async (page) =>
      expect(page.getByText('Last action: Direct action')).toBeVisible(),
  },
  {
    title: 'pending node: reload the settled value',
    path: '/pending-node',
    content: 'settledValue + pendingNode',
    action: async (page) => page.getByRole('button', { name: 'Reload' }).click(),
    verify: async (page) => {
      await expect(page.locator('main')).toContainText('Analytics · Compilers · Trajectories');
      await expect(page.locator('main')).toContainText('3 people');
    },
  },
  {
    title: 'pending node exception: retry the error path',
    path: '/pending-node/exception',
    content: 'failing path',
    action: async (page) => page.getByRole('button', { name: 'Issue (success)' }).click(),
    verify: async (page) => expect(page.locator('main')).toContainText('INV-2026-014'),
  },
  {
    title: 'CSS variables: render typed component examples',
    path: '/css-vars',
    content: 'Typed CSS variables',
  },
  {
    title: 'CSS variables required: render per-instance values',
    path: '/css-vars/required',
    content: 'Per-instance values',
  },
  {
    title: 'CSS variables inheritance: render inherited values',
    path: '/css-vars/inheritance',
    content: 'Inheritance',
  },
  {
    title: 'CSS variables forwarding: render overrides',
    path: '/css-vars/forwarding',
    content: 'Forwarding and overrides',
  },
  {
    title: 'CSS @property: nudge the registered value',
    path: '/css-vars/property',
    content: 'Registered variables (@property)',
    action: async (page) => page.getByRole('button', { name: 'Move the second meter' }).click(),
    verify: async (page) => expect(page.getByText('Assigned value: 88%')).toBeVisible(),
  },
  {
    title: 'pagination: advance the page and update the visible rows',
    path: '/list-with-pagination',
    content: 'User Management:',
    action: async (page) => page.getByRole('button', { name: 'Next' }).click(),
    verify: async (page) => {
      await expect(page.getByTestId('current-page')).toHaveText('2');
      await expect(page.locator('main table tbody tr')).toHaveCount(4);
    },
  },
  {
    title: 'granular mutation: update a row without losing the list',
    path: '/granular-mutation',
    content: 'User Management:',
    action: async (page) => page.getByRole('button', { name: 'Next' }).click(),
    verify: async (page) => expect(page.getByTestId('current-page')).toHaveText('2'),
  },
  {
    title: 'full demo: add a todo to the rendered list',
    path: '/full-demo',
    content: 'Full primitives demo',
    action: async (page) => {
      await page.getByPlaceholder('New todo').fill('Rerender check');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
    },
    verify: async (page) => expect(page.getByText('Rerender check', { exact: true })).toBeVisible(),
  },
  {
    title: 'pixel art: paint a cell',
    path: '/pixel-art',
    content: 'Pixel Art Workshop',
    action: async (page) => page.getByTestId('pixel-cell').first().click(),
    verify: async (page) => expect(page.getByTestId('pixel-cell').first()).toHaveCSS('background-color', 'rgb(15, 23, 42)'),
  },
  {
    title: 'pixel art matrix: add a row',
    path: '/pixel-art-matrix',
    content: 'Pixel Art Workshop (Matrix)',
    action: async (page) => page.getByRole('button', { name: 'Add row' }).click(),
    verify: async (page) => expect(page.getByTestId('matrix-row')).toHaveCount(17),
  },
  {
    title: 'exceptions: refresh the successful user result',
    path: '/exceptions',
    content: 'Query user with business exceptions',
    action: async (page) => page.getByRole('button', { name: 'Success' }).click(),
    verify: async (page) => expect(page.locator('main')).toContainText('user-1'),
  },
  {
    title: 'exception query params: navigate with a valid query value',
    path: '/exception-query-params',
    content: 'QueryParams decode exception',
    action: async (page) => page.getByRole('button', { name: 'Navigate success' }).click(),
    verify: async (page) => {
      await expect(page).toHaveURL(/mode=success/);
      await expect(page.locator('main')).toContainText('Parsed value: success');
    },
  },
  {
    title: 'craft lazy layout parent: render inherited layout data',
    path: '/craft/lazy-layout/100',
    content: 'Layout component',
    verify: async (page) => expect(page.locator('main')).toContainText('Parent route input: 100'),
  },
  {
    title: 'craft lazy layout child: render the selected user',
    path: '/craft/lazy-layout/100/users/42',
    content: 'Input binding inside a lazy feature',
    setup: async (page) => {
      await page.route('**/users', (route) =>
        route.fulfill({
          json: [{ id: '42', email: 'ada@example.test' }],
        }),
      );
    },
    verify: async (page) => expect(page.locator('main')).toBeVisible(),
  },
  {
    title: 'state machine list: start a task and update its step',
    path: '/state-machine-list',
    content: 'State machine — one per row',
    action: async (page) => page.getByRole('button', { name: 'Start' }).first().click(),
    verify: async (page) => expect(page.getByTestId('task-step').first()).toHaveText('doing'),
  },
  {
    title: 'replay methods: apply an item action',
    path: '/replay-methods',
    content: 'Replay des méthodes exposées',
    action: async (page) => page.getByTestId('record-cell-action-0').click(),
    verify: async (page) => expect(page.getByTestId('cell-0')).toContainText('1 action'),
  },
  {
    title: 'temporal stream replay: emit an independent heartbeat',
    path: '/temporal-stream-replay',
    content: 'Replay · streams et délais',
    action: async (page) => page.getByTestId('alice-heartbeat').click(),
    verify: async (page) => expect(page.getByTestId('alice-value')).toHaveText('heartbeat'),
  },
  {
    title: 'profile state machine: enter edit mode and submit a changed field',
    path: '/state-machine',
    content: 'State machine — profile editor',
    action: async (page) => {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Name').fill('Ada Lovelace Updated');
      await page.getByLabel('Email').fill('ada.updated@example.test');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
    },
    verify: async (page) => expect(page.getByText('Ada Lovelace Updated')).toBeVisible(),
  },
  {
    title: 'text editor state machine: edit and commit text',
    path: '/state-machine-text',
    content: 'State machine — declarative text editor',
    action: async (page) => {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const field = page.locator('input').first();
      await field.fill('Committed text');
      await page.getByRole('button', { name: 'Commit', exact: true }).click();
    },
    verify: async (page) =>
      expect(page.getByText('Current value: Committed text')).toBeVisible(),
  },
  {
    title: 'login form: validate and submit both fields',
    path: '/login-form',
    content: 'Login form',
    action: async (page) => {
      await page.getByLabel(/email/i).fill('ada@example.com');
      await page.getByLabel(/password/i).fill('secret1');
      await page.getByRole('button', { name: 'Sign in' }).click();
    },
    verify: async (page) => expect(page.getByText('Login form submitted.')).toBeVisible(),
  },
  {
    title: 'craft service counter: increment and keep the updated value',
    path: '/craft-service/counter',
    content: 'craftService Counter',
    action: async (page) => page.getByRole('button', { name: '+' }).click(),
    verify: async (page) => expect(page.locator('main')).toContainText('1'),
  },
  {
    title: 'craftRegisterFor: add a child counter',
    path: '/craft-service/register-for',
    content: 'craftRegisterFor: control child counters',
    action: async (page) => {
      await page.getByRole('button', { name: 'Add a child' }).click();
    },
    verify: async (page) => expect(page.getByRole('button', { name: 'Increment' })).toHaveCount(5),
  },
  {
    title: 'craft service user detail: select another user and update the card',
    path: '/craft-service/user-detail',
    content: 'craftService User Detail (query)',
    action: async (page) => {
      await page.getByRole('combobox', { name: 'User' }).selectOption('2');
    },
    verify: async (page) => expect(page.getByTestId('user-card')).toContainText('Julien'),
  },
  {
    title: 'send context page: render its main user action',
    path: '/demo-send-context',
    content: 'Demo send context',
    action: async (page) => page.getByRole('button', { name: 'Increment' }).first().click(),
    verify: async (page) => {
      await expect(page.locator('main').getByText('Value: 2').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Increment' })).toHaveCount(13);
    },
  },
  {
    title: 'playground: add a todo and render it in the list',
    path: '/playground',
    content: 'Playground',
    action: async (page) => {
      await page.getByPlaceholder('New todo title…').fill('Playground item');
      await page.getByRole('button', { name: /add/i }).click();
    },
    verify: async (page) => expect(page.getByText('Playground item', { exact: true })).toBeVisible(),
  },
  {
    title: 'interaction replay: toggle expanded content',
    path: '/interaction-replay',
    content: 'Interaction state replay',
    action: async (page) => page.getByTestId('expanded-toggle').click(),
    verify: async (page) => expect(page.locator('[aria-expanded="true"]')).toBeVisible(),
  },
  {
    title: 'query params: update URL-backed pagination state',
    path: '/query-params',
    content: 'Route QueryParams pagination',
    action: async (page) => page.getByRole('button', { name: 'Next' }).click(),
    verify: async (page) => {
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByTestId('current-page')).toHaveText('2');
    },
  },
  {
    title: 'guard demo: redirect to login without activating protected content',
    path: '/guard-demo',
    content: 'Login form',
    redirectedTo: /\/login-form$/,
    verify: async (page) =>
      expect(page.getByText('Should not be displayed', { exact: true })).toHaveCount(0),
  },
];

test.describe('Demo route functional coverage', () => {
  for (const scenario of scenarios) {
    test(scenario.title, async ({ page }) => {
      test.setTimeout(20_000);
      const traces = captureTemplateTrace(page);
      if (scenario.setup) await scenario.setup(page);

      await page.goto(scenario.path);
      if (scenario.redirectedTo) {
        await expect(page).toHaveURL(scenario.redirectedTo);
      }
      await expect(page.getByText(scenario.content, { exact: false }).first()).toBeVisible({
        timeout: 8_000,
      });

      if (scenario.action) {
        const traceStart = traces.length;
        await scenario.action(page);
        if (scenario.verify) await scenario.verify(page);
        if (process.env['E2E_PRODUCTION'] !== 'true' && scenario.traceUpdate !== false) {
          const update: TemplateTraceEvent = await expectTemplateUpdate(traces, traceStart);
          expect(update.phase).toBe('update');
          expect(update.renderCount).toBeGreaterThan(1);
        }
      } else if (scenario.verify) {
        await scenario.verify(page);
      }
    });
  }
});
