import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function runFinePlanFanout(browser, variants, report, output) {
  report.fanout = { samples: [], counters: [], crossTargets: [] };
  const savedTargets = new Map();
  const runs = Number(process.env.CRAFT_FINE_FANOUT_RUNS ?? 3);
  for (const count of JSON.parse(process.env.CRAFT_FINE_FANOUT_FIELDS ?? '[32,128]'))
    for (let run = 0; run <= runs; run++) {
      const counters = run === runs;
      for (const variant of run % 2 ? [...variants].reverse() : variants) {
        if (variant.name === 'fine-grouped' && process.env.CRAFT_BINDING_MANAGER !== 'true' && process.env.CRAFT_CREATION_PLAN !== 'true') continue;
        const strategy =
          variant.name === 'shape-lean'
            ? 'component'
            : variant.name === 'fine-reference'
              ? 'binding'
              : 'plan';
        const context = await browser.newContext();
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(
            `${variant.url}/craft-component-fanout/?fields=${count}&strategy=${strategy}&counts=${counters}`,
          );
          await page.waitForFunction(() =>
            Number.isFinite(window.__componentFanout?.bootstrapMs),
          );
          const mountMs = await page.evaluate(
            () => window.__componentFanout.bootstrapMs,
          );
          const targets = await page.evaluate(() =>
            window.__componentFanout.targets(),
          );
          assert.equal(targets.length, count);
          if (savedTargets.has(count)) {
            assert.deepEqual(targets, savedTargets.get(count));
            const resolved = await page.evaluate(
              (t) => window.__componentFanout.resolve(t),
              savedTargets.get(count),
            );
            assert.deepEqual(
              resolved,
              Array.from({ length: count }, (_, i) => ({
                status: 'resolved',
                field: String(i),
              })),
            );
            report.fanout.crossTargets.push({
              variant: variant.name,
              fields: count,
              run,
              resolved: count,
            });
          } else savedTargets.set(count, targets);
          const result = await page.evaluate(
            async ({ count, counters }) => {
              const probe = window.__componentFanout,
                fields = [...document.querySelectorAll('[data-field]')],
                texts = fields.map((n) => n.firstChild),
                expected = Array(count).fill(0);
              const frame = () =>
                new Promise((r) =>
                  requestAnimationFrame(() => requestAnimationFrame(r)),
                );
              const actions = [],
                reads = [];
              const check = () => {
                const nodes = [...document.querySelectorAll('[data-field]')];
                if (nodes.length !== count) throw new Error('Wrong fields');
                nodes.forEach((n, i) => {
                  if (
                    n !== fields[i] ||
                    n.firstChild !== texts[i] ||
                    n.textContent !== String(expected[i])
                  )
                    throw new Error('Wrong value or lost DOM identity');
                });
              };
              check();
              await frame();
              for (const [action, index] of [
                ['update-one', 0],
                ['update-tenth', count - 1],
              ])
                for (let i = 0; i < (counters ? 1 : 10); i++) {
                  probe.reset();
                  expected[index]++;
                  const time = await new Promise((resolve, reject) => {
                    const observer = new MutationObserver(() => {
                      const domMs = performance.now() - started;
                      observer.disconnect();
                      clearTimeout(timer);
                      resolve({ domMs, dispatchMs });
                    });
                    observer.observe(document.querySelector('#mount'), {
                      subtree: true,
                      characterData: true,
                      childList: true,
                    });
                    const timer = setTimeout(() => {
                      observer.disconnect();
                      reject(new Error('No update'));
                    }, 3000);
                    const started = performance.now();
                    document.querySelector(`[data-action="${action}"]`).click();
                    const dispatchMs = performance.now() - started;
                  });
                  check();
                  if (counters) reads.push({ index, ...probe.reads() });
                  else if (i >= 2) actions.push({ index, ...time });
                  await frame();
                }
              return {
                actions,
                reads,
                effects: probe.effects().length,
                sources: probe.effects().map((x) => x.source),
              };
            },
            { count, counters },
          );
          assert.deepEqual(errors, []);
          if (strategy === 'plan' && !variant.name.startsWith('plan-'))
            assert.equal(
              result.sources.filter((x) => x.startsWith('effect:fine:field-'))
                .length,
              count,
              'Fine plan not active',
            );
          if(variant.name.startsWith('plan-'))assert.equal(result.sources.filter(x=>x.startsWith('effect:compiled:')).length,count,'Generated field plan not active');
          if (counters)
            for (const r of result.reads) {
              assert.equal(r.renders, strategy === 'component' ? 1 : 0);
              assert.deepEqual(
                r.fields,
                Array.from({ length: count }, (_, i) =>
                  strategy === 'component' || i === r.index ? 1 : 0,
                ),
              );
            }
          const cdp = await context.newCDPSession(page);
          await cdp.send('HeapProfiler.collectGarbage');
          const memory = await cdp.send('Runtime.getHeapUsage');
          await page.evaluate(() => window.__componentFanout.destroy());
          const managerAfterDestroy = await page.evaluate(() => window.__bindingManagerSnapshot?.());
          if (managerAfterDestroy)
            assert.deepEqual(managerAfterDestroy, { live: 0, queued: 0, scheduled: false });
          assert.deepEqual(
            await page.evaluate(() => ({
              fields: document.querySelectorAll('[data-field]').length,
              effects: window.__componentFanout.effects().length,
            })),
            { fields: 0, effects: 0 },
          );
          const sample = {
            variant: variant.name,
            fields: count,
            run,
            mountMs,
            heapMiB: memory.usedSize / 1024 ** 2,
            ...result,
            managerAfterDestroy,
          };
          (counters ? report.fanout.counters : report.fanout.samples).push(
            sample,
          );
          await writeFile(
            join(output, 'fanout.json'),
            JSON.stringify(report.fanout, null, 2) + '\n',
          );
          console.log(
            `Fine fanout ${variant.name} fields=${count} ${counters ? 'counts' : run + 1}: ${result.effects} effects, checks passed`,
          );
        } finally {
          await context.close();
        }
      }
    }
}
