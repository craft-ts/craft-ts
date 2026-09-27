import { craftService, type Provider } from '@craft-ts/core';
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
  /** Optional browser-side destination configured by `provideSendContextToAi`. */
  readonly endpoint?: string;
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

type UiHelper<T> = () => Generator<unknown, T, unknown>;
type UiService<T> = {
  helper: UiHelper<T>;
  provide: (value?: T | (() => T)) => unknown;
  metadata: { inject(): T };
};

function asUiService<T>(
  service: unknown,
  helperName: string,
  provideName: string,
  metadataName: string,
): UiService<T> {
  const api = service as Record<string, unknown>;
  return {
    helper: api[helperName] as UiHelper<T>,
    provide: api[provideName] as UiService<T>['provide'],
    metadata: api[metadataName] as UiService<T>['metadata'],
  };
}

const uiRendererService = craftService(
  { name: 'SendContextUiRenderer', providedIn: 'toProvide' },
  (inputs: { $provided: SendContextUiRenderer | (() => SendContextUiRenderer) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
);
const chatComponentService = craftService(
  { name: 'SendContextChatComponent', providedIn: 'toProvide' },
  (inputs: { $provided: SendContextChatComponent | (() => SendContextChatComponent) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
);
const launcherComponentService = craftService(
  { name: 'SendContextLauncherComponent', providedIn: 'toProvide' },
  (inputs: { $provided: SendContextLauncherComponent | (() => SendContextLauncherComponent) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
);
const contextMenuComponentService = craftService(
  { name: 'SendContextContextMenuComponent', providedIn: 'toProvide' },
  (inputs: { $provided: SendContextContextMenuComponent | (() => SendContextContextMenuComponent) }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
);
const chatSectionService = craftService(
  { name: 'SendContextChatSections', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextChatSection }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const chatActionService = craftService(
  { name: 'SendContextChatActions', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextChatAction }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const exportSectionService = craftService(
  { name: 'SendContextExportSections', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextExportSection }) =>
    inputs.$provided ? [inputs.$provided] : [],
);

const uiRenderer = asUiService<SendContextUiRenderer>(
  uiRendererService,
  'SendContextUiRenderer',
  'provideSendContextUiRenderer',
  'SEND_CONTEXT_UI_RENDERER_META_DATA',
);
const chatComponent = asUiService<SendContextChatComponent>(
  chatComponentService,
  'SendContextChatComponent',
  'provideSendContextChatComponent',
  'SEND_CONTEXT_CHAT_COMPONENT_META_DATA',
);
const launcherComponent = asUiService<SendContextLauncherComponent>(
  launcherComponentService,
  'SendContextLauncherComponent',
  'provideSendContextLauncherComponent',
  'SEND_CONTEXT_LAUNCHER_COMPONENT_META_DATA',
);
const contextMenuComponent = asUiService<SendContextContextMenuComponent>(
  contextMenuComponentService,
  'SendContextContextMenuComponent',
  'provideSendContextContextMenuComponent',
  'SEND_CONTEXT_CONTEXT_MENU_COMPONENT_META_DATA',
);
const chatSections = asUiService<readonly SendContextChatSection[]>(
  chatSectionService,
  'SendContextChatSections',
  'provideSendContextChatSections',
  'SEND_CONTEXT_CHAT_SECTIONS_META_DATA',
);
const chatActions = asUiService<readonly SendContextChatAction[]>(
  chatActionService,
  'SendContextChatActions',
  'provideSendContextChatActions',
  'SEND_CONTEXT_CHAT_ACTIONS_META_DATA',
);
const exportSections = asUiService<readonly SendContextExportSection[]>(
  exportSectionService,
  'SendContextExportSections',
  'provideSendContextExportSections',
  'SEND_CONTEXT_EXPORT_SECTIONS_META_DATA',
);

export const SendContextUiRenderer = uiRenderer.helper;
export const SendContextChatComponent = chatComponent.helper;
export const SendContextLauncherComponent = launcherComponent.helper;
export const SendContextContextMenuComponent = contextMenuComponent.helper;
export const SendContextChatSections = chatSections.helper;
export const SendContextChatActions = chatActions.helper;
export const SendContextExportSections = exportSections.helper;

export const ɵinjectSendContextUiRenderer = (): SendContextUiRenderer | null => {
  try { return uiRenderer.metadata.inject(); } catch { return null; }
};
export const ɵinjectSendContextChatComponent = (): SendContextChatComponent | null => {
  try { return chatComponent.metadata.inject(); } catch { return null; }
};
export const ɵinjectSendContextLauncherComponent = (): SendContextLauncherComponent | null => {
  try { return launcherComponent.metadata.inject(); } catch { return null; }
};
export const ɵinjectSendContextContextMenuComponent = (): SendContextContextMenuComponent | null => {
  try { return contextMenuComponent.metadata.inject(); } catch { return null; }
};
export const ɵinjectSendContextChatSections = (): readonly SendContextChatSection[] => {
  try { return chatSections.metadata.inject(); } catch { return []; }
};
export const ɵinjectSendContextChatActions = (): readonly SendContextChatAction[] => {
  try { return chatActions.metadata.inject(); } catch { return []; }
};
export const ɵinjectSendContextExportSections = (): readonly SendContextExportSection[] => {
  try { return exportSections.metadata.inject(); } catch { return []; }
};

export function provideSendContextUiRenderer<
  Renderer extends SendContextUiRenderer,
>(factory: () => Renderer): Provider {
  return uiRenderer.provide(factory) as Provider;
}

export function provideSendContextChatComponent<
  Chat extends SendContextChatComponent,
>(factory: () => Chat): Provider {
  return chatComponent.provide(factory) as Provider;
}

export function provideSendContextLauncherComponent<
  Launcher extends SendContextLauncherComponent,
>(factory: () => Launcher): Provider {
  return launcherComponent.provide(factory) as Provider;
}

export function provideSendContextContextMenuComponent<
  Menu extends SendContextContextMenuComponent,
>(factory: () => Menu): Provider {
  return contextMenuComponent.provide(factory) as Provider;
}

export function provideSendContextChatSection(
  section: SendContextChatSection,
): Provider {
  return (chatSections.provide as unknown as (
    value: SendContextChatSection,
  ) => unknown)(section) as Provider;
}

export function provideSendContextChatAction(
  action: SendContextChatAction,
): Provider {
  return (chatActions.provide as unknown as (
    value: SendContextChatAction,
  ) => unknown)(action) as Provider;
}

export function provideSendContextExportSection(
  section: SendContextExportSection,
): Provider {
  return (exportSections.provide as unknown as (
    value: SendContextExportSection,
  ) => unknown)(section) as Provider;
}

export function provideSendContextChatSectionsDefault(): Provider {
  return chatSections.provide() as Provider;
}

export function provideSendContextChatActionsDefault(): Provider {
  return chatActions.provide() as Provider;
}

export function provideSendContextExportSectionsDefault(): Provider {
  return exportSections.provide() as Provider;
}
