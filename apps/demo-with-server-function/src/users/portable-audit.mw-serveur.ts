import { portableServerMiddleware } from '@craft-ts/core';

/** Promise middleware: the core does not know or import Effect here. */
export const portableAudit = portableServerMiddleware(
  'demo.portable-audit',
  async ({ next }) => {
    const auditId = crypto.randomUUID();
    console.log(`demo.portable-audit audit=${auditId}`);
    return next({ context: { auditId } });
  },
);
