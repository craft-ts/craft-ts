/** Playwright adapter. Never re-export from the browser entry point. */
import { mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Locator,
} from '@playwright/test';
import { PNG } from 'pngjs';
import { collectCapture } from '../digest.js';
import { determinismScript } from '../determinism.js';
import { snapshotPage } from '../snapshot.js';
import {
  visualAppCaptureTargets,
  matchesVisualHttpRequest,
  defineVisualAppConfig,
  type VisualAppConfig,
  type VisualAppControl,
  type VisualAppExpectation,
  type VisualHttpMocks,
  type HappyPathHttpMocks,
} from '../visual-app.js';
import {
  visualAppProvenance,
  hashBytes,
  canonicalCaptureValue,
} from './server.js';
import type { VisualReportCapture, VisualReport } from '../attest.js';

export type VisualMockLog = {
  readonly method: string;
  readonly url: string;
  readonly endpoint?: string;
  readonly responseIndex?: number;
  readonly exception?: string;
  readonly error?: string;
};
export async function installVisualHttpMocks(
  context: BrowserContext,
  mocks: VisualHttpMocks | HappyPathHttpMocks,
  baseURL: string,
) {
  const log: VisualMockLog[] = [];
  const used = new Map<number, number>();
  const pending = new Set<Promise<void>>();
  let resourceSlots = 8;
  const resourceWaiters: (() => void)[] = [];
  const acquireResource = async () => {
    if (resourceSlots > 0) {
      resourceSlots--;
      return;
    }
    await new Promise<void>((resolve) => resourceWaiters.push(resolve));
  };
  const releaseResource = () => {
    const next = resourceWaiters.shift();
    if (next) next();
    else resourceSlots++;
  };
  const exceptions: { endpoint: string; discriminant: string }[] = [];
  await context.exposeBinding(
    '__craftVisualUnsupported',
    (_source, mechanism: string) => {
      log.push({
        method: mechanism,
        url: '',
        error: `Unsupported external mechanism: ${mechanism}`,
      });
    },
  );
  await context.exposeBinding(
    '__craftVisualException',
    (_source, detail: { endpoint: string; discriminant: string }) => {
      exceptions.push(detail);
    },
  );
  await context.addInitScript(() => {
    const bridge = globalThis as unknown as {
      __craftVisualUnsupported: (s: string) => void;
      __craftVisualException: (d: unknown) => void;
    };
    for (const name of [
      'WebSocket',
      'EventSource',
      'RTCPeerConnection',
      'Worker',
      'SharedWorker',
    ] as const) {
      Object.defineProperty(globalThis, name, {
        configurable: false,
        value: class {
          constructor() {
            bridge.__craftVisualUnsupported(name);
            throw new Error(`Unsupported capture mechanism: ${name}`);
          }
        },
      });
    }
    navigator.sendBeacon = () => {
      bridge.__craftVisualUnsupported('sendBeacon');
      return false;
    };
    addEventListener('craft:visual-exception', (event) =>
      bridge.__craftVisualException((event as CustomEvent).detail),
    );
  });
  await context.route('**/*', async (route) => {
    const operation = (async () => {
      const request = route.request();
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      const req = {
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        body,
      };
      const matches = mocks.endpoints
        .map((endpoint, index) => ({ endpoint, index }))
        .filter(({ endpoint }) => matchesVisualHttpRequest(endpoint, req));
      const fail = async (error: string) => {
        log.push({ ...req, error });
        await route.abort('blockedbyclient');
      };
      if (matches.length > 1)
        return fail(
          `Ambiguous mocks: ${req.method} ${req.url}; use one ordered sequence.`,
        );
      const matched = matches[0];
      if (!matched) {
        const url = new URL(req.url);
        const local = url.origin === new URL(baseURL).origin;
        if (
          local &&
          req.method === 'GET' &&
          [
            'document',
            'stylesheet',
            'script',
            'image',
            'font',
            'media',
            'manifest',
          ].includes(request.resourceType())
        ) {
          await acquireResource();
          try {
            const response = await route.fetch({
              maxRedirects: 0,
              maxRetries: 2,
            });
            if (response.status() >= 300 && response.status() < 400)
              return fail(
                `Resource redirect requires an explicit fixture: ${req.url}`,
              );
            return await route.fulfill({ response });
          } finally {
            releaseResource();
          }
        }
        return fail(`Unexpected request: ${req.method} ${req.url}`);
      }
      const { endpoint, index } = matched;
      if (endpoint.mode === 'unused')
        return fail(
          `Endpoint declared unused was called: ${req.method} ${req.url}`,
        );
      const responseIndex = used.get(index) ?? 0;
      const response =
        'sequence' in endpoint && endpoint.sequence
          ? endpoint.sequence[responseIndex]
          : endpoint.response;
      if (!response)
        return fail(`Mock sequence exhausted: ${req.method} ${req.url}`);
      used.set(index, responseIndex + 1);
      const bytes =
        response.body instanceof ArrayBuffer
          ? Buffer.from(response.body)
          : response.body instanceof Uint8Array
            ? Buffer.from(response.body)
            : undefined;
      const textual = typeof response.body === 'string';
      log.push({
        method: req.method,
        url: req.url,
        endpoint:
          endpoint.endpoint ??
          `${endpoint.method.toUpperCase()} ${endpoint.url}`,
        responseIndex,
        ...('exception' in response && response.exception
          ? { exception: response.exception }
          : {}),
      });
      await route.fulfill({
        status: response.status ?? 200,
        headers: Object.fromEntries(
          Object.entries(response.headers ?? {}).filter(
            (e): e is [string, string] => e[1] !== undefined,
          ),
        ),
        contentType:
          ('contentType' in response ? response.contentType : undefined) ??
          (bytes
            ? 'application/octet-stream'
            : textual
              ? 'text/plain'
              : 'application/json'),
        body:
          bytes ??
          (textual ? (response.body as string) : JSON.stringify(response.body)),
      });
    })();
    pending.add(operation);
    try {
      await operation;
    } catch (error) {
      log.push({
        method: route.request().method(),
        url: route.request().url(),
        error: error instanceof Error ? error.message : String(error),
      });
      await route.abort().catch(() => undefined);
    } finally {
      pending.delete(operation);
    }
  });
  return {
    log,
    exceptions,
    async verify() {
      await Promise.allSettled(pending);
      const errors = log.flatMap((entry) => (entry.error ? [entry.error] : []));
      if (errors.length) throw new Error(errors.join('\n'));
    },
  };
}

