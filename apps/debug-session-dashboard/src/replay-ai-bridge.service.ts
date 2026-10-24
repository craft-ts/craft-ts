import {
  craftComputed,
  craftExpose,
  craftService,
  state,
} from '@craft-ts/core';

/** The current assistant chat hook, shared by the launcher and playbar. */
export const { AiChatBridge } = craftService(
  { name: 'aiChatBridge', providedIn: 'global' },
  function* () {
    const chat = yield* state(
      'chat',
      undefined as { readonly open: () => void } | undefined,
      function* ({ state, set }) {
        const available = yield* craftComputed('available', function* () {
          return (yield* state()) !== undefined;
        });
        return {
          setChat: (value: { readonly open: () => void }) => set(value),
          available,
        };
      },
    );

    yield* craftExpose('register', function* (open: () => void) {
      yield* chat.setChat({ open });
    });
    yield* craftExpose('open', function* () {
      (yield* chat())?.open();
    });
  },
);
