/**
 * Automatic resume-assistant approval is restricted to loopback origins. The
 * log server trusts the `Origin` header of a decision, which a local process
 * can forge: this keeps web pages out, not programs on the same machine.
 */
export function isLoopbackResumeAssistantOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, '');
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}
