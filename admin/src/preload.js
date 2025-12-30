const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('LovelyAdmin', {
  // Site selection / info
  getSiteInfo: () => ipcRenderer.invoke('site:getInfo'),

  // Calendar data
  readCalendarData: () => ipcRenderer.invoke('calendar:read'),
  upsertCalendarEvent: (payload) => ipcRenderer.invoke('calendar:upsertEvent', payload),
  deleteCalendarEvent: (payload) => ipcRenderer.invoke('calendar:deleteEvent', payload),

  // Version bump
  bumpCalendarVersion: () => ipcRenderer.invoke('calendar:bumpVersion'),

  // Image management
  readImageData: (payload) => ipcRenderer.invoke('images:read', payload),
  validateImageData: (payload) => ipcRenderer.invoke('images:validate', payload),
  selectImageFiles: () => ipcRenderer.invoke('images:selectFiles'),
  uploadImage: (payload) => ipcRenderer.invoke('images:upload', payload),
  updateImageData: (payload) => ipcRenderer.invoke('images:update', payload),
  deleteImage: (payload) => ipcRenderer.invoke('images:delete', payload),
  
  // File path utility (for drag-drop files in Electron 33+)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Publish
  runPreflight: () => ipcRenderer.invoke('publish:preflight'),
  publish: (payload) => ipcRenderer.invoke('publish:run', payload),
  
  // Dialog
  confirmDialog: (payload) => ipcRenderer.invoke('dialog:confirm', payload),
  alertDialog: (payload) => ipcRenderer.invoke('dialog:alert', payload),
});


