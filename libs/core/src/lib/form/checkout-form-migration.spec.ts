import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { craftException } from '../craft-exception';
import { mutation } from '../mutation';
import { query } from '../query';
import { state } from '../state';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { craftPipe } from '../craft-pipe';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertFormSubmit } from './insert-form-submit';
import { formTreeNeed, makeFormTreeInsert } from './make-form-tree-insert';
import {
  insertSelectFormTree,
  selectFormTree,
} from './insert-select-form-tree';
import { cAsyncValidate, cMaxLength, cRequired } from './validator';
import { craftUse } from '../craft-use';

type CheckoutForm = {
  delivery: {
    location: { city: string; country: string } | null;
    street: string;
    useSameAsBilling: boolean;
    billingLocation: { city: string; country: string } | null;
    billingStreet: string;
  };
  schedule: {
    type: 'asap' | 'scheduled';
    date: string;
    time: string;
  };
  notes: string;
  coupon: { code: string };
};

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('migrated checkout form', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('composes nested validators, async coupon validation and mutation submit', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitted = vi.fn();
      const couponQuery = craftUse(
        query('couponQuery', {
          method: (code: string) => code.trim(),
          loader: async ({ params: code }) => ({
            valid: code === 'SAVE20',
            message: code === 'SAVE20' ? undefined : 'Invalid coupon',
          }),
        }),
      );
      const submitMutation = craftUse(
        mutation('submitMutation', {
          method: (value: CheckoutForm) => value,
          loader: async ({ params }) => {
            submitted(params);
            return params;
          },
        }),
      );
      const initial = {
        delivery: {
          location: null,
          street: '',
          useSameAsBilling: true,
          billingLocation: null,
          billingStreet: '',
        },
        schedule: { type: 'asap', date: '', time: '' },
        notes: '',
        coupon: { code: '' },
      } as CheckoutForm satisfies CheckoutForm;
      let readModel: () => CheckoutForm = () => initial;

      const { insertDeliveryTree } = makeFormTreeInsert(
        'Delivery',
        formTreeNeed<CheckoutForm['delivery']>(),
        (deliveryContext) =>
          craftPipe(
            deliveryContext,
            (context) =>
              selectFormTree(context, 'street', (fieldContext) =>
                craftPipe(
                  fieldContext,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [cRequired(), cMaxLength({ maxLength: 250 })],
                  })),
                ),
              ),
            (context) =>
              selectFormTree(context, 'location', (fieldContext) =>
                craftPipe(
                  fieldContext,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [cRequired()],
                  })),
                ),
              ),
            (context) =>
              selectFormTree(context, 'billingStreet', (fieldContext) =>
                craftPipe(
                  fieldContext,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [
                      cRequired({
                        when: () => !readModel().delivery.useSameAsBilling,
                      }),
                    ],
                  })),
                ),
              ),
          ),
      );
      const { insertCouponTree } = makeFormTreeInsert(
        'Coupon',
        formTreeNeed<CheckoutForm['coupon']>(),
        (context) =>
          selectFormTree(context, 'code', (fieldContext) =>
            craftPipe(
              fieldContext,
              insertNoopTypingAnchor,
              insertFormAttributes(() => ({
                validators: [
                  cAsyncValidate(couponQuery, {
                    name: 'couponValidation',
                    when: () => readModel().coupon.code.length > 0,
                    exceptionsOnSuccess: ({ validateAsyncCraftResource }) =>
                      craftUse(validateAsyncCraftResource.value())?.valid
                        ? undefined
                        : craftException(
                            { code: 'couponInvalid' },
                            { message: 'Invalid coupon' },
                          ),
                  }),
                ],
              })),
            ),
          ),
      );

      const checkout = craftUse(
        state(
          'checkout',
          initial,
          insertForm(
            insertSelectFormTree('delivery', insertDeliveryTree()),
            insertSelectFormTree('coupon', insertCouponTree()),
            insertFormSubmit(submitMutation),
          ),
        ),
      );
      readModel = () => craftUse(checkout());

      const deliveryForm = checkout.form.selectDelivery();
      deliveryForm?.selectStreet();
      deliveryForm?.selectLocation();
      deliveryForm?.selectBillingStreet();
      const couponForm = checkout.form.selectCoupon();
      couponForm?.selectCode();
      await Promise.resolve();

      expect(craftUse(checkout.form.delivery.valid())).toBe(false);
      checkout.form.delivery.street.set('123 Main St');
      checkout.form.delivery.location.set({
        city: 'Paris',
        country: 'France',
      });
      TestBed.tick();
      expect(craftUse(checkout.form.delivery.valid())).toBe(true);

      checkout.form.delivery.useSameAsBilling.set(false);
      TestBed.tick();
      expect(craftUse(checkout.form.delivery.valid())).toBe(false);
      checkout.form.delivery.billingStreet.set('456 Oak Ave');
      TestBed.tick();
      expect(craftUse(checkout.form.delivery.valid())).toBe(true);

      checkout.form.coupon.code.set('INVALID');
      TestBed.tick();
      await vi.runAllTimersAsync();
      expect(craftUse(checkout.form.coupon.code.invalid())).toBe(true);

      checkout.form.coupon.code.set('SAVE20');
      TestBed.tick();
      await vi.runAllTimersAsync();
      expect(craftUse(checkout.form.coupon.code.valid())).toBe(true);

      checkout.form.submit();
      await vi.runAllTimersAsync();
      expect(submitted).toHaveBeenCalledOnce();
    });
  });
});
