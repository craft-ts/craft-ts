import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  defineVisualAppConfig,
  defineVisualHttpMocks,
  visualAppCaptureTargets,
  type VisualAppScenario,
} from '../src/lib/visual-app.js';
import { captureVisualApp } from '../src/lib/visual-app/playwright.js';

const html = `<!doctype html><html><head><style>body{margin:0;font:18px sans-serif}main{min-height:1800px}dialog{width:min(80vw,600px)}.scroll{height:220px;overflow:auto}.content{height:900px}footer{background:lime}</style></head><body>
<main><h1 data-craft-name="Title">Orders</h1><div data-craft-name="List">Loading</div><button data-craft-name="Details">Details</button><button data-craft-name="Unexpected">Unexpected</button></main><footer data-craft-name="Bottom">Bottom of long page</footer>
<dialog data-craft-name="Dialog"><div data-craft-name="DialogScroll" class="scroll"><div class="content">Long modal details</div><button data-craft-name="Confirm">Confirm</button></div></dialog>
<script>fetch('/api/orders').then(r=>r.json()).then(v=>{document.querySelector('[data-craft-name=List]').textContent=v.length ? 'Order 42' : 'No orders';});
document.querySelector('[data-craft-name=Details]').onclick=async()=>{await fetch('/api/details');document.querySelector('dialog').showModal()};
document.querySelector('[data-craft-name=Unexpected]').onclick=()=>fetch('/api/unexpected');</script></body></html>`;
const fixtureScenario = (): VisualAppScenario => ({
  id: 'list',
  label: 'Orders and details',
  category: 'happy-path',
  mocks: defineVisualHttpMocks('orders.mocks.ts', [
    {
      method: 'GET',
      url: '/api/orders',
      mode: 'mock',
      response: { kind: 'success', body: [{ id: 42 }] },
    },
    {
      method: 'GET',
      url: '/api/details',
      mode: 'mock',
      response: { kind: 'success', body: 'Detail' },
    },
  ]),
  modals: [
    {
      id: 'details',
      component: 'component:orders.ts:Orders',
      target: { name: 'Dialog' },
    },
  ],
  steps: [
    {
      action: 'capture',
      id: 'list',
      expect: [{ kind: 'text', target: { name: 'List' }, text: 'Order 42' }],
    },
    { action: 'click', target: { name: 'Details' } },
    {
      action: 'capture',
      id: 'dialog',
      modal: 'details',
      expect: [{ kind: 'visible', target: { name: 'Dialog' } }],
    },
    { action: 'scroll', target: { name: 'DialogScroll' }, y: 1000 },
    {
      action: 'capture',
      id: 'actions',
      modal: 'details',
      expect: [
        { kind: 'visible', target: { name: 'Dialog' } },
        { kind: 'visible', target: { name: 'Confirm' } },
      ],
    },
  ],
});
test('captures full pages and modal stages on all formats; preserves the last report on failure', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(join(tmpdir(), 'craft-app-e2e-'));
  let externalCalls = 0;
  const server = createServer((req, res) => {
    if (req.url !== '/') {
      externalCalls++;
      res.writeHead(500);
      res.end('Unexpected real call');
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const baseURL = `http://127.0.0.1:${port}`;
  await writeFile(join(directory, 'orders.ts'), 'export const Orders = {};');
  await writeFile(
    join(directory, 'orders.mocks.ts'),
    'export const responses = [];',
  );
  const reportPath = join(directory, 'report.json');
  const pages = [
    {
      id: 'orders',
      route: '/',
      url: '/',
      component: 'component:orders.ts:Orders',
      scenarios: [fixtureScenario()],
    },
  ];
  try {
    const config = defineVisualAppConfig({ pages });
    const report = await captureVisualApp({
      browser,
      config,
      baseURL,
      rootDir: directory,
      reportPath,
    });
    expect(report.captures).toHaveLength(12);
    expect(
      report.captures.map((c) => `visual:${c.component}#${c.scenario}`).sort(),
    ).toEqual(
      visualAppCaptureTargets(config)
        .map((t) => t.subject)
        .sort(),
    );
    const image = PNG.sync.read(
      await readFile(join(directory, report.captures[0]!.image!)),
    );
    expect(image.height).toBeGreaterThan(1800);
    expect(image.data[image.width * (image.height - 1) * 4 + 1]).toBe(255);
    expect(externalCalls).toBe(0);
    const custom = defineVisualAppConfig({
      pages,
      viewports: {
        small: { width: 400, height: 800 },
        large: { width: 1000, height: 900 },
      },
    });
    const customReport = await captureVisualApp({
      browser,
      config: custom,
      baseURL,
      rootDir: directory,
      reportPath,
    });
    expect(customReport.captures).toHaveLength(6);
    expect(
      new Set(customReport.captures.map((c) => c.application?.viewport)),
    ).toEqual(new Set(['small', 'large']));
    const before = await readFile(reportPath, 'utf8');
    const broken = defineVisualAppConfig({
      ...custom,
      pages: [
        {
          ...pages[0]!,
          scenarios: [
            {
              ...fixtureScenario(),
              steps: [
                { action: 'click', target: { name: 'Unexpected' } },
                ...fixtureScenario().steps,
              ],
            },
          ],
        },
      ],
    });
    await expect(
      captureVisualApp({
        browser,
        config: broken,
        baseURL,
        rootDir: directory,
        reportPath,
      }),
    ).rejects.toThrow(/Unexpected request/);
    expect(await readFile(reportPath, 'utf8')).toBe(before);
    expect(
      JSON.parse(await readFile(`${reportPath}.failure.json`, 'utf8')).failures,
    ).toHaveLength(6);
    expect(externalCalls).toBe(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('executes binary responses and ordered mutations, rejects unused and ambiguous endpoints', async ({
  browser,
}) => {
  const { installVisualHttpMocks } = await import(
    '../src/lib/visual-app/playwright.js'
  );
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const mocks = defineVisualHttpMocks('network.mocks.ts', [
      {
        method: 'GET',
        url: '/binary',
        mode: 'mock',
        response: {
          kind: 'success',
          body: new Uint8Array([0, 255, 42]),
          status: 206,
          contentType: 'application/octet-stream',
        },
      },
      {
        method: 'POST',
        url: '/mutation',
        mode: 'mock',
        sequence: [
          { kind: 'success', body: { version: 1 } },
          { kind: 'success', body: { version: 2 } },
        ],
      },
      {
        method: 'GET',
        url: '/unused',
        mode: 'unused',
        reason: 'No access in this scenario',
      },
      {
        method: 'GET',
        url: '/ambiguous',
        mode: 'mock',
        response: { kind: 'success', body: 1 },
      },
      {
        method: 'GET',
        url: '/ambiguous',
        mode: 'mock',
        response: { kind: 'success', body: 2 },
      },
    ]);
    const adapter = await installVisualHttpMocks(
      context,
      mocks,
      'http://fixture.test',
    );
    const page = await context.newPage();
    const binary = await page.evaluate(async () => [
      ...new Uint8Array(
        await (await fetch('http://fixture.test/binary')).arrayBuffer(),
      ),
    ]);
    expect(binary).toEqual([0, 255, 42]);
    const mutations = await page.evaluate(async () => {
      const values = [];
      for (let i = 0; i < 2; i++)
        values.push(
          await (
            await fetch('http://fixture.test/mutation', { method: 'POST' })
          ).json(),
        );
      return values;
    });
    expect(mutations).toEqual([{ version: 1 }, { version: 2 }]);
    await adapter.verify();
    await page.evaluate(async () => {
      for (const path of ['unused', 'ambiguous', 'mutation'])
        await fetch(`http://fixture.test/${path}`, {
          method: path === 'mutation' ? 'POST' : 'GET',
        }).catch(() => undefined);
    });
    await expect(adapter.verify()).rejects.toThrow(/unused/);
    expect(
      adapter.log.some((entry) => entry.error?.includes('Ambiguous')),
    ).toBe(true);
    expect(
      adapter.log.some((entry) => entry.error?.includes('exhausted')),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test('requires an observed business exception before capturing its UI', async ({
  browser,
}) => {
  const root = await mkdtemp(join(tmpdir(), 'visual-exception-'));
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<div data-craft-name="Result">Loading</div><script>
      fetch('/api/order').then(async response => {
        const body = await response.json();
        document.querySelector('[data-craft-name=Result]').textContent = body.message;
        if (!response.ok) dispatchEvent(new CustomEvent('craft:visual-exception', { detail: { endpoint: 'GET /api/order', discriminant: body.code } }));
      });</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await writeFile(join(root, 'page.ts'), 'export const Page = {};');
  await writeFile(join(root, 'page.mocks.ts'), 'export const fixtures = [];');
  const expectation = [
    {
      kind: 'text' as const,
      target: { name: 'Result' },
      text: 'Order conflict',
    },
  ];
  const happy: VisualAppScenario = {
    id: 'happy',
    label: 'Happy',
    category: 'happy-path',
    mocks: defineVisualHttpMocks('page.mocks.ts', [
      {
        method: 'GET',
        url: '/api/order',
        mode: 'mock',
        response: { kind: 'success', body: { message: 'Ready' } },
      },
    ]),
    steps: [
      {
        action: 'capture',
        id: 'page',
        expect: [{ kind: 'text', target: { name: 'Result' }, text: 'Ready' }],
      },
    ],
  };
  const exception: VisualAppScenario = {
    id: 'conflict',
    label: 'Conflict',
    category: 'exception',
    exception: {
      endpoint: 'GET /api/order',
      discriminant: 'Conflict',
      expect: expectation,
    },
    mocks: defineVisualHttpMocks('page.mocks.ts', [
      {
        method: 'GET',
        url: '/api/order',
        mode: 'mock',
        response: {
          kind: 'exception',
          exception: 'Conflict',
          status: 409,
          body: { code: 'Conflict', message: 'Order conflict' },
        },
      },
    ]),
    steps: [{ action: 'capture', id: 'error', expect: expectation }],
  };
  const config = defineVisualAppConfig({
    viewports: { small: { width: 400, height: 700 } },
    pages: [
      {
        id: 'page',
        route: '/',
        url: '/',
        component: 'component:page.ts:Page',
        scenarios: [happy, exception],
      },
    ],
  });
  try {
    const report = await captureVisualApp({
      browser,
      config,
      baseURL,
      rootDir: root,
      reportPath: join(root, 'report.json'),
    });
    expect(report.captures).toHaveLength(2);
    expect(report.captures[1]?.application?.execution.status).toBe('passed');
    const wrong = defineVisualAppConfig({
      ...config,
      pages: [
        {
          ...config.pages[0]!,
          scenarios: [
            happy,
            {
              ...exception,
              exception: {
                ...exception.exception!,
                discriminant: 'Unobserved',
              },
            },
          ],
        },
      ],
    });
    await expect(
      captureVisualApp({
        browser,
        config: wrong,
        baseURL,
        rootDir: root,
        reportPath: join(root, 'report.json'),
      }),
    ).rejects.toThrow(/Application capture failed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
