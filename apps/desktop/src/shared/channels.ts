/** IPC channel names, shared by preload and main so they never drift. */
export const CH = {
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  testConnection: 'connection:test',
  listOperations: 'operations:list',
  listTags: 'tags:list',
  setOperation: 'operation:set',
  getQueue: 'queue:get',
  submitDraft: 'queue:submit',
  retryItem: 'queue:retry',
  removeItem: 'queue:remove',
  getDraft: 'draft:get',
  captureArea: 'capture:area',
  captureWindow: 'capture:window',
  getAbout: 'about:get',
  checkForUpdates: 'update:check',
  openExternal: 'shell:open-external',
  // main → renderer events
  queueChanged: 'event:queue-changed',
  draftReady: 'event:draft-ready',
  navigate: 'event:navigate',
} as const;
