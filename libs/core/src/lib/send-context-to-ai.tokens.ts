import type { SnapshotReport } from './take-app-snapshot';

export interface SendContextPayload {
  hostName: string;
  tagList: unknown;
  coords: { x: number; y: number };
  readonly clickedElement?: {
    tagName: string;
    textContent: string;
    outerHTML: string;
  };
  outerHTML: string;
  snapshot: SnapshotReport[];
}
