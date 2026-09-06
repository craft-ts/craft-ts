import { describe, expect, it } from 'vitest';
import { checkReplay, markPaths, markTiers, onPick, viewOf } from './frame.ts';
import { layoutDigest, type MeasuredElement } from '../digest.ts';

/**
 * A snapshot, replayed into an iframe, driven entirely from outside it.
 *
 * jsdom returns zero-sized boxes, so nothing here asserts geometry — that is
 * what the browser suite is for. What is checked is the part that has to be
 * exactly right regardless of layout: that a click names the node the digest
 * named, and that the tiers land on the elements they claim to.
 */
const SNAPSHOT = `<!doctype html><html><head></head><body>
  <nav class="decor"><button>Menu</button></nav>
  <main class="shell">
    <div class="host" data-craft-attested>
      <h2 class="title">Account settings</h2>
      <p class="body">Manage your profile</p>
    </div>
  </main>
  <button class="pinned">Clear cache</button>
</body></html>`;

const replay = () => {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const inner = frame.contentDocument;
  if (!inner) throw new Error('no frame document');
  inner.open();
  inner.write(SNAPSHOT);
  inner.close();
  const view = viewOf(frame);
  if (!view) throw new Error('no view');
  return { frame, view };
};

describe('markPaths', () => {
  it('gives every attested element the address the digest uses', () => {
    const { view } = replay();
    const paths = markPaths(view, '.host');
    const byPath = Object.fromEntries(
      paths.map(([element, path]) => [path, element.className]),
    );

    // Addresses come from the collector's own walk, written onto the element
    // during it — never zipped against a second walk by index.
    expect(Object.values(byPath)).toContain('title');
    expect(Object.values(byPath)).toContain('body');
    expect(paths.every(([, path]) => path.length > 0)).toBe(true);
  });

  it('does not address anything outside the subject', () => {
    const { view } = replay();
    const addressed = markPaths(view, '.host').map(
      ([element]) => element.className,
    );
    expect(addressed).not.toContain('decor');
    expect(addressed).not.toContain('pinned');
  });
});

describe('markTiers', () => {
  it('separates what moved, what is attested and what is decor', () => {
    const { view } = replay();
    const paths = markPaths(view, '.host');
    const title = paths.find(([element]) => element.className === 'title');

    markTiers(view, {
      root: '.host',
      attested: paths.map(([, path]) => path),
      changed: title ? [title[1]] : [],
      occluded: [],
      dimDecor: true,
      hideChrome: false,
    });

    expect(
      view.document.querySelector('.title')?.getAttribute('data-craft-tier'),
    ).toBe('changed');
    expect(
      view.document.querySelector('.body')?.getAttribute('data-craft-tier'),
    ).toBe('attested');
    // Decor is dimmed, never removed: a component is judged in the frame it
    // actually sits in.
    expect(
      view.document.querySelector('.decor')?.getAttribute('data-craft-tier'),
    ).toBeNull();
  });

  it('marks the page chrome that sits over the subject', () => {
    const { view } = replay();
    const pinned = view.document.querySelector('.pinned') as HTMLElement;
    pinned.style.position = 'fixed';

    markTiers(view, {
      root: '.host',
      attested: [],
      changed: [],
      occluded: [],
      dimDecor: false,
      hideChrome: true,
    });

    // Marked so a reviewer can lift it and see what it covered — the one thing
    // a screenshot can never do, because those pixels are gone.
    expect(pinned.hasAttribute('data-craft-chrome')).toBe(true);
    expect(
      view.document.getElementById('craft-review-tiers')?.textContent,
    ).toContain('visibility: hidden');
  });

  it('replaces its own stylesheet instead of stacking copies', () => {
    const { view } = replay();
    const options = {
      root: '.host',
      attested: [],
      changed: [],
      occluded: [],
      dimDecor: true,
      hideChrome: false,
    };
    markTiers(view, options);
    markTiers(view, { ...options, dimDecor: false });
    expect(
      view.document.querySelectorAll('#craft-review-tiers'),
    ).toHaveLength(1);
  });
});

describe('onPick', () => {
  it('turns a click into the path of the node under it', () => {
    const { view } = replay();
    markPaths(view, '.host');
    const picked: string[] = [];
    const stop = onPick(view, (path) => picked.push(path));

    (view.document.querySelector('.title') as HTMLElement).click();
    expect(picked).toHaveLength(1);
    expect(picked[0]).toContain('h2');

    stop();
    (view.document.querySelector('.body') as HTMLElement).click();
    expect(picked).toHaveLength(1);
  });

  it('ignores a click on something the subject does not attest', () => {
    // The decor is visible on purpose; pointing at it must produce nothing
    // rather than a path this subject does not cover.
    const { view } = replay();
    markPaths(view, '.host');
    const picked: string[] = [];
    onPick(view, (path) => picked.push(path));

    (view.document.querySelector('.pinned') as HTMLElement).click();
    expect(picked).toEqual([]);
  });

  it('keeps only the latest selection marked', () => {
    const { view } = replay();
    markPaths(view, '.host');
    onPick(view, () => undefined);

    (view.document.querySelector('.title') as HTMLElement).click();
    (view.document.querySelector('.body') as HTMLElement).click();

    expect(view.document.querySelectorAll('[data-craft-picked]')).toHaveLength(
      1,
    );
    expect(
      view.document.querySelector('.body')?.hasAttribute('data-craft-picked'),
    ).toBe(true);
  });
});

describe('checkReplay', () => {
  const attested = layoutDigest([
    {
      path: 'div',
      rect: { x: 0, y: 0, width: 100, height: 40 },
      styles: {},
      scroll: { width: 100, height: 40, clientWidth: 100, clientHeight: 40 },
      zOrder: 0,
    },
  ] satisfies MeasuredElement[]);

  it('names the missing subject instead of listing forty symptoms', () => {
    const { view } = replay();
    const fidelity = checkReplay(view, '.not-in-this-document', attested);

    // The failure this replaces printed "36 attested node(s) are absent"
    // followed by `html`, `html/head`, `html/head/meta` — every symptom of one
    // cause, and none of them saying what it was.
    expect(fidelity.faithful).toBe(false);
    expect(fidelity.summary).toContain("no element matching '.not-in-this-document'");
    expect(fidelity.report).toEqual([]);
    expect(fidelity.summary).not.toContain('html/head');
  });

  it('does not report a missing subject when the root is the document', () => {
    const { view } = replay();
    // No selector means the document itself, which always matches.
    expect(checkReplay(view, ':root', attested).summary).not.toContain(
      'no element matching',
    );
  });
});
