'use strict';
// Gives the page the one thing a browser tab can't: the real path of a file dropped from Finder.

const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  pathForFile: (file) => webUtils.getPathForFile(file) || null,
});
