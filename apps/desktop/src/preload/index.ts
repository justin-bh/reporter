import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels.js';
import type {
  AboutInfo,
  CaptureDraft,
  ConnectionResult,
  DesktopSettings,
  EngagementLite,
  EvidenceLite,
  QueueItem,
  SettingsPatch,
  TagLite,
  UpdateCheckResult,
} from '../shared/types.js';

export interface SubmitPayload {
  engagementSlug: string;
  title: string;
  description: string;
  tagIds: number[];
  contentType: 'image' | 'codeblock' | 'none';
  filePath?: string;
  content?: string;
  contentSubtype?: string;
  /** When set, file this capture as a comment on the given evidence. */
  parentEvidenceUuid?: string;
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
  listEngagements: (): Promise<EngagementLite[]> => ipcRenderer.invoke(CH.listEngagements),
  listTags: (slug: string): Promise<TagLite[]> => ipcRenderer.invoke(CH.listTags, slug),
  createTag: (slug: string, input: { name: string; colorName: string }): Promise<TagLite> =>
    ipcRenderer.invoke(CH.createTag, slug, input),
  listEvidence: (slug: string): Promise<EvidenceLite[]> =>
    ipcRenderer.invoke(CH.listEvidence, slug),
  setEngagement: (slug: string | null): Promise<DesktopSettings> =>
    ipcRenderer.invoke(CH.setEngagement, slug),
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
