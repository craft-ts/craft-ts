// Pure entry point (no Playwright): reading, writing and validating the
// versioned histories. The validation itself lives in @craft-ts/session-trace
// so the published log server applies exactly the same rules.
export { isSessionHistory, SESSION_HISTORY_FILE } from '@craft-ts/session-trace';
export { historyBytes, readBaselines, readHistory, recordRun } from './history-store.js';
export type { Baseline, HistoryRun, PortableSession, RunMeta, SessionHistory } from './history-store.js';
