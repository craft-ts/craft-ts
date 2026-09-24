import {
  button,
  catchNode,
  craftComponent,
  div,
  li,
  p,
  pendingNode,
  section,
  strong,
  ul,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftException,
  craftGen,
  craftSleep,
  mutation,
  settled,
} from '@craft-ts/core';
import { componentUi, pendingDemo } from './component-demos.style';

const pendingStatusMessage = (
  className: typeof pendingDemo.skeleton,
  message: string,
) => p({ class: className }, message);

/**
 * The failing side of `settledValue`: a source can settle on an **exception**
 * instead of a value.
 *
 * A settled read has two exits and each one has its own boundary:
 *
 * - nothing to show yet → `CraftNotSettled` → the nearest `pendingNode`;
 * - the source carries a `craftException` → the nearest `catchNode`.
 *
 * Both are compile-time obligations. Drop either `.pipe(...)` below and
 * `craftComponent(...)` refuses to compile — naming the "issue" source for the
 * first, the `INVOICE_REJECTED` code for the second.
 */
export const pendingNodeExceptionDemo = craftComponent(
  'pendingNodeExceptionDemo',
  {
    host: { class: componentUi.host },
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
            { _tag: 'INVOICE_REJECTED' },
            { reference: params.reference },
          );
        }

        return { reference: params.reference, amount: 4200 };
      }),
    },
      ({ resource }) => ({
        summary: craftComputed('summary', function* () {
          const invoice = yield* settled(resource);
          return `${invoice.reference} — ${(invoice.amount / 100).toFixed(2)} €`;
        }),
      }),
    );

    return { issue };
  },
  ({ issue }) =>
    section({ class: pendingDemo.page }, [
      heading('settledValue — the failing path'),
      p(
        'The same read suspends to the pendingNode, then fails to the catchNode.',
      ),
      div({ class: pendingDemo.actions }, [
        button('issueSuccess',
          { type: 'button',
            class: pendingDemo.actionButton,
            *click() {
              yield* issue.mutate({
                reference: 'INV-2026-014',
                reject: false,
              });
            },
          },
          'Issue (success)',
        ),
        button('issueRejected',
          { type: 'button',
            class: pendingDemo.actionButton,
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
        ul({ class: pendingDemo.list }, [
          li(['Invoice: ', strong(issue.summary)]),
        ]),
      ])
        .pipe(
          pendingNode({
            fallback: () =>
              pendingStatusMessage(
                pendingDemo.skeleton,
                'Waiting for an invoice…',
              ),
            reloading: () =>
              pendingStatusMessage(
                pendingDemo.reloading,
                'Re-issuing…',
              ),
          }),
        )
        .pipe(
          // The mutation exposes this code at runtime, while its current
          // settled-value type only carries the pending source.
          catchNode.exhaustive({
            // A catchNode handler receives the exception as `AnyCraftException`:
            // its `code` is known, its payload is not. Reach for `matchNode`
            // when the fallback needs the payload itself.
            // `showSource: false` replaces the row instead of appending to it —
            // the summary line has nothing to show once the source failed.
          INVOICE_REJECTED: () =>
              p(
                { class: pendingDemo.error },
                'Invoice rejected (INVOICE_REJECTED)',
              ),
          }),
        )
    ]),
);

export default pendingNodeExceptionDemo;
