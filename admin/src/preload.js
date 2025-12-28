const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('LovelyAdmin', {
  // Site selection / info
  getSiteInfo: () => ipcRenderer.invoke('site:getInfo'),
  pickSiteDir: () => ipcRenderer.invoke('site:pickDir'),

  // Calendar data
  readCalendarData: () => ipcRenderer.invoke('calendar:read'),
  upsertCalendarEvent: (payload) => ipcRenderer.invoke('calendar:upsertEvent', payload),
  deleteCalendarEvent: (payload) => ipcRenderer.invoke('calendar:deleteEvent', payload),

  // Version bump
  bumpCalendarVersion: () => ipcRenderer.invoke('calendar:bumpVersion'),

  // Publish
  runPreflight: () => ipcRenderer.invoke('publish:preflight'),
  publish: (payload) => ipcRenderer.invoke('publish:run', payload),
});


