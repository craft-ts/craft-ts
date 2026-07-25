export const LOG_LEVELS = ['debug', 'info', 'log', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
