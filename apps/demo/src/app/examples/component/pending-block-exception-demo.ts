/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
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
      .pending-exception__reloading {
        padding: .35rem .75rem;
        border-radius: .6rem;
        background: #fef9c3;
        color: #854d0e;
        font-size: .85rem;
        font-weight: 650;
      }
      .pending-exception__list { display: grid; gap: .35rem; margin: 0; padding-left: 1.1rem; }
    `,
  },
  function* () {
    const issue = yield* mutation('issue', {
      // The outcome is an argument of the call, not ambient state.
      method: (input: { reference: string; reject: boolean }) => input,
      // Keep the previous invoice on screen while a new one is issued: the
      // settled read then serves the stale value instead of suspending, which
      // is what the boundary's `reloading` slot reports.
      preservePreviousValue: () => true,
      loader: craftGen(function* ({ params }) {
        yield* craftSleep(900);

        // A business failure is a value the loader returns, not a throw.
        if (params.reject) {
          return craftException(
            { code: 'INVOICE_REJECTED' },
            { reference: params.reference },
          );
        }

        return { reference: params.reference, amount: 4200 };
      }),
    });

    // Reading through `settled(...)` keeps the happy path free of both
    // `undefined` and the exception: `invoice` is the resolved invoice, always.
    const summary = craftComputed('summary', function* () {
      const invoice = yield* settled(issue);
      return `${invoice.reference} — ${(invoice.amount / 100).toFixed(2)} €`;
    });

    return { issue, summary };
  },
  ({ issue, summary }) =>
    section({ class: 'pending-exception' }, [
      h2('settledValue — the failing path'),
      p(
        'The same read suspends to the pendingBlock, then fails to the catchBlock.',
      ),
      div({ class: 'pending-exception__actions' }, [
        button(
          {
            class: 'pending-exception__action',
            *click() {
              yield* issue.mutate({
                reference: 'INV-2026-014',
                reject: false,
              });
            },
          },
          'Issue (success)',
        ),
        button(
          {
            class: 'pending-exception__action',
            *click() {
              yield* issue.mutate({
                reference: 'INV-2026-015',
                reject: true,
              });
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
            issue: {
              // A mutation that has never run has no value either, so the same
              // slot covers "not issued yet" and "issuing".
              pending: () =>
                p(
                  { class: 'pending-exception__skeleton' },
                  'Waiting for an invoice…',
                ),
              // Re-issuing keeps the previous invoice on screen: nothing
              // suspends, so this indicator is rendered next to it.
              reloading: () =>
                p({ class: 'pending-exception__reloading' }, 'Re-issuing…'),
            },
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
