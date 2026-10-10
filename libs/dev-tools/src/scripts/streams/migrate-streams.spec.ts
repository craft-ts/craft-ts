import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ModuleKind,
  ModuleResolutionKind,
  Project,
  ScriptTarget,
} from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import { runStreamsMigration } from './migrate-streams';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-streams-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

async function migrate(files: Record<string, string>, write = true) {
  const root = await fixture({ 'tsconfig.json': '{}', ...files });
  const result = await runStreamsMigration({
    rootDir: root,
    write,
    eslint: false,
    log: () => undefined,
  });
  const read = (name: string) => readFile(join(root, name), 'utf8');
  return { root, result, read };
}

describe('streams migration', () => {
  it('moves operators and creators to @craft-ts/stream', async () => {
    const { read, result } = await migrate({
      'a.ts': `
        import { of } from 'rxjs';
        import { filter, map, take } from 'rxjs/operators';

        export const out = of(1, 2, 3).pipe(
          map((n) => n * 2),
          filter((n) => n > 2),
          take(2),
        );
      `,
    });
    const output = await read('a.ts');

    expect(result.changedFiles).toHaveLength(1);
    expect(output).toContain("from '@craft-ts/stream'");
    expect(output).not.toContain("from 'rxjs");
    expect(output).toMatch(
      /import \{[^}]*\bfilter\b[^}]*\bmap\b[^}]*\bof\b[^}]*\btake\b[^}]*\} from '@craft-ts\/stream'/,
    );
    expect(result.remainingRxjsImports).toBe(0);
  });

  it('turns subjects into core factories and wraps them where a stream is needed', async () => {
    const { read } = await migrate({
      'b.ts': `
        import { BehaviorSubject } from 'rxjs';
        import { map } from 'rxjs/operators';

        export class Counter {
          private readonly count = new BehaviorSubject<number>(0);
          readonly doubled = this.count.pipe(map((n) => n * 2));

          current(): number {
            return this.count.getValue();
          }

          expose() {
            return this.count.asObservable();
          }
        }
      `,
    });
    const output = await read('b.ts');

    expect(output).toContain('behaviorSubject<number>(0)');
    expect(output).not.toContain('new BehaviorSubject');
    expect(output).toContain('fromSubscribable(this.count).pipe(map(');
    expect(output).toContain('this.count.value');
    expect(output).toContain('.asSubscribable()');
    expect(output).toContain("from '@craft-ts/core'");
    expect(output).toMatch(
      /\{[^}]*behaviorSubject[^}]*\} from '@craft-ts\/core'/,
    );
  });

  it('normalises subscribe callbacks to an observer', async () => {
    const { read } = await migrate({
      'c.ts': `
        import { of } from 'rxjs';
        of(1).subscribe((n) => console.log(n));
        of(1).subscribe(
          (n) => console.log(n),
          (e) => console.error(e),
          () => console.log('done'),
        );
      `,
    });
    const output = await read('c.ts');

    expect(output).toContain('subscribe({ next: (n) => console.log(n) })');
    expect(output).toContain('error: (e) => console.error(e)');
    expect(output).toContain("complete: () => console.log('done')");
  });

  it('renames debounceTime/throttleTime and rewrites repeat/shareReplay arguments', async () => {
    const { read } = await migrate({
      'd.ts': `
        import { of } from 'rxjs';
        import { debounceTime, repeat, shareReplay, throttleTime } from 'rxjs/operators';

        export const a = of(1).pipe(debounceTime(300));
        export const b = of(1).pipe(throttleTime(100, { leading: false, trailing: true }));
        export const c = of(1).pipe(repeat(3));
        export const d = of(1).pipe(shareReplay({ bufferSize: 2, refCount: true }));
        export const e = of(1).pipe(shareReplay(1));
      `,
    });
    const output = await read('d.ts');

    expect(output).toContain('debounce(300)');
    expect(output).toContain(
      'throttle(100, { leading: false, trailing: true })',
    );
    expect(output).toContain('repeat({ times: 3 - 1 })');
    expect(output).toContain('shareReplay(2, { resetOnRefCountZero: true })');
    expect(output).toContain('shareReplay(1)');
    expect(output).not.toContain('debounceTime');
  });

  it('migrates array-literal from(), combineLatest and merge with wrapped subjects', async () => {
    const { read } = await migrate({
      'e.ts': `
        import { Subject, combineLatest, from, merge } from 'rxjs';

        const a = new Subject<number>();
        const b = new Subject<string>();
        export const items = from([1, 2, 3]);
        export const both = combineLatest([a, b]);
        export const either = merge(a, b);
      `,
    });
    const output = await read('e.ts');

    expect(output).toContain('of(1, 2, 3)');
    expect(output).toContain(
      'combineLatest([fromSubscribable(a), fromSubscribable(b)])',
    );
    expect(output).toContain('merge(fromSubscribable(a), fromSubscribable(b))');
    expect(output).toContain('subject<number>()');
  });

  it('rewrites Observable/Subscription types', async () => {
    const { read } = await migrate({
      'f.ts': `
        import { Observable, Subscription, of } from 'rxjs';
        import { map } from 'rxjs/operators';

        export const values$: Observable<number> = of(1).pipe(map((n) => n + 1));
        export function listen(source: Observable<number>, sub?: Subscription) {
          return source;
        }
      `,
    });
    const output = await read('f.ts');

    // A stream initializer carries its own type (`Y` included): the annotation
    // would pin `Y = never`, so it is dropped and inference takes over.
    expect(output).toMatch(/export const values\$ = of\(1\)\.pipe\(map/);
    expect(output).not.toContain('values$:');
    expect(output).toContain('source: Subscribable<number>');
    expect(output).toContain('sub?: Unsubscribable');
  });

  it('moves firstValueFrom to @craft-ts/core', async () => {
    const { read } = await migrate({
      'g.ts': `
        import { firstValueFrom } from 'rxjs';
        export const load = (source: { subscribe: unknown }) => firstValueFrom(source as never);
      `,
    });
    const output = await read('g.ts');

    expect(output).toContain("import { firstValueFrom } from '@craft-ts/core'");
    expect(output).not.toContain("from 'rxjs'");
  });

  it('leaves a file untouched and explains when a symbol has no equivalent', async () => {
    const source = `
      import { of } from 'rxjs';
      import { map, someOperatorTheCodemodHasNeverHeardOf } from 'rxjs/operators';
      export const out = of(1).pipe(map((n) => n), someOperatorTheCodemodHasNeverHeardOf());
    `;
    const { read, result } = await migrate({ 'h.ts': source });

    // The boundary of an all-or-nothing migration: a symbol outside every table
    // blocks the file — a half-migrated file would mix two stream libraries.
    expect(await read('h.ts')).toBe(source);
    expect(result.changedFiles).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RXJS_SYMBOL_UNSUPPORTED',
        symbol: 'someOperatorTheCodemodHasNeverHeardOf',
        manual: true,
      }),
    ]);
    expect(result.diagnostics[0].message).toMatch(
      /no @craft-ts\/stream equivalent/,
    );
    expect(result.remainingRxjsImports).toBe(1);
  });

  it('wraps a pipe receiver it cannot classify in from(...), with a review notice', async () => {
    const { read, result } = await migrate({
      'i.ts': `
        import { map } from 'rxjs/operators';
        export const run = (input: { pipe: (...args: unknown[]) => unknown }) =>
          input.pipe(map((n: number) => n));
        export const again = (other: { pipe: (...args: unknown[]) => unknown }) =>
          other.pipe(map((n: number) => n));
      `,
    });
    const output = await read('i.ts');

    expect(output).toContain('from(input).pipe(map(');
    expect(output).toContain('from(other).pipe(map(');
    expect(output).toMatch(
      /import \{[^}]*\bfrom\b[^}]*\} from '@craft-ts\/stream'/,
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ symbol: 'pipe', manual: false }),
    ]);
    expect(result.diagnostics[0].message).toMatch(/from\(\.\.\.\)/);
  });

  it('wraps an unrecognised stream argument of a combination operator too', async () => {
    const { read } = await migrate({
      'i2.ts': `
        import { merge, of } from 'rxjs';
        export const both = (other: { subscribe: unknown }) => merge(of(1), other as never);
      `,
    });

    expect(await read('i2.ts')).toContain('merge(of(1), from(other as never))');
  });

  it('expands aliased imports, renaming every reference', async () => {
    const { read, result } = await migrate({
      'j.ts': `
        import { of as rxOf } from 'rxjs';
        import { map as rxMap, filter as rxFilter } from 'rxjs/operators';
        export const x = rxOf(1, 2).pipe(rxMap((n) => n + 1), rxFilter((n) => n > 1));
        export const op = rxMap;
      `,
    });
    const output = await read('j.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain(
      'of(1, 2).pipe(map((n) => n + 1), filter((n) => n > 1))',
    );
    expect(output).toContain('export const op = map;');
    expect(output).not.toMatch(/rx(Of|Map|Filter)/);
  });

  it('expands namespace imports, including rx.operators.* and qualified types', async () => {
    const { read, result } = await migrate({
      'k.ts': `
        import * as rx from 'rxjs';
        import * as ops from 'rxjs/operators';
        export const y: rx.Observable<number> = rx.of(1).pipe(ops.map((n) => n + 1));
        export const z = rx.of(2).pipe(rx.operators.take(1));
      `,
    });
    const output = await read('k.ts');

    expect(result.diagnostics.filter((item) => item.manual)).toEqual([]);
    expect(output).toContain('of(1).pipe(map((n) => n + 1))');
    expect(output).toContain('of(2).pipe(take(1))');
    expect(output).not.toMatch(/\brx\./);
    expect(output).not.toMatch(/\bops\./);
  });

  it('leaves a file untouched when an alias clashes or a namespace is used as a value', async () => {
    const clash = `
      import { map as rxMap } from 'rxjs/operators';
      import { of } from 'rxjs';
      const map = new Map<number, number>();
      export const x = of(1).pipe(rxMap((n) => n));
      export const size = map.size;
    `;
    const asValue = `
      import * as rx from 'rxjs';
      export const everything = rx;
      export const y = rx.of(1);
    `;
    const { read, result } = await migrate({
      'j2.ts': clash,
      'k2.ts': asValue,
    });

    expect(await read('j2.ts')).toBe(clash);
    expect(await read('k2.ts')).toBe(asValue);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'RXJS_IMPORT_FORM_UNSUPPORTED',
      'RXJS_IMPORT_FORM_UNSUPPORTED',
    ]);
    expect(result.diagnostics[0].message).toMatch(/already used/);
    expect(result.diagnostics[1].message).toMatch(/used as a value/);
  });

  it('reports semantic changes as review notices without blocking', async () => {
    const { result } = await migrate({
      'l.ts': `
        import { of } from 'rxjs';
        import { retry, timeout } from 'rxjs/operators';
        export const out = of(1).pipe(timeout(100), retry(2));
      `,
    });

    expect(result.changedFiles).toHaveLength(1);
    expect(result.diagnostics.map((item) => item.symbol).sort()).toEqual([
      'retry',
      'timeout',
    ]);
    expect(result.diagnostics.every((item) => !item.manual)).toBe(true);
  });

  it('does not write in dry-run mode, and is idempotent', async () => {
    const source = `
      import { of } from 'rxjs';
      export const out = of(1);
    `;
    const dry = await migrate({ 'm.ts': source }, false);
    expect(await dry.read('m.ts')).toBe(source);
    expect(dry.result.changedFiles).toHaveLength(1);

    const first = await migrate({ 'm.ts': source });
    const second = await runStreamsMigration({
      rootDir: first.root,
      write: true,
      eslint: false,
      log: () => undefined,
    });
    expect(second.changedFiles).toEqual([]);
  });

  it('migrates interval, timer, fromEvent and the less common operators', async () => {
    const { read, result } = await migrate({
      'o.ts': `
        import { fromEvent, interval, timer } from 'rxjs';
        import { auditTime, expand, take, windowCount } from 'rxjs/operators';

        const button = document.createElement('button');
        export const clicks = fromEvent(button, 'click').pipe(auditTime(100));
        export const ticks = interval(1000).pipe(take(3), windowCount(2));
        export const once = timer(10);
        export const grow = timer(0).pipe(expand((n) => timer(5).pipe(take(1))));
      `,
    });
    const output = await read('o.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain("from '@craft-ts/stream'");
    expect(output).not.toContain("from 'rxjs");
    expect(output).toContain("fromEvent(button, 'click').pipe(auditTime(100))");
    expect(output).toContain('interval(1000).pipe(take(3), windowCount(2))');
    expect(output).toContain('timer(0).pipe(expand(');
  });

  it('migrates catchError to orElse, wrapping an rxjs fallback, with a review notice', async () => {
    const { read, result } = await migrate({
      'q.ts': `
        import { Subject, of } from 'rxjs';
        import { catchError, map } from 'rxjs/operators';

        const fallback = new Subject<number>();
        export const a = of(1).pipe(map((n) => n), catchError(() => of(0)));
        export const b = of(1).pipe(catchError((e) => fallback));
      `,
    });
    const output = await read('q.ts');

    expect(output).toContain('orElse(() => of(0))');
    expect(output).toContain('orElse((e) => fromSubscribable(fallback))');
    expect(output).not.toContain('catchError');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RXJS_SEMANTICS_CHANGED',
        symbol: 'catchError',
        manual: false,
      }),
    ]);
    expect(result.diagnostics[0].message).toMatch(/catchTag/);
  });

  it('refuses a catchError whose handler cannot be turned into a stream expression', async () => {
    const source = `
      import { of } from 'rxjs';
      import { catchError } from 'rxjs/operators';
      export const a = of(1).pipe(catchError((e) => { console.error(e); return of(0); }));
    `;
    const { read, result } = await migrate({ 'r.ts': source });

    expect(await read('r.ts')).toBe(source);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'RXJS_CALL_FORM_UNSUPPORTED',
      symbol: 'catchError',
      manual: true,
    });
  });

  it('migrates bufferWhen with an arrow selector', async () => {
    const { read } = await migrate({
      's.ts': `
        import { interval, of } from 'rxjs';
        import { bufferWhen } from 'rxjs/operators';
        export const a = of(1, 2).pipe(bufferWhen(() => interval(10)));
      `,
    });

    expect(await read('s.ts')).toContain('bufferWhen(() => interval(10))');
  });

  it('migrates throwError, NEVER, defer, concat and the everyday operators', async () => {
    const { read, result } = await migrate({
      't.ts': `
        import { NEVER, Subject, concat, defer, of, throwError } from 'rxjs';
        import { concatWith, defaultIfEmpty, distinct, finalize, first, last, reduce, skipWhile, takeLast } from 'rxjs/operators';

        const later = new Subject<number>();
        export const a = defer(() => of(1, 2)).pipe(first(), defaultIfEmpty(0));
        export const b = concat(of(1), later).pipe(last(), reduce((s, n) => s + n, 0));
        export const c = of(1, 1, 2).pipe(distinct(), skipWhile((n) => n < 2), takeLast(1), finalize(() => undefined));
        export const d = of(1).pipe(concatWith(later));
        export const e = NEVER;
        export const f = throwError(() => new Error('x'));
      `,
    });
    const output = await read('t.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('concat(of(1), fromSubscribable(later))');
    expect(output).toContain('concatWith(fromSubscribable(later))');
    expect(output).toContain('export const e = never();');
    expect(output).toContain("throwError(() => new Error('x'))");
    expect(output).not.toContain("from 'rxjs");
  });

  it('turns rxjs concurrency arguments into options, and refuses selectors', async () => {
    const { read, result } = await migrate({
      'u.ts': `
        import { of } from 'rxjs';
        import { mergeAll, mergeMap } from 'rxjs/operators';
        export const a = of(1).pipe(mergeMap((n) => of(n), 3));
        export const b = of(of(1)).pipe(mergeAll(2));
      `,
      'v.ts': `
        import { of } from 'rxjs';
        import { first } from 'rxjs/operators';
        export const c = of(1).pipe(first((n) => n > 0, 0));
      `,
    });

    expect(await read('u.ts')).toContain(
      'mergeMap((n) => of(n), { concurrency: 3 })',
    );
    expect(await read('u.ts')).toContain('mergeAll({ concurrency: 2 })');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RXJS_CALL_FORM_UNSUPPORTED',
        symbol: 'first',
        manual: true,
      }),
    ]);
  });

  it('moves lastValueFrom to @craft-ts/core', async () => {
    const { read } = await migrate({
      'w.ts': `
        import { lastValueFrom, of } from 'rxjs';
        export const load = () => lastValueFrom(of(1), { defaultValue: 0 });
      `,
    });
    const output = await read('w.ts');

    expect(output).toMatch(
      /import \{[^}]*lastValueFrom[^}]*\} from '@craft-ts\/core'/,
    );
    expect(output).toContain("from '@craft-ts/stream'");
  });

  it('drops asyncScheduler arguments with a review notice', async () => {
    const { read, result } = await migrate({
      'x.ts': `
        import { asyncScheduler, of } from 'rxjs';
        import { debounceTime, delay, throttleTime } from 'rxjs/operators';
        export const a = of(1).pipe(debounceTime(300, asyncScheduler));
        export const b = of(1).pipe(throttleTime(100, asyncScheduler, { leading: false, trailing: true }));
        export const c = of(1).pipe(delay(50, asyncScheduler));
      `,
    });
    const output = await read('x.ts');

    expect(output).toContain('debounce(300)');
    expect(output).toContain(
      'throttle(100, { leading: false, trailing: true })',
    );
    expect(output).toContain('delay(50)');
    expect(output).not.toContain('asyncScheduler');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ symbol: 'asyncScheduler', manual: false }),
    ]);
  });

  it('drops the other schedulers too, naming the change of timing', async () => {
    const { read, result } = await migrate({
      'y.ts': `
        import { animationFrameScheduler, asapScheduler, of, queueScheduler } from 'rxjs';
        import { delay, observeOn, throttleTime } from 'rxjs/operators';
        export const a = of(1).pipe(delay(5, asapScheduler));
        export const b = of(1).pipe(throttleTime(0, animationFrameScheduler));
        export const c = of(1).pipe(observeOn(queueScheduler));
      `,
    });
    const output = await read('y.ts');

    expect(output).toContain('delay(5)');
    expect(output).toContain('throttle(0)');
    expect(output).toContain('observeOn()');
    expect(output).not.toContain('Scheduler');
    expect(result.diagnostics.map((item) => item.symbol).sort()).toEqual([
      'animationFrameScheduler',
      'asapScheduler',
      'observeOn',
      'queueScheduler',
    ]);
    expect(result.diagnostics.every((item) => !item.manual)).toBe(true);
    expect(
      result.diagnostics.find((item) => item.symbol === 'asapScheduler')
        ?.message,
    ).toMatch(/change of timing/);
  });

  it('refuses a scheduler used as a plain value', async () => {
    const stray = `
      import { asyncScheduler, of } from 'rxjs';
      export const s = asyncScheduler;
      export const a = of(1);
    `;
    const { read, result } = await migrate({ 'z.ts': stray });

    expect(await read('z.ts')).toBe(stray);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'RXJS_CALL_FORM_UNSUPPORTED',
      symbol: 'asyncScheduler',
      manual: true,
    });
  });

  it('migrates materialize, dematerialize, observeOn and subscribeOn with notices', async () => {
    const { read, result } = await migrate({
      'm1.ts': `
        import { of } from 'rxjs';
        import { dematerialize, materialize, observeOn, subscribeOn } from 'rxjs/operators';
        export const a = of(1).pipe(materialize(), dematerialize());
        export const b = of(1).pipe(observeOn(asyncScheduler), subscribeOn(asyncScheduler));
      `.replace(
        "import { of } from 'rxjs';",
        "import { asyncScheduler, of } from 'rxjs';",
      ),
    });
    const output = await read('m1.ts');

    expect(output).toContain('materialize(), dematerialize()');
    expect(output).toContain('observeOn(), subscribeOn()');
    expect(result.diagnostics.map((item) => item.symbol).sort()).toEqual([
      'asyncScheduler',
      'materialize',
      'observeOn',
    ]);
    expect(result.diagnostics.every((item) => !item.manual)).toBe(true);
  });

  it('turns publish()+refCount() into the same-named operators, and a trailing publish() into connectable', async () => {
    const { read, result } = await migrate({
      'p1.ts': `
        import { Subject, of } from 'rxjs';
        import { map, publish, refCount, publishReplay } from 'rxjs/operators';

        const source = new Subject<number>();
        export const shared = source.pipe(map((n) => n + 1), publish(), refCount());
        export const replayed = of(1).pipe(publishReplay(2), refCount());
        export const hot = source.pipe(map((n) => n * 2), publish());
        export const bare = source.pipe(publish());
      `,
    });
    const output = await read('p1.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain(
      'fromSubscribable(source).pipe(map((n) => n + 1), publish(), refCount())',
    );
    expect(output).toContain('of(1).pipe(publishReplay(2), refCount())');
    expect(output).toContain(
      'connectable(fromSubscribable(source).pipe(map((n) => n * 2)))',
    );
    expect(output).toContain(
      'export const bare = connectable(fromSubscribable(source))',
    );
  });

  it('rewrites a trailing publishReplay/publishBehavior/multicast to connectable with a connector', async () => {
    const { read, result } = await migrate({
      'p2.ts': `
        import { Subject, of } from 'rxjs';
        import { map, multicast, publishBehavior, publishReplay } from 'rxjs/operators';

        export const a = of(1).pipe(publishBehavior(0));
        export const b = of(1).pipe(map((n) => n), multicast(new Subject<number>()));
        export const c = of(1).pipe(multicast(() => new Subject<number>()));
        export const d = of(1).pipe(map((n) => n), publishReplay(3));
        export const e = of(1).pipe(publishReplay());
        export const f = of(1).pipe(publishReplay(2, 500));
      `,
    });
    const output = await read('p2.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain(
      'connectable(of(1), { connector: () => behaviorSubject(0) })',
    );
    expect(output).toContain(
      'connectable(of(1).pipe(map((n) => n)), { connector: () => subject<number>() })',
    );
    expect(output).toContain(
      'connectable(of(1), { connector: () => subject<number>() })',
    );
    expect(output).toContain(
      'connectable(of(1).pipe(map((n) => n)), { connector: () => replaySubject(3) })',
    );
    expect(output).toContain(
      'connectable(of(1), { connector: () => replaySubject(Infinity) })',
    );
    expect(output).toContain(
      'connectable(of(1), { connector: () => replaySubject(2, { windowMs: 500 }) })',
    );
    expect(output).not.toMatch(/publish|multicast/);
  });

  it('translates a publish-family operator in the middle of a pipe, faithfully', async () => {
    const { read, result } = await migrate({
      'p3.ts': `
        import { Subject, of } from 'rxjs';
        import { map, multicast, publish, publishBehavior, publishReplay } from 'rxjs/operators';
        export const a = of(1).pipe(publish(), map((n) => n));
        export const b = of(1).pipe(map((n) => n), publishReplay(2), map((n) => n + 1));
        export const c = of(1).pipe(publishBehavior(0), map((n) => n));
        export const d = of(1).pipe(multicast(new Subject<number>()), map((n) => n));
        export const e = of(1).pipe(multicast(() => new Subject<number>()), map((n) => n));
      `,
    });
    const output = await read('p3.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('connectable(of(1)).pipe(map((n) => n))');
    expect(output).toContain(
      'connectable(of(1).pipe(map((n) => n)), { connector: () => replaySubject(2) }).pipe(map((n) => n + 1))',
    );
    expect(output).toContain(
      'connectable(of(1), { connector: () => behaviorSubject(0) }).pipe(map((n) => n))',
    );
    expect(output).toContain(
      'connectable(of(1), { connector: () => subject<number>() }).pipe(map((n) => n))',
    );
    expect(output).not.toMatch(/publish|multicast/);
  });

  it('drops the scheduler of a publish-family operator', async () => {
    const { read, result } = await migrate({
      'p4.ts': `
        import { asyncScheduler, of } from 'rxjs';
        import { publishReplay } from 'rxjs/operators';
        export const a = of(1).pipe(publishReplay(2, 100, asyncScheduler));
      `,
    });

    expect(await read('p4.ts')).toContain(
      'connectable(of(1), { connector: () => replaySubject(2, { windowMs: 100 }) })',
    );
    expect(await read('p4.ts')).not.toContain('asyncScheduler');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ symbol: 'asyncScheduler', manual: false }),
    ]);
  });

  it('translates the selector forms of publish, publishReplay and multicast to connect()', async () => {
    const { read, result } = await migrate({
      'p5.ts': `
        import { Subject, of } from 'rxjs';
        import { map, multicast, publish, publishReplay } from 'rxjs/operators';
        export const a = of(1).pipe(publish((shared) => shared.pipe(map((n) => n))));
        export const b = of(1).pipe(publishReplay(1, 100, (shared) => shared), map((n) => n));
        export const c = of(1).pipe(multicast(new Subject<number>(), (shared) => shared));
        export const d = of(1).pipe(multicast(() => new Subject<number>(), (shared) => shared));
        export const e = of(1).pipe(publishReplay(2, undefined, (shared) => shared));
      `,
    });
    const output = await read('p5.ts');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('connect((shared) => shared.pipe(map((n) => n)))');
    expect(output).toContain(
      'connect((shared) => shared, { connector: () => replaySubject(1, { windowMs: 100 }) })',
    );
    expect(output).toContain(
      'connect((shared) => shared, { connector: () => subject<number>() })',
    );
    expect(output).toContain(
      'connect((shared) => shared, { connector: () => replaySubject(2, { windowMs: undefined }) })',
    );
    expect(output).not.toMatch(/publish|multicast/);
  });

  it('migrates from(), scheduled(), generate(), bindCallback() and fromFetch()', async () => {
    const { read, result } = await migrate({
      'g1.ts': `
        import { asyncScheduler, bindCallback, bindNodeCallback, from, generate, of, scheduled } from 'rxjs';
        import { fromFetch } from 'rxjs/fetch';

        declare const promise: Promise<number>;
        declare const items: Set<number>;
        const load = bindCallback((x: number, done: (r: number) => void) => done(x));
        const read = bindNodeCallback((p: string, done: (e: unknown, t: string) => void) => done(null, p));
        export const a = from(promise);
        export const b = from(items);
        export const c = scheduled(items, asyncScheduler);
        export const d = generate(1, (n) => n < 5, (n) => n + 1);
        export const e = generate(1, (n) => n < 5, (n) => n + 1, (n) => n * 10);
        export const f = generate({ initialState: 0, iterate: (n) => n + 1 });
        export const g = load(2);
        export const h = read('x');
        export const i = fromFetch('/api');
        export const j = of(1);
      `,
    });
    const output = await read('g1.ts');

    expect(output).toContain('export const a = from(promise)');
    expect(output).toContain('export const b = from(items)');
    expect(output).toContain('export const c = from(items)');
    expect(output).toContain(
      'generate({ initialState: 1, condition: (n) => n < 5, iterate: (n) => n + 1 })',
    );
    expect(output).toContain(
      'generate({ initialState: 1, condition: (n) => n < 5, iterate: (n) => n + 1, resultSelector: (n) => n * 10 })',
    );
    expect(output).toContain(
      'generate({ initialState: 0, iterate: (n) => n + 1 })',
    );
    expect(output).toContain("fromFetch('/api')");
    expect(output).not.toContain("from 'rxjs");
    expect(result.diagnostics.map((item) => item.manual)).not.toContain(true);
  });

  it('migrates ajax, AjaxError, webSocket and WebSocketSubject', async () => {
    const { read, result } = await migrate({
      'ws.ts': `
        import { of } from 'rxjs';
        import { AjaxError, ajax } from 'rxjs/ajax';
        import { WebSocketSubject, webSocket } from 'rxjs/webSocket';
        import { catchError, map } from 'rxjs/operators';

        export const socket: WebSocketSubject<{ n: number }> = webSocket('ws://x');
        export const items = ajax.getJSON<number[]>('/api').pipe(map((rows) => rows.length));
        export const raw = ajax('/api');
        export const failed = (error: unknown) => error instanceof AjaxError;
        export const messages = socket.pipe(map((message) => message.n));
        export const a = of(1);
      `,
    });
    const output = await read('ws.ts');

    expect(result.diagnostics.filter((item) => item.manual)).toEqual([]);
    expect(output).toContain('WebSocketStream<{ n: number }> = webSocket(');
    expect(output).toContain("ajax.getJSON<number[]>('/api').pipe(map(");
    expect(output).toMatch(
      /import \{[^}]*\bajax\b[^}]*\} from '@craft-ts\/stream'/,
    );
    expect(output).toMatch(
      /import \{[^}]*\bAjaxError\b[^}]*\} from '@craft-ts\/stream'/,
    );
    expect(output).toMatch(
      /import \{[^}]*\bWebSocketStream\b[^}]*\} from '@craft-ts\/stream'/,
    );
    expect(output).not.toMatch(/from 'rxjs/);
    expect(
      result.diagnostics.find((item) => item.symbol === 'ajax')?.message,
    ).toMatch(/fetch/);
  });

  it('produces code that type-checks against @craft-ts/stream', async () => {
    const { root } = await migrate({
      'extra.ts': `
        import * as rx from 'rxjs';
        import { map as rxMap, multicast, publish } from 'rxjs/operators';
        import { ajax } from 'rxjs/ajax';
        import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

        declare const unknownSource: {
          pipe: (...args: unknown[]) => unknown;
          subscribe(observer: { next?: (value: number) => void }): { unsubscribe(): void };
        };

        export const socket: WebSocketSubject<{ n: number }> = webSocket('ws://x');
        export const sizes = ajax.getJSON<number[]>('/api').pipe(rxMap((rows) => rows.length));
        export const namespaced: rx.Observable<number> = rx.of(1).pipe(rx.operators.take(1));
        export const selector = rx.of(1).pipe(publish((shared) => shared.pipe(rxMap((n) => n + 1))));
        export const withSubject = rx.of(1).pipe(multicast(new rx.Subject<number>(), (shared) => shared));
        export const wrapped = unknownSource.pipe(rxMap(() => 1));
      `,
      'parity.ts': `
        import { Subject, forkJoin, iif, of, partition, range, timer, zip } from 'rxjs';
        import { audit, combineLatestAll, count, delayWhen, distinctUntilKeyChanged, elementAt, every, exhaust, find, isEmpty, mapTo, max, min, raceWith, sampleTime, single, skipLast, timestamp, zipWith } from 'rxjs/operators';

        const gate = new Subject<number>();
        export const totals = forkJoin([of(1, 2), of('a')]);
        export const named = forkJoin({ n: of(1), s: of('x') });
        export const picked = iif(() => true, range(1, 3), of(0));
        export const [evens, odds] = partition(of(1, 2, 3), (n) => n % 2 === 0);
        export const stats = of(3, 1, 2).pipe(count(), mapTo('done'));
        export const extremes = of(3, 1, 2).pipe(min(), max());
        export const checks = of(1, 2).pipe(every((n) => n > 0), isEmpty());
        export const lookup = of(1, 2, 3).pipe(find((n) => n > 1), single(), elementAt(0), skipLast(0));
        export const keyed = of({ id: 1 }, { id: 1 }).pipe(distinctUntilKeyChanged('id'));
        export const stamped = of(1).pipe(timestamp());
        export const paired = of(1).pipe(zipWith(of('a')), raceWith(of([1, 'a'] as [number, string])));
        export const timed = of(1, 2).pipe(audit(() => timer(10)), delayWhen(() => gate), sampleTime(5));
        export const inner = of(of(1), of(2)).pipe(combineLatestAll());
        export const zipped = of(of(1), of(2)).pipe(exhaust());
        export const joined = zip(of(1), of(2));
      `,
      'counter.ts': `
        import { BehaviorSubject, NEVER, Observable, Subject, asyncScheduler, bindCallback, concat, defer, from, generate, interval, of, scheduled, throwError } from 'rxjs';
        import { fromFetch } from 'rxjs/fetch';
        import { catchError, debounceTime, defaultIfEmpty, dematerialize, filter, first, map, materialize, mergeMap, multicast, observeOn, publish, publishReplay, refCount, shareReplay, take, windowCount } from 'rxjs/operators';

        export class Counter {
          private readonly count = new BehaviorSubject<number>(0);
          readonly doubled: Observable<number> = this.count.pipe(
            map((n) => n * 2),
            filter((n) => n >= 0),
            debounceTime(10),
            shareReplay({ bufferSize: 1, refCount: true }),
          );
          readonly seed = of(1, 2, 3).pipe(take(2), map((n) => n + 1));
          readonly ticks = interval(10).pipe(take(4), windowCount(2), catchError(() => of()));
          readonly misc = concat(of(1), defer(() => of(2)), this.count.asObservable()).pipe(
            first(),
            defaultIfEmpty(0),
            mergeMap((n) => of(n), 2),
            debounceTime(5, asyncScheduler),
          );
          readonly idle = NEVER;
          readonly broken = throwError(() => new Error('x'));
          readonly shared = this.count.pipe(map((n) => n + 1), publish(), refCount());
          readonly manual = of(1).pipe(publishReplay(2));
          readonly manualNamed = of(1).pipe(multicast(new Subject<number>()));
          readonly notes = of(1).pipe(materialize(), dematerialize(), observeOn(asyncScheduler));
          readonly lifted = from([1, 2, 3]).pipe(map((n) => n));
          readonly gen = generate(1, (n) => n < 5, (n) => n + 1).pipe(take(2));
          readonly cb = bindCallback((done: (v: number) => void) => done(1))();
          readonly fetched = fromFetch('/api');
          readonly mid = of(1).pipe(publishReplay(2, 100), map((n) => n));
          readonly scheduledItems = scheduled([1, 2], asyncScheduler);
          current(): number {
            return this.count.getValue();
          }
          watch(listener: (n: number) => void) {
            return this.doubled.subscribe(listener);
          }
          readonly view = this.count.asObservable();
          relay(source: Observable<number>) {
            return source.pipe(map((n) => n + 1));
          }
        }
      `,
    });
    const repo = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../..',
    );
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ScriptTarget.ES2022,
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Bundler,
        types: [],
        customConditions: ['@craft-ts/source'],
        paths: {
          '@craft-ts/core': [join(repo, 'libs/core/src/index.ts')],
          '@craft-ts/stream': [join(repo, 'libs/stream/src/index.ts')],
        },
      },
    });
    // The compile check below only proves something about files that were migrated.
    for (const name of ['counter.ts', 'extra.ts', 'parity.ts']) {
      expect(await readFile(join(root, name), 'utf8')).not.toMatch(
        /from 'rxjs/,
      );
    }
    const files = ['counter.ts', 'extra.ts', 'parity.ts'].map((name) =>
      project.addSourceFileAtPath(join(root, name)),
    );
    const own = project
      .getPreEmitDiagnostics()
      .filter((diagnostic) =>
        files.includes(diagnostic.getSourceFile() as never),
      )
      .map((diagnostic) => {
        const message = diagnostic.getMessageText();
        const text =
          typeof message === 'string' ? message : message.getMessageText();
        return `${diagnostic.getSourceFile()?.getBaseName()}:${diagnostic.getLineNumber()}: ${text}`;
      });

    expect(own).toEqual([]);
  }, 60_000);

  it('migrates the operators added for RxJS parity, renaming exhaust', async () => {
    const { read, result } = await migrate({
      'p.ts': `
        import { forkJoin, iif, of, partition, range } from 'rxjs';
        import { count, exhaust, mapTo, zipWith } from 'rxjs/operators';

        const other = of('a');
        export const joined = forkJoin([of(1), other]);
        export const chosen = iif(() => true, range(1, 2), of(0));
        export const [yes, no] = partition(of(1, 2), (n) => n > 1);
        export const out = of(1).pipe(count(), mapTo('x'), zipWith(other), exhaust());
      `,
    });
    const output = await read('p.ts');

    expect(result.exitCode).toBe(0);
    expect(output).toContain("from '@craft-ts/stream'");
    expect(output).not.toContain("from 'rxjs");
    expect(output).toContain('forkJoin([of(1), other])');
    expect(output).toContain('exhaustAll()');
    expect(output).not.toContain('exhaust()');
  });

  it('blocks a deprecated operator with the way out', async () => {
    const { result, read } = await migrate({
      'q.ts': `
        import { of } from 'rxjs';
        import { retryWhen } from 'rxjs/operators';
        export const out = of(1).pipe(retryWhen((errors) => errors));
      `,
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'RXJS_SYMBOL_UNSUPPORTED',
        message: expect.stringContaining('use `retry` with a policy'),
      }),
    );
    expect(await read('q.ts')).toContain("from 'rxjs'");
  });

  it('moves the type and guard names that have a core counterpart', async () => {
    const { read, result } = await migrate({
      's.ts': `
        import { isObservable, of } from 'rxjs';
        import type { Observer, SubscriptionLike } from 'rxjs';

        export function watch(input: unknown, observer: Partial<Observer<number>>): SubscriptionLike | undefined {
          return isObservable(input) ? of(1).subscribe(observer) : undefined;
        }
      `,
    });
    const output = await read('s.ts');

    expect(result.exitCode).toBe(0);
    expect(output).toContain('isObservableLike(input)');
    expect(output).toContain('Partial<StreamObserver<number>>');
    expect(output).toContain('Unsubscribable | undefined');
    expect(output).toContain("from '@craft-ts/core'");
    expect(output).not.toContain("from 'rxjs");
  });

  it('leaves the rest of the import block alone and puts the new import where rxjs was', async () => {
    const { read } = await migrate({
      'u.ts': `import {
  zeta,
  alpha,
} from './other';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Thing } from '@craft-ts/core';
import { last } from './last';

export const out = of(1).pipe(map((n) => n + 1));
export { zeta, alpha, last };
export type { Thing };
`,
    });
    const output = await read('u.ts');

    // Untouched: same order, same multi-line shape.
    expect(
      output.startsWith("import {\n  zeta,\n  alpha,\n} from './other';\n"),
    ).toBe(true);
    expect(output).toContain("import { last } from './last';");
    // The type-only core import is not given value names.
    expect(output).toContain("import type { Thing } from '@craft-ts/core';");
    // The new import sits right after './other', where the rxjs ones were.
    expect(output.indexOf("'@craft-ts/stream'")).toBeGreaterThan(
      output.indexOf("'./other'"),
    );
    expect(output.indexOf("'@craft-ts/stream'")).toBeLessThan(
      output.indexOf("'@craft-ts/core'"),
    );
    expect(output).not.toContain("from 'rxjs");
  });

  it('blocks the operator function types with the way out', async () => {
    const { result } = await migrate({
      't.ts': `
        import type { MonoTypeOperatorFunction } from 'rxjs';
        export type Same<T> = MonoTypeOperatorFunction<T>;
      `,
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'RXJS_SYMBOL_UNSUPPORTED',
        message: expect.stringContaining('StreamOperator<A, Y, A, Y>'),
      }),
    );
  });

  it('blocks forkJoin outside the array/object form', async () => {
    const { result } = await migrate({
      'r.ts': `
        import { forkJoin, of } from 'rxjs';
        export const out = forkJoin(of(1), of(2));
      `,
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'RXJS_CALL_FORM_UNSUPPORTED' }),
    );
  });

  it('fails --check while rxjs imports remain, and --fail-on-manual on blockers', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'n.ts': `import { unknownThing } from 'rxjs'; export const t = unknownThing;`,
    });
    const checked = await runStreamsMigration({
      rootDir: root,
      check: true,
      log: () => undefined,
    });
    const failing = await runStreamsMigration({
      rootDir: root,
      failOnManual: true,
      log: () => undefined,
    });

    expect(checked.exitCode).toBe(1);
    expect(failing.exitCode).toBe(1);
  });
});
