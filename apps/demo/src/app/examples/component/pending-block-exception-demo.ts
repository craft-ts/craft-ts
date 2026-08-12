import {
  button,
  catchBlock,
  craftComponent,
  div,
  h2,
  li,
  p,
  pendingBlock,
  section,
  strong,
  ul,
} from '@craft-ng/component';
import {
  craftComputed,
  craftException,
  craftGen,
  craftSleep,
  mutation,
  settled,
  state,
} from '@craft-ng/core';

/**
 * The failing side of `settledValue`: a source can settle on an **exception**
 * instead of a value.
 *
 * A settled read has two exits and each one has its own boundary:
 *
 * - nothing to show yet → `CraftNotSettled` → the nearest `pendingBlock`;
 * - the source carries a `craftException` → the nearest `catchBlock`.
 *
 * Both are compile-time obligations. Drop either `.pipe(...)` below and
 * `craftComponent(...)` refuses to compile — naming the "issue" source for the
 * first, the `INVOICE_REJECTED` code for the second.
 */
export const pendingBlockExceptionDemo = craftComponent(
  'pendingBlockExceptionDemo',
  {
    host: { class: 'pending-exception-host' },
    styles: `
      :scope { display: grid; gap: 1rem; padding: 1rem; justify-items: start; }
      .pending-exception__actions { display: flex; gap: .5rem; flex-wrap: wrap; }
      .pending-exception__action {
        padding: .45rem .9rem;
        border: 1px solid #c7d2fe;
        border-radius: .6rem;
        background: #fff;
        font-weight: 650;
        cursor: pointer;
      }
      .pending-exception__skeleton {
        padding: .75rem 1rem;
        border-radius: .75rem;
        background: #eef2ff;
        color: #4338ca;
        font-weight: 650;
      }
      .pending-exception__error {
        padding: .75rem 1rem;
        border: 1px solid #fecaca;
        border-radius: .75rem;
        background: #fef2f2;
        color: #b91c1c;
        font-weight: 650;
      }
      .pending-exception__list { display: grid; gap: .35rem; margin: 0; padding-left: 1.1rem; }
    `,
  },
  function* () {
    const shouldFail = yield* state('shouldFail', false, ({ set }) => ({
      succeed: () => set(false),
      fail: () => set(true),
    }));

    const issue = yield* mutation('issue', {
      method: (reference: string) => reference,
      loader: craftGen(function* ({ params }) {
        yield* craftSleep(900);

        // A business failure is a value the loader returns, not a throw.
        if (shouldFail()) {
          return craftException(
            { code: 'INVOICE_REJECTED' },
            { reference: params },
          );
        }

        return { reference: params, amount: 4200 };
      }),
    });

    // Reading through `settled(...)` keeps the happy path free of both
    // `undefined` and the exception: `invoice()` is the resolved invoice, always.
    const summary = craftComputed('summary', function* () {
      const invoice = yield* settled(issue);
      return () =>
        `${invoice().reference} — ${(invoice().amount / 100).toFixed(2)} €`;
    });

    return { issue, summary, shouldFail };
  },
  ({ issue, summary, shouldFail }) =>
    section({ class: 'pending-exception' }, [
      h2('settledValue — the failing path'),
      p('The same read suspends to the pendingBlock, then fails to the catchBlock.'),
      div({ class: 'pending-exception__actions' }, [
        button(
          {
            class: 'pending-exception__action',
            *click() {
              yield* shouldFail.succeed();
              yield* issue.mutate('INV-2026-014');
            },
          },
          'Issue (success)',
        ),
        button(
          {
            class: 'pending-exception__action',
            *click() {
              yield* shouldFail.fail();
              yield* issue.mutate('INV-2026-015');
            },
          },
          'Issue (rejected)',
        ),
      ]),
      div([
        ul({ class: 'pending-exception__list' }, [
          li(['Invoice: ', strong(summary)]),
        ]),
      ])
        // The wait belongs to the pendingBlock…
        .pipe(
          pendingBlock.exhaustive({
            // A mutation that has never run has no value either, so the same
            // boundary covers "not issued yet" and "issuing".
            issue: () =>
              p(
                { class: 'pending-exception__skeleton' },
                'Waiting for an invoice…',
              ),
          }),
        )
        // …and the business failure to the catchBlock. Without it, the code
        // `INVOICE_REJECTED` — reachable only through the settled read — has
        // nowhere to go and the template does not compile.
        .pipe(
          catchBlock.exhaustive({
            // A catchBlock handler receives the exception as `AnyCraftException`:
            // its `code` is known, its payload is not. Reach for `matchBlock`
            // when the fallback needs the payload itself.
            // `showSource: false` replaces the row instead of appending to it —
            // the summary line has nothing to show once the source failed.
            INVOICE_REJECTED: {
              showSource: false,
              render: (exception) =>
                p(
                  { class: 'pending-exception__error' },
                  `Invoice rejected (${exception.code})`,
                ),
            },
          }),
        ),
    ]),
);

export default pendingBlockExceptionDemo;
