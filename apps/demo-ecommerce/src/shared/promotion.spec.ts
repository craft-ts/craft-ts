import { describe, expect, it } from 'vitest';
import { isPromotionActive, promotedPrice, promotionCountdown, weeklyPromotion } from './promotion';

// Mardi 10 novembre 2026, 14 h 30, heure locale.
const tuesday = new Date(2026, 10, 10, 14, 30, 0).getTime();
const croissant = { kind: 'simple' as const, categoryId: 'pastries', price: 3 };
const espresso = { kind: 'simple' as const, categoryId: 'coffee', price: 3.5 };
const pause = { kind: 'formule' as const, categoryId: 'pastries', price: 8 };

describe('the weekly promotion', () => {
  it('ends on the coming Sunday, at 23:59:59', () => {
    const promotion = weeklyPromotion(tuesday);
    expect(new Date(promotion.endsAt).getTime()).toBe(new Date(2026, 10, 15, 23, 59, 59).getTime());
    expect(promotion).toMatchObject({ id: 'semaine-patisseries-2026-11-15', categoryId: 'pastries', percentOff: 20 });
    // On the Sunday itself, it is that day's; the Monday after, the next week's.
    expect(weeklyPromotion(new Date(2026, 10, 15, 9).getTime()).id).toBe('semaine-patisseries-2026-11-15');
    expect(weeklyPromotion(new Date(2026, 10, 16, 0, 0, 1).getTime()).id).toBe('semaine-patisseries-2026-11-22');
  });

  it('takes 20 % off the pastries while it runs, and nothing else', () => {
    const promotion = weeklyPromotion(tuesday);
    expect(promotedPrice(croissant, promotion, tuesday)).toBe(2.4);
    expect(promotedPrice(espresso, promotion, tuesday)).toBe(3.5);
    expect(promotedPrice(pause, promotion, tuesday)).toBe(8);
    expect(promotedPrice(croissant, undefined, tuesday)).toBe(3);
  });

  it('counts down to its end, then is over and the price is back', () => {
    const promotion = weeklyPromotion(tuesday);
    expect(promotionCountdown(promotion, tuesday)).toBe('5 j 09 h 29 min 59 s');
    const sundayEvening = new Date(2026, 10, 15, 23, 58, 30).getTime();
    expect(promotionCountdown(promotion, sundayEvening)).toBe('01 min 29 s');
    const nextWeek = new Date(2026, 10, 17, 10).getTime();
    expect(promotionCountdown(promotion, nextWeek)).toBe('Terminée');
    expect(isPromotionActive(promotion, nextWeek)).toBe(false);
    expect(promotedPrice(croissant, promotion, nextWeek)).toBe(3);
  });
});
