import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import { insertForm } from './insert-form';
import { computed, signal } from '@angular/core';
import { form, minLength, required } from '@angular/forms/signals';

type LoginData = {
  name: string;
  password: string;
};

// describe('insertSelectFormNode', () => {
//   it.todo('should apply modifier to the form node', () => {
//     TestBed.runInInjectionContext(() => {
//       const form = state(
//         {
//           name: '1',
//           password: '',
//         } satisfies LoginData,
//         insertForm(
//           insertSelectForm(
//             'password',
//             ({nodeModel}) => ({
//               disable: computed(() => true),
//               required: computed(() => false),
//               hidden: computed(() => false),
//               validators: [cRequired({
//                 when: ...
//               }), minLength(3, {
//                 when: ...
//               }), cValidate({
//                 name: 'customValidator',
//                 when: ...
//                 ...
//               }), cAsyncValiate("name", queryRef, {
//                 success: ...// todo overrride errors,
//                 error: ...// todo override errors
//                 exception: ...// todo override exception
//               })],
//             }),
//             ({ set }) => ({
//               //// todo should expose markAsDirty markAsTouched reset(only reset touxhed ans dirty)
//               clear: () => set((state) => ({ ...state, name: '' })),
//             }),
//             // some can only be apply on the node type
//             insertFormNodeAttributes(({nodeModel}) => ({
//               disable: computed(() => true),
//               required: computed(() => false),
//               hidden: computed(() => false),
//               validators: [cRequired({
//                 when: ...
//               }), minLength(3, {
//                 when: ...
//               }), cValidate({
//                 name: 'customValidator',
//                 when: ...
//                 ...
//               }), cAsyncValiate("name", queryRef, {
//                 success: ...// todo overrride errors,
//                 error: ...// todo override errors
//                 exception: ...// todo override exception
//               })],
//             })),
//             // insertMeta('info', () => ({

//             // }))
//             // // todo expose a activeErrors that should be displayed when the node is touched or dirty
//             // insertFormNodeValidators.matchFirst
//             // insertFormNodeValidators.matchFirst
//           ),
//         ),
//       );

//       expect(form.form.name.disabled()).toBe(true);
//       expect(form.form.password.disabled()).toBe(false);
//     });
//   });
// });

// describe('insertSelectFormNode', () => {
//   it.todo('should apply modifier to the form node', () => {
//     TestBed.runInInjectionContext(() => {
//       const form = state(
//         {
//           name: '1',
//           password: '',
//         } satisfies LoginData,
//         insertForm(
//           insertSelectFormNode(
//             'password',
//             () => ({
//               disable: computed(() => true),
//               required: computed(() => false),
//               hidden: computed(() => false),
//               validators: [cRequired({
//                 when: ...
//               }), minLength(3, {
//                 when: ...
//               }), cValidate({
//                 name: 'customValidator',
//                 when: ...
//                 ...
//               }), cAsyncValiate("name", queryRef, {
//                 success: ...// todo overrride errors,
//                 error: ...// todo override errors
//                 exception: ...// todo override exception
//               })],
//             }),
//             ({ set }) => ({
//               //// todo should expose markAsDirty markAsTouched reset(only reset touxhed ans dirty)
//               clear: () => set((state) => ({ ...state, name: '' })),
//             }),
//             // some can only be apply on the node type
//             insertFormNodeAttributes(({nodeModel}) => ({
//               disable: computed(() => true),
//               required: computed(() => false),
//               hidden: computed(() => false),
//               validators: [cRequired({
//                 when: ...
//               }), minLength(3, {
//                 when: ...
//               }), cValidate({
//                 name: 'customValidator',
//                 when: ...
//                 ...
//               }), cAsyncValiate("name", queryRef, {
//                 success: ...// todo overrride errors,
//                 error: ...// todo override errors
//                 exception: ...// todo override exception
//               })],
//             })),
//             // insertMeta('info', () => ({

//             // }))
//             // // todo expose a activeErrors that should be displayed when the node is touched or dirty
//             // insertFormNodeValidators.matchFirst
//             // insertFormNodeValidators.matchFirst
//           ),
//         ),
//       );

//       expect(form.form.name.disabled()).toBe(true);
//       expect(form.form.password.disabled()).toBe(false);
//     });
//   });
// });
