/**
 * The review surface: a queue, a diff anybody can read, and a reason.
 *
 * Split in two on purpose. `queue.ts` holds everything worth testing and needs
 * no socket; `server.ts` is the thin shell that puts it on localhost.
 */
export * from './queue.js';
export * from './server.js';
