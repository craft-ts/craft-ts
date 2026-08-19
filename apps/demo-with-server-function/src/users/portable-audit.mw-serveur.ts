import { serverLayer } from '@craft-ts/core';

/**
 * Promise layer: the core does not know or import Effect here.
 *
 * `next({ context })` publishes the keys the rest of the chain reads. The
 * return type of the layer carries them, so `auditId` is a `string` downstream
 * rather than an `unknown` every consumer has to cast.
 */
export const portableAudit = serverLayer(
  'demo.portable-audit',
  async ({ next }) => {
    const auditId = crypto.randomUUID();
    const startedAt = Date.now();
    console.log(`demo.portable-audit audit=${auditId} start`);
    try {
      return await next({ context: { auditId, startedAt } });
    } finally {
      // Runs on success and on failure: the layer observes the whole downstream.
      console.log(
        `demo.portable-audit audit=${auditId} done in ${Date.now() - startedAt}ms`,
      );
    }
  },
);
