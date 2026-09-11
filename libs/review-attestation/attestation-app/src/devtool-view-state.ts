import type { Mention } from './annotation-text';

export type DevtoolView = 'assets' | 'visual' | 'template' | 'review';
export type UrlDevtoolView = DevtoolView | '';
export type RetirementReason = 'superseded' | 'defect' | 'derivation';
export type KindFilter = 'all' | 'visual' | 'template' | 'removal';
export type StateFilter =
  | 'all'
  | 'current'
  | 'renewed'
  | 'missing'
  | 'review'
  | 'removed';
export type DirectionFilter = 'all' | 'render' | 'command';
export type ZoomMode = 'fit' | 'actual';
/**
 * Which artefact is on screen.
 *
 * `auto` is the state a card opens in, and it is not a third view: it defers
 * to the replay's own fidelity check, so a frozen page that fails that check
 * is never the first thing a reviewer sees. Choosing either view pins it —
 * a reviewer who asks for the page after being sent to the photograph gets
 * the page, broken and labelled as such.
 */
export type EvidenceView = 'auto' | 'replay' | 'image';

export const initialDevtoolView = (): DevtoolView => 'review';
export const initialRetirementReason = (): RetirementReason => 'superseded';
export const initialKindFilter = (): KindFilter => 'all';
export const initialStateFilter = (): StateFilter => 'all';
export const initialDirectionFilter = (): DirectionFilter => 'all';
export const initialZoom = (): ZoomMode => 'fit';
export const initialEvidenceView = (): EvidenceView => 'auto';
export const initialMentions = (): readonly Mention[] => [];
export const initialSelection = (): readonly string[] => [];

export const isDevtoolView = (value: string): value is DevtoolView =>
  value === 'assets' ||
  value === 'visual' ||
  value === 'template' ||
  value === 'review';

export const stringQueryParamCodec = {
  decode: (value: string): string => value,
  encode: (value: string): string => value,
};

export const devtoolViewQueryParamCodec = {
  decode: (value: string): UrlDevtoolView =>
    isDevtoolView(value) ? value : '',
  encode: (value: UrlDevtoolView): string => value,
};

export const isRetirementReason = (value: string): value is RetirementReason =>
  value === 'superseded' || value === 'defect' || value === 'derivation';
export const isKindFilter = (value: string): value is KindFilter =>
  value === 'all' ||
  value === 'visual' ||
  value === 'template' ||
  value === 'removal';
export const isStateFilter = (value: string): value is StateFilter =>
  value === 'all' ||
  value === 'current' ||
  value === 'renewed' ||
  value === 'missing' ||
  value === 'review' ||
  value === 'removed';
export const isDirectionFilter = (value: string): value is DirectionFilter =>
  value === 'all' || value === 'render' || value === 'command';
export const isZoomMode = (value: string): value is ZoomMode =>
  value === 'fit' || value === 'actual';
