/** Types shared between the main process, preload bridge, and renderer. */

export interface DesktopSettings {
  serverUrl: string;
  accessKey: string;
  /** Whether a secret key is stored (the secret itself is never sent to the renderer). */
  hasSecret: boolean;
  currentOperationSlug: string | null;
  /** Capture command template with a `$FILE` placeholder (non-macOS / override). */
  captureCommand: string;
  hotkeys: { captureArea: string; captureWindow: string };
  /** True when the OS secret store is weak (Linux basic_text) — surfaced as a warning. */
  weakSecretStorage: boolean;
}

/** A patch to settings from the renderer. `secret` is write-only. */
export interface SettingsPatch {
  serverUrl?: string;
  accessKey?: string;
  secret?: string;
  currentOperationSlug?: string | null;
  captureCommand?: string;
  hotkeys?: { captureArea: string; captureWindow: string };
}

export type QueueStatus = 'pending' | 'submitting' | 'submitted' | 'failed';

export interface QueueItem {
  id: string;
  operationSlug: string;
  contentType: 'image' | 'codeblock' | 'none';
  /** Absolute path to the captured file (image evidence). */
  filePath?: string;
  /** Inline text (codeblock/note). */
  content?: string;
  contentSubtype?: string;
  description: string;
  tagIds: number[];
  occurredAt: string;
  status: QueueStatus;
  serverUuid?: string;
  error?: string;
  createdAt: string;
}

export interface OperationLite {
  slug: string;
  name: string;
}

export interface TagLite {
  id: number;
  name: string;
  colorName: string;
}

export interface ConnectionResult {
  ok: boolean;
  user?: string;
  error?: string;
}

/** Draft passed to the compose window after a capture. */
export interface CaptureDraft {
  contentType: 'image' | 'codeblock' | 'none';
  filePath?: string;
  content?: string;
  /** Data URL for previewing an image draft in the renderer. */
  previewDataUrl?: string;
}
