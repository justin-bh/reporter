import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { clipboard, shell } from 'electron';
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron';
import type { AboutInfo, CaptureDraft, OperationLite, SettingsPatch, TagLite } from '../shared/types.js';
import { CH } from '../shared/channels.js';
import {
  getCurrentOperation,
  getHotkeys,
  getSettings,
  saveSettings,
} from './settings.js';
import { addItem, listQueue, removeItem, updateItem } from './queue.js';
import { makeClient } from './reporter-client.js';
import { drainQueue } from './uploader.js';
import { captureScreenshot, type CaptureMode } from './capture.js';
import { BUILD_INFO } from './build-info.js';
import { checkForUpdates } from './updates.js';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingDraft: CaptureDraft | null = null;
let cachedOperations: OperationLite[] = [];

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL']);

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 460,
    height: 640,
    show: false,
    resizable: true,
    title: 'reporter',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('close', (e) => {
    // Keep running in the tray instead of quitting.
    if (!(app as unknown as { isQuiting?: boolean }).isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'));

  return win;
}

function showView(view: 'history' | 'settings' | 'compose' | 'about'): void {
  if (!mainWindow) mainWindow = createWindow();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send(CH.navigate, view);
}

function notifyQueueChanged(): void {
  mainWindow?.webContents.send(CH.queueChanged);
}

async function drain(): Promise<void> {
  await drainQueue(notifyQueueChanged);
}

// ---------------------------------------------------------------------------
// Capture → compose
// ---------------------------------------------------------------------------

async function captureAndCompose(mode: CaptureMode): Promise<void> {
  try {
    const filePath = await captureScreenshot(mode);
    if (!filePath) return; // cancelled
    const preview = await readFile(filePath)
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => undefined);
    pendingDraft = { contentType: 'image', filePath, previewDataUrl: preview };
    showView('compose');
    mainWindow?.webContents.send(CH.draftReady);
  } catch (err) {
    pendingDraft = null;
    // Surface the error in the compose view so it is not silent.
    showView('settings');
    mainWindow?.webContents.send('event:capture-error', err instanceof Error ? err.message : String(err));
  }
}

function composeCodeblockFromClipboard(): void {
  const text = clipboard.readText();
  pendingDraft = { contentType: 'codeblock', content: text };
  showView('compose');
  mainWindow?.webContents.send(CH.draftReady);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function trayIconPath(): string {
  // In a packaged app the icon is shipped via extraResources (resourcesPath);
  // in dev it sits in the source build/ folder.
  return app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(import.meta.dirname, '../../build/tray.png');
}

function buildTray(): void {
  const icon = nativeImage.createFromPath(trayIconPath());
  if (!tray) {
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('reporter');
  }

  const current = getCurrentOperation();
  const opsSubmenu =
    cachedOperations.length > 0
      ? cachedOperations.map((op) => ({
          label: op.name,
          type: 'radio' as const,
          checked: op.slug === current,
          click: () => {
            saveSettings({ currentOperationSlug: op.slug });
            buildTray();
          },
        }))
      : [{ label: 'No operations loaded — open Settings', enabled: false }];

  const menu = Menu.buildFromTemplate([
    { label: 'Capture area', click: () => captureAndCompose('area') },
    { label: 'Capture window', click: () => captureAndCompose('window') },
    { label: 'Add code block from clipboard', click: composeCodeblockFromClipboard },
    { type: 'separator' },
    { label: 'Operation', submenu: opsSubmenu },
    { type: 'separator' },
    { label: 'History', click: () => showView('history') },
    { label: 'Settings', click: () => showView('settings') },
    { label: `About reporter (v${BUILD_INFO.version})`, click: () => showView('about') },
    { type: 'separator' },
    {
      label: 'Quit reporter',
      click: () => {
        (app as unknown as { isQuiting?: boolean }).isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------------------
// Global shortcuts (best-effort; not available under Wayland)
// ---------------------------------------------------------------------------

async function warmOperations(): Promise<void> {
  const client = makeClient();
  if (!client) return;
  try {
    const ops = await client.listOperations();
    cachedOperations = ops.map((o) => ({ slug: o.slug, name: o.name }));
    buildTray();
  } catch {
    // Offline or not yet configured — the tray shows the fallback entry.
  }
}

function registerShortcuts(): void {
  globalShortcut.unregisterAll();
  const { captureArea, captureWindow } = getHotkeys();
  try {
    if (captureArea) globalShortcut.register(captureArea, () => captureAndCompose('area'));
    if (captureWindow) globalShortcut.register(captureWindow, () => captureAndCompose('window'));
  } catch {
    // Ignore registration failures (e.g. Wayland) — tray menu still works.
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle(CH.getSettings, () => getSettings());

  ipcMain.handle(CH.saveSettings, (_e, patch: SettingsPatch) => {
    const settings = saveSettings(patch);
    registerShortcuts();
    buildTray();
    return settings;
  });

  ipcMain.handle(CH.testConnection, async () => {
    const client = makeClient();
    if (!client) return { ok: false, error: 'Server URL and API key are required.' };
    try {
      const res = await client.checkConnection();
      return { ok: true, user: res.user.email };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(CH.listOperations, async (): Promise<OperationLite[]> => {
    const client = makeClient();
    if (!client) return [];
    const ops = await client.listOperations();
    cachedOperations = ops.map((o) => ({ slug: o.slug, name: o.name }));
    buildTray();
    return cachedOperations;
  });

  ipcMain.handle(CH.listTags, async (_e, slug: string): Promise<TagLite[]> => {
    const client = makeClient();
    if (!client) return [];
    const tags = await client.listTags(slug);
    return tags.map((t) => ({ id: t.id, name: t.name, colorName: t.colorName }));
  });

  ipcMain.handle(CH.setOperation, (_e, slug: string | null) => {
    saveSettings({ currentOperationSlug: slug });
    buildTray();
    return getSettings();
  });

  ipcMain.handle(CH.getQueue, () => listQueue());
  ipcMain.handle(CH.getDraft, () => pendingDraft);

  ipcMain.handle(
    CH.submitDraft,
    async (
      _e,
      payload: {
        operationSlug: string;
        description: string;
        tagIds: number[];
        contentType: 'image' | 'codeblock' | 'none';
        filePath?: string;
        content?: string;
        contentSubtype?: string;
      },
    ) => {
      addItem({
        operationSlug: payload.operationSlug,
        contentType: payload.contentType,
        filePath: payload.filePath,
        content: payload.content,
        contentSubtype: payload.contentSubtype,
        description: payload.description,
        tagIds: payload.tagIds,
        occurredAt: new Date().toISOString(),
      });
      pendingDraft = null;
      notifyQueueChanged();
      void drain();
      return { ok: true };
    },
  );

  ipcMain.handle(CH.retryItem, (_e, id: string) => {
    updateItem(id, { status: 'pending', error: undefined });
    notifyQueueChanged();
    void drain();
  });

  ipcMain.handle(CH.removeItem, (_e, id: string) => {
    removeItem(id);
    notifyQueueChanged();
  });

  ipcMain.handle(CH.captureArea, () => captureAndCompose('area'));
  ipcMain.handle(CH.captureWindow, () => captureAndCompose('window'));

  ipcMain.handle(CH.getAbout, (): AboutInfo => buildAboutInfo());
  ipcMain.handle(CH.checkForUpdates, () => checkForUpdates());
  ipcMain.handle(CH.openExternal, (_e, url: string) => {
    // Only follow web links — never file:// or arbitrary schemes from the renderer.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function buildAboutInfo(): AboutInfo {
  return {
    productName: 'reporter',
    version: BUILD_INFO.version,
    commit: BUILD_INFO.commit,
    buildDate: BUILD_INFO.buildDate,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    homepage: BUILD_INFO.homepage,
    serverUrl: getSettings().serverUrl,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    // Support `reporter-desktop --capture-area` (Wayland keybind workaround).
    if (argv.includes('--capture-area')) captureAndCompose('area');
    else if (argv.includes('--capture-window')) captureAndCompose('window');
    else showView('history');
  });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide(); // tray-only app
    // Keep the OS-native "About" panel in sync with the in-app About view.
    app.setAboutPanelOptions({
      applicationName: 'reporter',
      applicationVersion: BUILD_INFO.version,
      version: BUILD_INFO.commit,
      website: BUILD_INFO.homepage,
    });
    mainWindow = createWindow();
    registerIpc();
    buildTray();
    registerShortcuts();

    // Handle a capture flag on first launch.
    if (process.argv.includes('--capture-area')) captureAndCompose('area');

    // Warm the operations cache (populates the tray submenu) and drain the queue.
    void warmOperations();
    void drain();
    setInterval(() => void drain(), 30_000);
    console.log('[reporter] desktop ready — tray active, window hidden');
  });

  app.on('window-all-closed', () => {
    // Stay alive in the tray (except on explicit quit handled above).
  });

  app.on('activate', () => showView('history'));

  app.on('will-quit', () => globalShortcut.unregisterAll());
}

export { isDev };
