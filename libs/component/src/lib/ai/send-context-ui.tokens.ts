import { InjectionToken, type Provider } from '../host-runtime';
import type { CraftComponent } from '../types';
import type {
  SendContextClip,
  SendContextEvent,
  SendContextPayload,
  SendContextSession,
  SendContextTarget,
} from '@craft-ts/core';

/** A complete renderer. It receives a live UI context and owns the whole UI. */
export type SendContextUiRenderer = CraftComponent<any>;
/** A chat component used by the default renderer. */
export type SendContextChatComponent = CraftComponent<any>;
export type SendContextLauncherComponent = CraftComponent<any>;
export type SendContextContextMenuComponent = CraftComponent<any>;

export interface SendContextUiContext {
  readonly session: SendContextSession;
  /**
   * Everything below reads through a signal, so a renderer that touches one of
   * them inside a template callback re-renders when the session moves.
   */
  readonly events: readonly SendContextEvent[];
  readonly clips: readonly SendContextClip[];
  readonly targets: readonly SendContextTarget[];
  readonly recording: boolean;
  /**
   * The component context captured by the last right-click, and the app
   * snapshot reports collected for it. Absent when the chat was opened from
   * the launcher without ever targeting a component.
   */
  readonly payload: SendContextPayload | undefined;
  /** The element the payload was captured on, for the DOM + CSS capture. */
  readonly captureElement: Element | undefined;
  readonly chatSections: readonly SendContextChatSection[];
  readonly chatActions: readonly SendContextChatAction[];
  readonly exportSections: readonly SendContextExportSection[];
  readonly selectedClipId?: string;
  addTarget(target: SendContextTarget): void;
  removeTarget(target: SendContextTarget): void;
  selectClip(id: string | undefined): void;
  close(): void;
}

export interface SendContextChatSection {
  readonly id: string;
  readonly label: string;
  readonly render?: unknown;
}
export interface SendContextChatAction {
  readonly id: string;
  readonly label: string;
  readonly run: (context: SendContextUiContext) => void;
}
export interface SendContextExportSection {
  readonly id: string;
  readonly label: string;
  readonly render?: unknown;
}

export const SEND_CONTEXT_UI_RENDERER = new InjectionToken<
  SendContextUiRenderer | undefined
>('SEND_CONTEXT_UI_RENDERER', { factory: () => undefined });
export const SEND_CONTEXT_CHAT_COMPONENT =
  new InjectionToken<SendContextChatComponent>('SEND_CONTEXT_CHAT_COMPONENT');
export const SEND_CONTEXT_LAUNCHER_COMPONENT =
  new InjectionToken<SendContextLauncherComponent>(
    'SEND_CONTEXT_LAUNCHER_COMPONENT',
  );
export const SEND_CONTEXT_CONTEXT_MENU_COMPONENT =
  new InjectionToken<SendContextContextMenuComponent>(
    'SEND_CONTEXT_CONTEXT_MENU_COMPONENT',
  );

export const SEND_CONTEXT_CHAT_SECTION = new InjectionToken<
  readonly SendContextChatSection[]
>('SEND_CONTEXT_CHAT_SECTION', { factory: () => [], multi: true });
export const SEND_CONTEXT_CHAT_ACTION = new InjectionToken<
  readonly SendContextChatAction[]
>('SEND_CONTEXT_CHAT_ACTION', { factory: () => [], multi: true });
export const SEND_CONTEXT_EXPORT_SECTION = new InjectionToken<
  readonly SendContextExportSection[]
>('SEND_CONTEXT_EXPORT_SECTION', { factory: () => [], multi: true });

export function provideSendContextUiRenderer<
  Renderer extends SendContextUiRenderer,
>(factory: () => Renderer): Provider {
  return { provide: SEND_CONTEXT_UI_RENDERER, useFactory: factory };
}

export function provideSendContextChatComponent<
  Chat extends SendContextChatComponent,
>(factory: () => Chat): Provider {
  return { provide: SEND_CONTEXT_CHAT_COMPONENT, useFactory: factory };
}

export function provideSendContextChatSection(
  section: SendContextChatSection,
): Provider {
  return { provide: SEND_CONTEXT_CHAT_SECTION, useValue: section, multi: true };
}

export function provideSendContextChatAction(
  action: SendContextChatAction,
): Provider {
  return { provide: SEND_CONTEXT_CHAT_ACTION, useValue: action, multi: true };
}

export function provideSendContextExportSection(
  section: SendContextExportSection,
): Provider {
  return {
    provide: SEND_CONTEXT_EXPORT_SECTION,
    useValue: section,
    multi: true,
  };
}
