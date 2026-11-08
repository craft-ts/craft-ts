import type { Browser, Frame } from '@playwright/test';
import { collectLayoutDigest, type LayoutDigest } from '@craft-ts/style-testing/digest';
import { expect } from './fixtures';

type ArchivedSession = { id: string; startUrl: string; createdAt: string; status: string; test?: unknown };

/** What the suite measures at each moment: the layout, and the text a person reads. */
export type Measured = { digest: LayoutDigest; text: string };

/** The page as a person sees it: from `body`, never the `head` (styles, the runner's own). */
export async function measurePage(frame: Frame): Promise<Measured> {
  return {
    digest: await collectLayoutDigest(frame, { root: 'body' }),
    text: await frame.evaluate(() => document.body.innerText),
  };
}

/** The e2e harness's addresses (see `playwright.config.ts`). */
export function harness(baseURL: string | undefined): { server: string; dashboard: string; app: string } {
  const server = process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'];
  const dashboard = process.env['CRAFT_E2E_SESSION_DASHBOARD_ORIGIN'];
  if (!server || !dashboard || !baseURL) throw new Error('Les origines du harnais e2e ne sont pas définies.');
  return { server, dashboard: `${dashboard}/`, app: baseURL };
}

/**
 * A purchase made as a person makes it: a browser of its own (no test
 * metadata), the confirmation read until the cart sync it started ends (a tab
 * closed in the middle of a request leaves a recording no replay can finish),
 * then the tab closed. Returns the id of the archived session.
 */
export async function recordPurchaseByHand(browser: Browser, baseURL: string, server: string): Promise<string> {
  const startedAt = new Date().toISOString();
  const person = await browser.newContext({ baseURL });
  const page = await person.newPage();
  await page.goto('/catalogue');
  await page.getByRole('button', { name: '+ Ajouter' }).first().click();
  await page.getByRole('link', { name: /Panier/ }).click();
  await page.getByRole('link', { name: /Passer commande/ }).click();
  await page.getByRole('button', { name: 'Confirmer la commande' }).click();
  await expect(page.getByText('Merci pour votre commande')).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Closed as a tab is closed: the page says it is done before it goes.
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => person.pages().length).toBe(0);
  await person.close();
  return archivedSince(server, baseURL, startedAt);
}

/**
 * A visit as a person makes one, with the gestures a scripted purchase leaves
 * out: the pointer lingering over products, a search typed key by key with a
 * typo corrected, a sign-in typed with its password and sent with Enter,
 * then the purchase. Returns the id of the archived session.
 */
export async function recordVisitByHand(browser: Browser, baseURL: string, server: string): Promise<string> {
  const startedAt = new Date().toISOString();
  const person = await browser.newContext({ baseURL });
  const page = await person.newPage();
  await page.goto('/connexion');
  await page.getByLabel('E-mail').click();
  await page.keyboard.type('ines@atelier.demo', { delay: 30 });
  await page.getByLabel('Mot de passe').click();
  await page.keyboard.type('atelier-produit', { delay: 30 });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /Bonjour Inès/ })).toBeVisible();
  await page.getByRole('link', { name: 'Aller à la boutique' }).click();
  const products = page.getByRole('button', { name: '+ Ajouter' });
  await expect(products.first()).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await products.nth(index).hover();
    await page.waitForTimeout(120);
  }
  const search = page.getByRole('searchbox', { name: 'Rechercher un produit' });
  await search.click();
  await page.keyboard.type('croiz', { delay: 90 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type('s', { delay: 90 });
  // Every key reaches the field: the first one used to be written over.
  await expect(search).toHaveValue('crois');
  await expect(products.first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await products.first().click();
  await page.getByRole('link', { name: /Panier/ }).click();
  await page.getByRole('link', { name: /Passer commande/ }).click();
  await page.getByRole('button', { name: 'Confirmer la commande' }).click();
  await expect(page.getByText('Merci pour votre commande')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => person.pages().length).toBe(0);
  await person.close();
  return archivedSince(server, baseURL, startedAt);
}

async function archivedSince(server: string, baseURL: string, startedAt: string): Promise<string> {
  let found: ArchivedSession | undefined;
  await expect.poll(async () => {
    const response = await fetch(`${server}/sessions`);
    const body = await response.json() as { sessions?: ArchivedSession[] };
    found = (body.sessions ?? []).find((session) =>
      session.createdAt >= startedAt && !session.test && new URL(session.startUrl).origin === new URL(baseURL).origin);
    return found?.status;
  }, { timeout: 20_000 }).toBe('completed');
  return found!.id;
}

/**
 * Installed in the replayed page only: the confirmation button loses its
 * handler and its default action — it does nothing, as after a broken change.
 */
export const DISCONNECT_CONFIRM_BUTTON = `(() => {
  if (window === window.top) return;
  addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || !/Confirmer la commande/.test(button.textContent ?? '')) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);
})();`;

/** Installed in the replayed page only: a style change, as a pull request would make. */
export const RESTYLE_HEADINGS = `(() => {
  if (window === window.top) return;
  const install = () => {
    const style = document.createElement('style');
    style.textContent = 'h1, h2 { letter-spacing: 0.08em !important; color: rgb(160, 40, 40) !important; }';
    document.head.appendChild(style);
  };
  if (document.head) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();`;
