import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels.js';
import type {
  AboutInfo,
  CaptureDraft,
  ConnectionResult,
  DesktopSettings,
  OperationLite,
  QueueItem,
  SettingsPatch,
  TagLite,
  UpdateCheckResult,
} from '../shared/types.js';

export interface SubmitPayload {
  operationSlug: string;
  description: string;
  tagIds: number[];
  contentType: 'image' | 'codeblock' | 'none';
  filePath?: string;
  content?: string;
  contentSubtype?: string;
}

function on(channel: string, cb: (...args: any[]) => void): () => void {
  const listener = (_e: unknown, ...args: any[]) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const reporter = {
  getSettings: (): Promise<DesktopSettings> => ipcRenderer.invoke(CH.getSettings),
  saveSettings: (patch: SettingsPatch): Promise<DesktopSettings> =>
    ipcRenderer.invoke(CH.saveSettings, patch),
  testConnection: (): Promise<ConnectionResult> => ipcRenderer.invoke(CH.testConnection),
  listOperations: (): Promise<OperationLite[]> => ipcRenderer.invoke(CH.listOperations),
  listTags: (slug: string): Promise<TagLite[]> => ipcRenderer.invoke(CH.listTags, slug),
  setOperation: (slug: string | null): Promise<DesktopSettings> =>
    ipcRenderer.invoke(CH.setOperation, slug),
  getQueue: (): Promise<QueueItem[]> => ipcRenderer.invoke(CH.getQueue),
  getDraft: (): Promise<CaptureDraft | null> => ipcRenderer.invoke(CH.getDraft),
  submitDraft: (payload: SubmitPayload): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.submitDraft, payload),
  retryItem: (id: string): Promise<void> => ipcRenderer.invoke(CH.retryItem, id),
  removeItem: (id: string): Promise<void> => ipcRenderer.invoke(CH.removeItem, id),
  captureArea: (): Promise<void> => ipcRenderer.invoke(CH.captureArea),
  captureWindow: (): Promise<void> => ipcRenderer.invoke(CH.captureWindow),
  getAbout: (): Promise<AboutInfo> => ipcRenderer.invoke(CH.getAbout),
  checkForUpdates: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(CH.checkForUpdates),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(CH.openExternal, url),

  onQueueChanged: (cb: () => void) => on(CH.queueChanged, cb),
  onDraftReady: (cb: () => void) => on(CH.draftReady, cb),
  onNavigate: (cb: (view: string) => void) => on(CH.navigate, cb),
  onCaptureError: (cb: (message: string) => void) => on('event:capture-error', cb),
};

export type ReporterBridge = typeof reporter;

contextBridge.exposeInMainWorld('reporter', reporter);
