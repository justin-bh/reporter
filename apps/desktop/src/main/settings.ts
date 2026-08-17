import { platform } from 'node:process';
import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { DesktopSettings, SettingsPatch } from '../shared/types.js';

interface Persisted {
  serverUrl: string;
  accessKey: string;
  /** base64 of the (encrypted, when possible) secret key. */
  secretEnc: string | null;
  currentEngagementSlug: string | null;
  captureCommand: string;
  hotkeys: { captureArea: string; captureWindow: string };
}

function defaultCaptureCommand(): string {
  if (platform === 'darwin') return 'screencapture -i $FILE';
  if (platform === 'linux') return 'gnome-screenshot -a -f $FILE';
  return ''; // Windows uses the built-in overlay/native path
}

const store = new Store<Persisted>({
  name: 'reporter-settings',
  defaults: {
    serverUrl: '',
    accessKey: '',
    secretEnc: null,
    currentEngagementSlug: null,
    captureCommand: defaultCaptureCommand(),
    hotkeys: {
      captureArea: 'CommandOrControl+Shift+7',
      captureWindow: 'CommandOrControl+Shift+8',
    },
  },
});

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** True on a Linux Wayland session, where Electron global shortcuts don't fire. */
export function isWaylandSession(): boolean {
  if (platform !== 'linux') return false;
  const t = (process.env['XDG_SESSION_TYPE'] ?? '').toLowerCase();
  return t === 'wayland' || Boolean(process.env['WAYLAND_DISPLAY']);
}

/** Detect a weak secret-storage backend (Linux without a keyring). */
export function weakSecretStorage(): boolean {
  try {
    if (!encryptionAvailable()) return true;
    if (platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
      return safeStorage.getSelectedStorageBackend() === 'basic_text';
    }
    return false;
  } catch {
    return true;
  }
}

export function getSettings(): DesktopSettings {
  return {
    serverUrl: store.get('serverUrl'),
    accessKey: store.get('accessKey'),
    hasSecret: Boolean(store.get('secretEnc')),
    currentEngagementSlug: store.get('currentEngagementSlug'),
    captureCommand: store.get('captureCommand'),
    hotkeys: store.get('hotkeys'),
    weakSecretStorage: weakSecretStorage(),
    globalShortcutsAvailable: !isWaylandSession(),
  };
}

export function saveSettings(patch: SettingsPatch): DesktopSettings {
  if (patch.serverUrl !== undefined) store.set('serverUrl', patch.serverUrl.replace(/\/+$/, ''));
  if (patch.accessKey !== undefined) store.set('accessKey', patch.accessKey);
  if (patch.currentEngagementSlug !== undefined)
    store.set('currentEngagementSlug', patch.currentEngagementSlug);
  if (patch.captureCommand !== undefined) store.set('captureCommand', patch.captureCommand);
  if (patch.hotkeys !== undefined) store.set('hotkeys', patch.hotkeys);

  if (patch.secret !== undefined) {
    if (patch.secret === '') {
      store.set('secretEnc', null);
    } else if (encryptionAvailable()) {
      store.set('secretEnc', safeStorage.encryptString(patch.secret).toString('base64'));
    } else {
      // No OS encryption available — store base64 (documented weak fallback).
      store.set('secretEnc', Buffer.from(patch.secret, 'utf8').toString('base64'));
    }
  }

  return getSettings();
}

/** Decrypt and return the stored secret key (main process only). */
export function getSecret(): string | null {
  const enc = store.get('secretEnc');
  if (!enc) return null;
  const buf = Buffer.from(enc, 'base64');
  try {
    if (encryptionAvailable()) return safeStorage.decryptString(buf);
    return buf.toString('utf8');
  } catch {
    return buf.toString('utf8');
  }
}

export interface Credentials {
  serverUrl: string;
  accessKey: string;
  secret: string;
}

/** The full credential set for building an API client, or null if incomplete. */
export function getCredentials(): Credentials | null {
  const serverUrl = store.get('serverUrl');
  const accessKey = store.get('accessKey');
  const secret = getSecret();
  if (!serverUrl || !accessKey || !secret) return null;
  return { serverUrl, accessKey, secret };
}

export function getCurrentEngagement(): string | null {
  return store.get('currentEngagementSlug');
}

export function getHotkeys() {
  return store.get('hotkeys');
}

export function getCaptureCommand(): string {
  return store.get('captureCommand');
}
