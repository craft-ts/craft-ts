/**
 * The pages the browser suite measures.
 *
 * Written out rather than pulled from the demo application on purpose: the
 * question here is whether the digest reads a real layout engine correctly, and
 * a failure has to be unambiguous between the collector and somebody's app.
 *
 * The strings are the real ones. `Benutzerkontoeinstellungen` is what the German
 * catalogue actually says for `account.settings`, and it is the string that
 * breaks the card.
 */

const SHELL = (body: string, extra = ''): string => `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 -apple-system, system-ui, sans-serif; background: #ffffff; }
  .card {
    width: 200px; padding: 12px; border: 1px solid #dddddd; border-radius: 4px;
    background: #ffffff;
  }
  .card > .title {
    font-weight: 600; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; color: #111111;
  }
  .card > .subtitle { color: #949494; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; width: 300px; }
  .row > .chip { padding: 4px 8px; background: #eeeeee; border-radius: 999px; }
  ${extra}
</style>
${body}`;

/** A card whose title fits. */
export const CARD_EN = SHELL(`
<div class="card" data-testid="userCard">
  <div class="title" data-testid="userCard/title">Account settings</div>
  <div class="subtitle" data-testid="userCard/subtitle">Manage your profile</div>
</div>`);

/**
 * The same card, in German.
 *
 * `Benutzerkontoeinstellungen` does not fit in 200px, and the ellipsis makes
 * that look intentional. Only the number tells the two apart.
 */
export const CARD_DE = SHELL(`
<div class="card" data-testid="userCard">
  <div class="title" data-testid="userCard/title">Benutzerkontoeinstellungen</div>
  <div class="subtitle" data-testid="userCard/subtitle">Profil verwalten</div>
</div>`);

/** Grey on white: legible enough to ship, not legible enough to read. */
export const LOW_CONTRAST = SHELL(`
<div class="card" data-testid="card">
  <div class="subtitle" data-testid="card/subtitle">Optional</div>
</div>`);

/** A title that takes a second line past some character count. */
export const wrappingTitle = (text: string): string =>
  SHELL(
    `<div class="card" data-testid="userCard">
       <div class="title wrap" data-testid="userCard/title">${text}</div>
     </div>`,
    '.card > .title.wrap { white-space: normal; overflow: visible; }',
  );

/**
 * A fixed row of chips in a box of a given width.
 *
 * The width varies, not the number of chips: an axis that changes the DOM makes
 * the signature move at every sample, and the bisection then reports a
 * threshold everywhere instead of where the row actually wraps.
 */
export const chipRowAtWidth = (width: number): string =>
  SHELL(
    `<div class="row" data-testid="row">${Array.from(
      { length: 6 },
      (_, index) => `<span class="chip" data-testid="row/chip-${index}">tag</span>`,
    ).join('')}</div>`,
    `.row { width: ${width}px; }`,
  );

/** A price column that stops fitting past some order of magnitude. */
export const priceCell = (amount: number): string =>
  SHELL(
    `<div class="card" data-testid="cart">
       <div class="title" data-testid="cart/total">${amount.toLocaleString('de-DE')} €</div>
     </div>`,
    '.card { width: 64px; }',
  );

export const letters = (count: number): string =>
  'Benutzerkontoeinstellungen und Datenschutz Verwaltung für alle Konten'.slice(
    0,
    count,
  );
