---
title: 'I built a Signals-first toolkit for Angular. Here is the problem I could not stop hitting.'
published: false
description: 'Every Angular app I worked on had the same three kinds of state, handled three different ways, glued together by hand. This is the problem that made me build craft-ng — and an honest look at what it is today.'
tags: angular, typescript, webdev, signals
series: 'Building craft-ng'
canonical_url: ''
cover_image: ''
---

Every Angular application I have worked on in the last few years had the same three kinds of state:

- **URL state** — the page number, the active filter, the selected tab.
- **Client state** — what the user typed, what is expanded, what is selected.
- **Server state** — the thing you fetched, and everything that can go wrong while fetching it.

And every application handled them three completely different ways. `ActivatedRoute` and a `Router.navigate` call for the first. Signals or a store for the second. A service returning an `Observable`, plus a `loading` boolean, plus an `error` field, plus a `subscribe` somewhere, for the third.

None of that is wrong. It is just that the glue between them is written by hand, in every app, every time. And the glue is where the bugs live.

This article is about the specific piece of that problem I could not let go of, and about the toolkit I ended up building around it. It is called [craft-ng](https://github.com/ng-angular-stack/ng-craft), it is in beta, and I would genuinely rather have your objections than your stars.

## The code I wrote forty times

Here is the shape. If you have been writing Angular for a few years, you have written it a hundred times — and `resource()` has only recently made it avoidable.

```typescript
@Injectable()
export class TaskListService {
  private http = inject(HttpClient);

  tasks = signal<Task[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  load(done: boolean) {
    this.isLoading.set(true);
    this.error.set(null);
    this.http.get<Task[]>(`/api/tasks?done=${done}`).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Something went wrong');
        this.isLoading.set(false);
      },
    });
  }
}
```

Four fields, one method, and roughly six ways to get it subtly wrong:

1. **Race conditions.** Two `load()` calls in flight, the slow one resolves last, you display stale data. Nothing in the code above prevents it.
2. **The error is a `string`.** The server told you *why* — 403, 404, validation details. You threw all of it away at the boundary and replaced it with `'Something went wrong'`. The component now cannot show a useful message even if it wants to.
3. **`isLoading` and `error` can both be true.** Nothing enforces the state machine. It is three independent signals pretending to be one.
4. **Nobody calls `load()`.** Or something calls it twice. The trigger lives in an `ngOnInit` in a component far from here.
5. **Reading `tasks()` tells you nothing.** Empty array — is it loading, empty, or failed? You need all three signals to answer, at every call site.
6. **Testing it means mocking `HttpClient`** and asserting on the internal signals, which is a test of the implementation, not of the behaviour.

### "But we have `resource()` now"

We do, and it is a genuinely good primitive. It closes most of that list on its own: params are reactive, so nobody has to remember to call `load()`; stale requests are aborted, so the race condition goes away; and `status` is one value instead of three signals contradicting each other. If you are still hand-rolling the snippet above in a new Angular app, `resource()` is the answer and you do not need anything else. I am not trying to sell you a replacement for it.

Where it stopped being enough for me is that **it solves one async call at a time.** It is a primitive for a boundary, not a model for a feature. Three things kept falling outside of it:

- **The error stays untyped.** `resource().error()` hands you back an `unknown`. The 403 and the 404 that the server carefully distinguished arrive at the template as the same shapeless thing, and you are back to `'Something went wrong'` — the exact line I wanted to delete.
- **The trigger often lives in the URL.** The page number, the active filter, the sort column. `resource()` will happily react to a signal, but keeping that signal and the query string in sync — parsing, serialising, defaults, back button — is glue you still write by hand, in every feature.
- **Nothing connects a write back to a read.** Once a mutation succeeds somewhere else in the app, deciding what to refetch is left entirely to you.

So the question I ended up with was not "how do I fetch data" — Angular answers that now. It was: **what does the rest of the feature look like when fetching is no longer the hard part?**

## The thing I actually wanted

I wanted to keep the declarative bargain `resource()` makes — you declare, the framework maintains — but extend it past the single HTTP call, to the whole feature: the failures the server can return, the state that lives in the URL, the services that depend on each other, and the tests that have to reason about all of it.

Here is the same service in craft-ng. The shape will look familiar, and that is on purpose:

```typescript
import { craftService, query, queryParams } from '@craft-ng/core';
import { TaskApi } from './task-api';

const booleanCodec = {
  decode: (value: string) => value === 'true',
  encode: (value: boolean) => String(value),
};

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    // this state lives in the URL: ?done=true
    const filter = yield* queryParams(
      'filter',
      { state: { done: { fallbackValue: false, codec: booleanCodec } } },
      ({ patch }) => ({
        showDone: () => patch({ done: true }),
        showPending: () => patch({ done: false }),
      }),
    );

    const tasks = yield* query('tasksQuery', {
      params: () => ({ done: filter.done() }),
      loader: function* ({ params }) {
        return yield* TaskApi.list(params);
      },
    });

    return { filter, tasks };
  },
);
```

The wiring between the two primitives is a single line: `params` reads `filter.done()`. That read *is* the subscription. Call `filter.showDone()` from a button and three things happen on their own — the URL becomes `?done=true`, the loader re-runs with the new params, and the in-flight request for the previous filter stops mattering. There is no `load()` to call, no `ngOnInit` to forget, and no `effect()` watching one thing to imperatively poke another.

That is also the second gap closed. The filter is not a signal that I *also* remembered to mirror into the query string: the URL **is** where it is stored. Refresh the page, copy the link into Slack, hit the back button — the state was never anywhere else, so there is nothing to resynchronise. No `ActivatedRoute` subscription, no `skipLocationChange` dance.

The `codec` is the price, and it is not optional: a URL holds strings, so every parameter must say how it converts both ways. In exchange, `filter.done()` is a `boolean` rather than a `string | null` you re-parse at each call site, and `fallbackValue` means it is never `undefined`.

What comes back carries the whole async state as one thing:

```typescript
tasks.value(); // Task[] | undefined — never throws
tasks.isLoading(); // boolean
tasks.status(); // 'idle' | 'loading' | 'resolved' | 'exception'
tasks.exception(); // the typed failure, if any
```

That last line is the one I care most about.

## Errors are values, and they keep their type

The `'Something went wrong'` string is, to me, the most expensive line in the original snippet. It is where type information goes to die.

So let us open the `TaskApi` I quietly imported above. This is where the HTTP call lives, and where the failures get their names:

```typescript
import { craftException, CraftHttpClient, craftService } from '@craft-ng/core';

export const { TaskApi } = craftService(
  { name: 'TaskApi', scope: 'global' },
  function* () {
    return {
      list: function* (params: { done: boolean }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/tasks?done=${params.done}`,
          success: response<Task[]>(),
          exceptions: [
            function* ({ status }) {
              if (!(yield* status(403))) return;
              return craftException({ code: 'TASKS_FORBIDDEN' });
            },
            function* ({ status }) {
              if (!(yield* status(404))) return;
              return craftException({ code: 'TASKS_NOT_FOUND' });
            },
          ],
        }));
      },
    };
  },
);
```

A 403 becomes `TASKS_FORBIDDEN`, a 404 becomes `TASKS_NOT_FOUND`. Not a log line, not a string — a value with a code, declared right next to the request that can produce it.

What about everything I did *not* list — the 500, the timeout, the DNS failure? It does not vanish, and it is not thrown either. `CraftHttpClient` folds it into one more exception of its own:

```typescript
craftException(
  { code: 'HttpError', scope: 'HttpClient', identifier: 'GET /api/tasks' },
  { error, method, url },
);
```

So the transport failure is a value too, with the original `HttpErrorResponse` in its payload. The `scope` is what separates the two families: `HttpClient` means the request itself did not make it, while my two codes mean the server answered and said no. Different scopes, different places to deal with them — `HttpError` is usually routed to a global error screen rather than handled in this template, which is exactly what [route exception handling](https://ng-angular-stack.github.io/craft/guide/routing/exception-handling) is for.

Now, the part that matters. `TaskList` never mentions any of these codes — it just calls `TaskApi.list(params)`. But they travel with the return type, so the compiler knows the complete set of things that can go wrong in that query. Which means the template can be made exhaustive:

```typescript
matchBlock.exhaustive(() => tasks.exceptions().loader, 'code', {
  TASKS_FORBIDDEN: () => p('You do not have access to this list.'),
  TASKS_NOT_FOUND: () => p('This list no longer exists.'),
  HttpError: () => p('Could not reach the server. Try again?'),
});
```

Add a third failure mode to `TaskApi.list` — a 409, say — and this template stops compiling until you decide what the user sees. Not a runtime check, not a lint rule: a type error, in a different file from the one you edited, at the exact place where the decision belongs.

This turned out to be the part that changed how I write features, more than the boilerplate savings did. "What can fail here, and did I say what happens?" becomes a question the compiler asks me, instead of one I remember to ask myself.

## Why `yield*`

You have noticed the `function*` and the `yield*`. That is the one genuinely unusual thing in the API, and it deserves an honest word now rather than a surprise later — starting with credit, because I did not invent it.

**This pattern comes from [Effect](https://effect.website).** If you have written `Effect.gen(function* () { … yield* … })`, everything above will have looked familiar, and for good reason: the two ideas I care most about are theirs. Failures belong in the type rather than in a `catch` block, and what a piece of code *requires* should be visible in its signature instead of resolved invisibly at runtime. Generators are what make both practical — they give you `async/await` ergonomics over something that is not a promise, without monad transformers and without a `.pipe()` chain for every branch.

What craft-ng does not do is bring the rest of Effect with it. There is no runtime to learn, no fibers, no `Layer`, no separate scheduler. The success value is not wrapped: `tasks.value()` is a `Task[] | undefined`, and it is read from an Angular template like any other signal. Craft borrows the ergonomics and the type discipline, and leaves the execution model to Angular.

So if this article makes you want the full version rather than the Angular-shaped subset of it, go read Effect — it is a genuinely excellent library and you will lose nothing by starting there.

Every primitive returns a generator, and you consume it with `yield*`:

```typescript
const counter = yield* state('counter', 0, ({ update }) => ({
  increment: () => update((value) => value + 1),
}));
```

The reason is dependency tracking. When a primitive is *yielded* rather than called, the surrounding factory sees it go past. That is what makes the dependency graph of a service visible — to the compiler, to the tooling, and to tests, which can then describe the real graph instead of mocking whatever happens to be injected.

It costs you two characters and one unfamiliar keyword. Whether that trade is worth it is exactly the kind of thing I want to be argued with about, and it is the subject of the next article in this series.

## Try it

craft-ng is in beta: `@craft-ng/core@beta`, targeting Angular 21, Node 20.19+ and TypeScript 5.9+. The surface will still move, and breaking changes come with a changelog and a migration note.

```bash
npm install @craft-ng/core@beta @craft-ng/component@beta
```

The [documentation](https://ng-angular-stack.github.io/craft/) has a ten-step guide that builds a real feature, and the [repository](https://github.com/ng-angular-stack/ng-craft) is MIT.

## The question I actually want answered

I have been staring at this problem long enough that I have lost the ability to see it from outside. So, genuinely:

**In your current Angular app, what is the glue you are tired of writing?** Is it the loading/error triad? The URL-as-state synchronisation? Passing typed data down a route hierarchy? Something else entirely that I have not even modelled?

I am building this in the open, in beta, precisely so that the answer can still change the API. Tell me where I am wrong — in the comments, or in a [discussion](https://github.com/ng-angular-stack/ng-craft/discussions).

Next in this series: **why the primitives are generators**, and what `yield*` actually buys you that a plain function call cannot.
