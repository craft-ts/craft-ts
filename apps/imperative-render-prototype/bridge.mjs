// EXPERIMENT ONLY: expose a renderer-owned slot through node directives without
// changing the published API. Fail closed if the insertion point changes.
import assert from 'node:assert/strict';
export function prototypeBridge() {
  return {
    name: 'prototype-owned-slots',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/libs/component/src/lib/render/interpreter.ts')) return;
      const marker = '    this.registrationRelease = ɵregisterCraftTarget(\n';
      assert.equal(source.split(marker).length, 2);
      return source.replace(
        marker,
        `
    const prototypeChildren = new Set();
    this.environmentInjector.get(DestroyRef).onDestroy(() => {
      for (const child of prototypeChildren) child.destroy();
      prototypeChildren.clear();
    });
    Object.assign(nodeContext, {
      prototypeMount: (node, host, key) => {
        const view = mountNode(node, host, null, childContext(context, {
          injector: this.environmentInjector,
          identity: ɵchildCraftRenderIdentity(context.identity, 'prototype-slot', key),
        }));
        const slot = {
          update: next => { if (!view.patch(next)) throw new Error('Prototype slot replacement is unsupported'); },
          destroy: () => {
            if (!prototypeChildren.delete(slot)) return;
            view.destroy();
          },
        };
        prototypeChildren.add(slot);
        return slot;
      },
    });
` + marker,
      );
    },
  };
}
