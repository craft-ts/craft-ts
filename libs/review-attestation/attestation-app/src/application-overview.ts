import {
  button,
  craftComponent,
  div,
  forNode,
  img,
  input,
  label,
  option,
  p,
  select,
  safeUrl,
  small,
  strong,
  textarea,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftComputed, craftMethod, state } from '@craft-ts/core';
import type { ApplicationCaptureInventoryItem } from '@craft-ts/dev-tools/attestation-review';
import { eventValue } from './annotation-text';
import { applicationOverview } from './application-overview.style';

export type ApplicationVerdict = {
  readonly subjects: readonly string[];
  readonly verdict: 'ok' | 'rejected';
  readonly note: string;
};
const initialSelection = (): readonly string[] => [];
export const ApplicationOverview = craftComponent(
  'ApplicationOverview',
  {},
  function* (
    captures: Input<readonly ApplicationCaptureInventoryItem[]>,
    decide: Output<(value: ApplicationVerdict) => void>,
    inspect: Output<(subject: string) => void>,
  ) {
    const category = yield* state(
      'applicationCategory',
      'happy-path',
      ({ set }) => ({ choose: set }),
    );
    const pageFilter = yield* state('applicationPage', '', ({ set }) => ({
      choose: set,
    }));
    const scenarioFilter = yield* state(
      'applicationScenario',
      '',
      ({ set }) => ({ choose: set }),
    );
    const viewportFilter = yield* state(
      'applicationViewport',
      '',
      ({ set }) => ({ choose: set }),
    );
    const statusFilter = yield* state('applicationStatus', '', ({ set }) => ({
      choose: set,
    }));
    const zoom = yield* state('applicationZoom', 'fit', ({ set }) => ({
      choose: set,
    }));
    const imageKind = yield* state('applicationImage', 'image', ({ set }) => ({
      choose: set,
    }));
    const note = yield* state('applicationNote', '', ({ set }) => ({
      write: set,
    }));
    const pages = craftComputed('pages', function* () {
      return [...new Set((yield* captures()).map((c) => c.page))];
    });
    const scenarios = craftComputed('scenarios', function* () {
      return [...new Set((yield* captures()).map((c) => c.scenario))];
    });
    const viewports = craftComputed('viewports', function* () {
      return [...new Set((yield* captures()).map((c) => c.viewport))];
    });
    const visible = craftComputed('visible', function* () {
      const kind = yield* category();
      const page = yield* pageFilter();
      const scenario = yield* scenarioFilter();
      const viewport = yield* viewportFilter();
      const status = yield* statusFilter();
      return (yield* captures()).filter(
        (c) =>
          (!kind || c.category === kind) &&
          (!page || c.page === page) &&
          (!scenario || c.scenario === scenario) &&
          (!viewport || c.viewport === viewport) &&
          (!status || c.state === status),
      );
    });
    const progress = craftComputed('progress', function* () {
      const all = yield* captures();
      return `${all.filter((c) => c.state === 'current' || c.state === 'renewed').length} / ${all.length} acceptées · ${all.filter((c) => !c.image).length} manquantes · ${all.filter((c) => c.category === 'exception').length} captures d’exception`;
    });
    const selected = yield* state(
      'applicationSelection',
      initialSelection(),
      ({ set, state }) => ({
        toggle: function* (subject: string) {
          const values = yield* state();
          return yield* set(
            values.includes(subject)
              ? values.filter((s) => s !== subject)
              : [...values, subject],
          );
        },
        clear: () => set([]),
        visibleSelection: craftComputed('visibleSelection', function* () {
          const selection = yield* state();
          return (yield* visible())
            .filter(
              (c) =>
                selection.includes(c.subject) &&
                !!c.image &&
                !c.error &&
                ['missing', 'review'].includes(c.state),
            )
            .map((c) => c.subject);
        }),
      }),
    );
    const actions = craftComputed('actions', function* () {
      const empty = !(yield* selected.visibleSelection()).length;
      const written = yield* note();
      return { disableAccept: empty, disableReject: empty || !written.trim() };
    });
    const pageProgress = craftComputed('pageProgress', function* () {
      const all = yield* captures();
      return (yield* pages()).map((name) => {
        const entries = all.filter((c) => c.page === name);
        return {
          name,
          label: `${name} · ${entries.filter((c) => ['current', 'renewed'].includes(c.state)).length}/${entries.length}`,
        };
      });
    });
    const rows = craftComputed('rows', function* () {
      const selection = yield* selected();
      const kind = yield* imageKind();
      const scale = yield* zoom();
      return (yield* visible()).map((c) => {
        const hash =
          kind === 'reference'
            ? c.reference
            : kind === 'diff'
              ? c.diff
              : c.image;
        const diff = c.comparison;
        return {
          subject: c.subject,
          title: `${c.page} / ${c.label} / ${c.capture}`,
          caption: `${c.viewport} · ${c.dimensions.width} × ${c.dimensions.height} · ${c.state}`,
          selected: selection.includes(c.subject),
          disabled:
            !c.image || !!c.error || !['missing', 'review'].includes(c.state),
          comparison:
            c.error ??
            (diff
              ? `Seuil ${diff.threshold} · maximum ${diff.maxDiffPixels} pixels · ${diff.diffPixels ?? '—'} différents · ${diff.matches ? 'dans la tolérance' : 'à valider'}`
              : c.reference
                ? 'Référence humaine disponible'
                : 'Sans référence humaine'),
          image: hash ? `/api/evidence/${encodeURIComponent(hash)}` : '',
          imageHidden: !hash,
          alt: `${c.page}, ${c.scenario}, ${c.capture}, ${c.viewport}`,
          zoom: scale === 'actual' ? 'actual' : 'fit',
        };
      });
    });
    const submit = craftMethod(
      'submit',
      function* (verdict: 'ok' | 'rejected') {
        const subjects = yield* selected.visibleSelection();
        const written = yield* note();
        if (!subjects.length || (verdict === 'rejected' && !written.trim()))
          return;
        decide({ subjects, verdict, note: written });
        yield* selected.clear();
      },
    );
    const next = craftMethod('next', function* () {
      const capture = (yield* visible()).find(
        (c) => c.image && !c.error && ['review', 'missing'].includes(c.state),
      );
      if (capture) inspect(capture.subject);
    });
    return {
      captures,
      decide,
      inspect,
      category,
      pageFilter,
      scenarioFilter,
      viewportFilter,
      statusFilter,
      zoom,
      imageKind,
      note,
      selected,
      pages,
      scenarios,
      viewports,
      visible,
      progress,
      actions,
      pageProgress,
      rows,
      submit,
      next,
    };
  },
  ({
    inspect,
    category,
    pageFilter,
    scenarioFilter,
    viewportFilter,
    statusFilter,
    zoom,
    imageKind,
    note,
    selected,
    pages,
    scenarios,
    viewports,
    progress,
    actions,
    pageProgress,
    rows,
    submit,
    next,
  }) =>
    div([
      p(
        {
          class: applicationOverview.progress,
          'data-testid': 'application-progress',
          'aria-live': 'polite',
        },
        progress,
      ),
      div(
        { class: applicationOverview.row },
        forNode(pageProgress, { track: (page) => page.name }, (page) =>
          button(
            'ApplicationPageProgress',
            {
              type: 'button',
              class: applicationOverview.button,
              *click() {
                yield* pageFilter.choose((yield* page()).name);
              },
            },
            function* () {
              return (yield* page()).label;
            },
          ),
        ),
      ),
      div({ class: applicationOverview.row }, [
        label({ class: applicationOverview.field }, [
          'Scénarios',
          select(
            'ApplicationCategory',
            {
              value: category,
              *change(event) {
                yield* category.choose(eventValue(event));
              },
            },
            [
              option({ value: 'happy-path' }, 'Happy paths'),
              option({ value: 'exception' }, 'Exceptions'),
              option({ value: '' }, 'Tous'),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'Page',
          select(
            'ApplicationPage',
            {
              value: pageFilter,
              *change(event) {
                yield* pageFilter.choose(eventValue(event));
              },
            },
            [
              option({ value: '' }, 'Toutes'),
              forNode(pages, { track: (v) => v }, (v) =>
                option({ value: v }, v),
              ),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'Scénario',
          select(
            'ApplicationScenario',
            {
              value: scenarioFilter,
              *change(event) {
                yield* scenarioFilter.choose(eventValue(event));
              },
            },
            [
              option({ value: '' }, 'Tous'),
              forNode(scenarios, { track: (v) => v }, (v) =>
                option({ value: v }, v),
              ),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'Format',
          select(
            'ApplicationViewport',
            {
              value: viewportFilter,
              *change(event) {
                yield* viewportFilter.choose(eventValue(event));
              },
            },
            [
              option({ value: '' }, 'Tous'),
              forNode(viewports, { track: (v) => v }, (v) =>
                option({ value: v }, v),
              ),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'État',
          select(
            'ApplicationStatus',
            {
              value: statusFilter,
              *change(event) {
                yield* statusFilter.choose(eventValue(event));
              },
            },
            [
              option({ value: '' }, 'Tous'),
              option({ value: 'missing' }, 'À valider / manquant'),
              option({ value: 'review' }, 'À revoir'),
              option({ value: 'current' }, 'Accepté'),
              option({ value: 'renewed' }, 'Conservé'),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'Zoom',
          select(
            'ApplicationZoom',
            {
              value: zoom,
              *change(event) {
                yield* zoom.choose(eventValue(event));
              },
            },
            [
              option({ value: 'fit' }, 'Ajusté'),
              option({ value: 'actual' }, 'Taille réelle'),
            ],
          ),
        ]),
        label({ class: applicationOverview.field }, [
          'Image',
          select(
            'ApplicationImage',
            {
              value: imageKind,
              *change(event) {
                yield* imageKind.choose(eventValue(event));
              },
            },
            [
              option({ value: 'image' }, 'Capture courante'),
              option({ value: 'reference' }, 'Référence humaine'),
              option({ value: 'diff' }, 'Différences'),
            ],
          ),
        ]),
      ]),
      div({ class: applicationOverview.row }, [
        label({ class: applicationOverview.field }, [
          'Commentaire',
          textarea('ApplicationComment', {
            class: applicationOverview.comment,
            'aria-label': 'Commentaire',
            value: note,
            *input(event) {
              yield* note.write(eventValue(event));
            },
          }),
        ]),
        button(
          'AcceptApplicationSelection',
          {
            type: 'button',
            class: applicationOverview.button,
            disabled: function* () {
              return (yield* actions()).disableAccept;
            },
            *click() {
              yield* submit('ok');
            },
          },
          'Accepter la sélection affichée',
        ),
        button(
          'RejectApplicationSelection',
          {
            type: 'button',
            class: applicationOverview.button,
            disabled: function* () {
              return (yield* actions()).disableReject;
            },
            *click() {
              yield* submit('rejected');
            },
          },
          'Rejeter la sélection',
        ),
        button(
          'NextApplicationCapture',
          { type: 'button', class: applicationOverview.button, click: next },
          'Prochaine capture à examiner',
        ),
      ]),
      div(
        { class: applicationOverview.captures },
        forNode(rows, { track: (row) => row.subject }, (row) =>
          div(
            {
              class: applicationOverview.capture,
              'data-testid': 'application-capture',
            },
            [
              strong(function* () {
                return (yield* row()).title;
              }),
              small(function* () {
                return (yield* row()).caption;
              }),
              label({ class: applicationOverview.select }, [
                input('SelectApplicationCapture', {
                  type: 'checkbox',
                  'aria-label': 'Sélectionner cette capture',
                  checked: function* () {
                    return (yield* row()).selected;
                  },
                  disabled: function* () {
                    return (yield* row()).disabled;
                  },
                  *change() {
                    yield* selected.toggle((yield* row()).subject);
                  },
                }),
                'Sélectionner cette capture',
              ]),
              p(function* () {
                return (yield* row()).comparison;
              }),
              div(
                { class: applicationOverview.imageScroll },
                img({
                  src: function* () {
                    return safeUrl((yield* row()).image);
                  },
                  alt: function* () {
                    return (yield* row()).alt;
                  },
                  hidden: function* () {
                    return (yield* row()).imageHidden;
                  },
                  class: applicationOverview.image,
                  'data-zoom': function* () {
                    return (yield* row()).zoom;
                  },
                }),
              ),
              button(
                'InspectApplicationCapture',
                {
                  type: 'button',
                  class: applicationOverview.button,
                  disabled: function* () {
                    return (yield* row()).disabled;
                  },
                  *click() {
                    yield* inspect((yield* row()).subject);
                  },
                },
                'Examiner et donner un verdict',
              ),
            ],
          ),
        ),
      ),
    ]),
);
