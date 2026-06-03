import type { SnapshotReport } from './take-app-snapshot';

export interface SendContextPayload {
  hostName: string;
  tagList: unknown;
  coords: { x: number; y: number };
  outerHTML: string;
  snapshot: SnapshotReport[];
}