function control(page: Page, target: VisualAppControl): Locator {
  const selector = (name: string) =>
    `[data-craft-name=${JSON.stringify(name)}]`;
  let context: Page | Locator = page;
  if (target.context) {
    let locator = page.locator(selector(target.context.name));
    if (target.context.text !== undefined)
      locator = locator.filter({ hasText: target.context.text });
    context = locator;
  }
  let locator = context.locator(selector(target.name));
  if (target.text !== undefined)
    locator = locator.filter({ hasText: target.text });
  return locator;
}
async function expectations(
  page: Page,
  values: readonly VisualAppExpectation[],
  baseURL: string,
) {
  for (const value of values) {
    if (value.kind === 'url') {
      await expect(page).toHaveURL(new URL(value.url, baseURL).href);
      continue;
    }
    const locator = control(page, value.target);
    if (value.kind === 'count') await expect(locator).toHaveCount(value.count);
    else if (value.kind === 'hidden') await expect(locator).toBeHidden();
    else {
      await expect(locator).toHaveCount(1);
      if (value.kind === 'text') await expect(locator).toHaveText(value.text);
      else await expect(locator).toBeVisible();
    }
  }
}
async function stableScreenshot(page: Page, timeout: number): Promise<Buffer> {
  const deadline = Date.now() + timeout;
  await Promise.race([
    page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter(
            (img) =>
              img.getClientRects().length > 0 && !!img.getAttribute('src'),
          )
          .map(async (img) => {
            await img.decode();
          }),
      );
    }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              'Fonts or images did not become ready; declare bounded scroll preparation for lazy content.',
            ),
          ),
        timeout,
      );
      timer.unref();
    }),
  ]);
  let previous: Buffer | undefined;
  while (Date.now() < deadline) {
    const current = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      timeout: Math.max(1, deadline - Date.now()),
    });
    if (previous?.equals(current)) return current;
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Full-page screenshot did not stabilize within ${timeout}ms.`,
  );
}

export async function captureVisualApp(options: {
  readonly browser: Browser;
  readonly config: VisualAppConfig;
  readonly baseURL: string;
  readonly reportPath: string;
  readonly rootDir: string;
  readonly tsconfigPath?: string;
  readonly additionalCaptures?: readonly VisualReportCapture[];
}): Promise<VisualReport> {
  const config = defineVisualAppConfig(options.config);
  if (options.browser.browserType().name() !== 'chromium')
    throw new Error('Application capture requires Chromium.');
  const reportPath = resolve(options.reportPath);
  const batch = join(dirname(reportPath), `app-${randomUUID()}`);
  await mkdir(batch, { recursive: true });
  const captures: VisualReportCapture[] = [];
  const failures: { subject: string; message: string }[] = [];
  const targets = visualAppCaptureTargets(config);
  const groups = new Map<string, (typeof targets)[number][]>();
  for (const target of targets) {
    const key = JSON.stringify([
      target.page.id,
      target.scenario.id,
      target.viewportName,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    let context: BrowserContext | undefined;
    try {
      context = await options.browser.newContext({
        viewport: first.viewport,
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await context.addInitScript(determinismScript());
      const http = await installVisualHttpMocks(
        context,
        first.scenario.mocks,
        options.baseURL,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(config.stabilityTimeoutMs ?? 10_000);
      const provenance = await visualAppProvenance(
        config,
        first,
        options.rootDir,
        options.tsconfigPath,
      );
      await page.goto(new URL(first.page.url, options.baseURL).href, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      for (const step of first.scenario.steps) {
        switch (step.action) {
          case 'navigate': {
            const url = new URL(step.url, options.baseURL);
            if (url.origin !== new URL(options.baseURL).origin)
              throw new Error('Scenario navigation must remain local.');
            await page.goto(url.href);
            break;
          }
          case 'click':
            await control(page, step.target).click();
            break;
          case 'fill':
            await control(page, step.target).fill(step.value);
            break;
          case 'select':
            await control(page, step.target).selectOption(step.value);
            break;
          case 'press':
            await control(page, step.target).press(step.key);
            break;
          case 'scroll':
            if (step.target) {
              const locator = control(page, step.target);
              await expect(locator).toHaveCount(1);
              await locator.evaluate(
                (el, p) => el.scrollTo(p.x ?? 0, p.y),
                step,
              );
            } else
              await page.evaluate((p) => window.scrollTo(p.x ?? 0, p.y), step);
            break;
          case 'wait':
            await expectations(page, step.expect, options.baseURL);
            break;
          case 'capture': {
            await expectations(page, step.expect, options.baseURL);
            const exception = first.scenario.exception;
            if (
              exception &&
              step.id === (exception.capture ?? group.at(-1)?.capture.id)
            ) {
              await expect
                .poll(() =>
                  http.exceptions.some(
                    (e) =>
                      e.endpoint === exception.endpoint &&
                      e.discriminant === exception.discriminant,
                  ),
                )
                .toBe(true);
              if (
                !http.log.some(
                  (e) =>
                    e.endpoint === exception.endpoint &&
                    e.exception === exception.discriminant,
                )
              )
                throw new Error(
                  `Exception mock was not consumed: ${exception.discriminant}`,
                );
              await expectations(page, exception.expect, options.baseURL);
            }
            if (step.modal) {
              const modal = first.scenario.modals?.find(
                (m) => m.id === step.modal,
              );
              if (!modal) throw new Error(`Unknown modal '${step.modal}'.`);
              await expect(control(page, modal.target)).toBeVisible();
            }
            await page.mouse.move(0, 0);
            const image = await stableScreenshot(
              page,
              config.stabilityTimeoutMs ?? 10_000,
            );
            await http.verify();
            const target = group.find((t) => t.capture.id === step.id)!;
            const currentProvenance = await visualAppProvenance(
              config,
              target,
              options.rootDir,
              options.tsconfigPath,
            );
            if (
              canonicalCaptureValue(currentProvenance.sources) !==
              canonicalCaptureValue(provenance.sources)
            )
              throw new Error('Sources changed during capture.');
            const imagePath = join(batch, `${hashBytes(target.subject)}.png`);
            await writeFile(imagePath, image);
            const { digest } = await collectCapture(page, { root: 'body' });
            const snapshot = await snapshotPage(page, { root: 'body' });
            const snapshotPath = imagePath.replace(/\.png$/, '.snapshot.html');
            await writeFile(snapshotPath, snapshot.html);
            const dimensions = PNG.sync.read(image);
            captures.push({
              component: target.page.component,
              scenario: target.id,
              digest,
              image: relative(dirname(reportPath), imagePath),
              snapshot: relative(dirname(reportPath), snapshotPath),
              evidenceMode: 'screenshot',
              application: {
                page: first.page.id,
                scenario: first.scenario.id,
                label: first.scenario.label,
                category: first.scenario.category,
                capture: step.id,
                viewport: first.viewportName,
                provenance: currentProvenance,
                imageHash: hashBytes(image),
                execution: { status: 'passed', mocks: [...http.log] },
                comparison: config.comparison!,
                environment: `${config.environment}|${options.browser.version()}|${process.platform}|${process.arch}`,
              },
              metadata: {
                viewport: first.viewport,
                screenshot: {
                  width: dimensions.width,
                  height: dimensions.height,
                },
                browser: {
                  name: 'chromium',
                  version: options.browser.version(),
                },
                target: 'body',
                colorScheme: 'light',
              },
            });
            break;
          }
        }
      }
      if (first.scenario.exception) {
        const expected = first.scenario.exception;
        await expect
          .poll(() =>
            http.exceptions.some(
              (e) =>
                e.endpoint === expected.endpoint &&
                e.discriminant === expected.discriminant,
            ),
          )
          .toBe(true);
        if (
          !http.log.some(
            (e) =>
              e.endpoint === expected.endpoint &&
              e.exception === expected.discriminant,
          )
        )
          throw new Error(
            `Exception mock was not consumed: ${expected.discriminant}`,
          );
        await expectations(page, expected.expect, options.baseURL);
      }
      await http.verify();
    } catch (error) {
      for (const target of group)
        failures.push({
          subject: target.subject,
          message: error instanceof Error ? error.message : String(error),
        });
    } finally {
      await context?.close().catch(() => undefined);
    }
  }
  if (failures.length) {
    await writeFile(
      `${reportPath}.failure.json`,
      JSON.stringify({ failures, batch }, null, 2),
    );
    throw new Error(
      `Application capture failed; previous report preserved.\n${failures.map((f) => `${f.subject}: ${f.message}`).join('\n')}`,
    );
  }
  const subjects = new Set<string>();
  for (const capture of [...(options.additionalCaptures ?? []), ...captures]) {
    const subject = `visual:${capture.component}#${capture.scenario}`;
    if (subjects.has(subject)) {
      await writeFile(
        `${reportPath}.failure.json`,
        JSON.stringify({
          failures: [{ subject, message: 'Duplicate capture subject' }],
          batch,
        }),
      );
      throw new Error(
        `Duplicate capture subject '${subject}'; previous report preserved.`,
      );
    }
    subjects.add(subject);
  }
  const report: VisualReport = {
    format: 'craft-ts-visual-report',
    version: 2,
    captures: [...(options.additionalCaptures ?? []), ...captures],
  };
  const temporary = join(batch, 'report.json');
  await writeFile(temporary, JSON.stringify(report, null, 2));
  await rename(temporary, reportPath);
  await unlink(`${reportPath}.failure.json`).catch(() => undefined);
  return report;
}
