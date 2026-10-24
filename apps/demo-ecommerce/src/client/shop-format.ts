import { isCraftException } from '@craft-ts/core';
import type { CartLine, Category, ChoiceGroup, Product } from '../shared/model';

const currency = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const euros = (value: number) => currency.format(value);

const categoryEmoji: Readonly<Record<string, string>> = { coffee: '☕', pastries: '🥐', drinks: '🧃' };
export const productEmoji = (product: Pick<Product, 'emoji' | 'categoryId'>) => product.emoji?.trim() || categoryEmoji[product.categoryId] || '🍽️';

const knownTones: Readonly<Record<string, string>> = { coffee: 'cocoa', pastries: 'honey', drinks: 'peach' };
const otherTones = ['sage', 'plum', 'sky'];
/** Teinte du visuel d'un produit, stable pour une catégorie donnée. */
export function categoryTone(categoryId: string): string {
  const known = knownTones[categoryId];
  if (known) return known;
  let hash = 0;
  for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return otherTones[hash % otherTones.length] ?? 'sage';
}

export const categoryName = (categories: readonly Category[], id: string) => categories.find((category) => category.id === id)?.name ?? 'Sans catégorie';

export const lineKey = (line: Pick<CartLine, 'productId' | 'selections'>) => `${line.productId}|${JSON.stringify(line.selections ?? [])}`;

export function stockLabel(stock: number): string {
  if (stock <= 0) return 'Épuisé';
  if (stock <= 3) return `Plus que ${stock} en stock`;
  return 'En stock';
}

export function groupRule(group: ChoiceGroup): string {
  if (group.min === group.max) return `${group.max} choix`;
  if (group.min === 0) return group.max === 1 ? 'Facultatif · 1 choix' : `Facultatif · jusqu’à ${group.max}`;
  return `${group.min} à ${group.max} choix`;
}

/** Identifiant lisible et unique à partir d'un nom saisi. */
export function slugFrom(name: string, taken: readonly string[], fallback: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
  let candidate = base;
  for (let index = 2; taken.includes(candidate); index++) candidate = `${base}-${index}`;
  return candidate;
}

export function eventValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target.value : '';
}

/** Échec renvoyé par une fonction serveur (exception Craft), lisible par l'interface. */
export function failureOf(value: unknown): { readonly code: string | undefined; readonly message: string } | undefined {
  if (!isCraftException(value)) return undefined;
  const payload: unknown = value.payload;
  if (typeof payload !== 'object' || payload === null) return { code: undefined, message: 'Le serveur ne répond pas. Réessayez dans un instant.' };
  return { code: 'code' in payload ? String(payload.code) : undefined, message: 'message' in payload ? String(payload.message) : 'Une erreur est survenue.' };
}
