const { contextBridge, ipcRenderer } = require("electron");
const { exposeMpvPrismPreload } = require("@mpv-prism/electron/preload");

exposeMpvPrismPreload();

contextBridge.exposeInMainWorld("__flux_host__", {
	request: (method, params) => ipcRenderer.invoke("flux:request", method, params),
	resolveHook: (hook) => ipcRenderer.invoke("flux:resolveHook", hook),
	callHook: (hook, method, params) => ipcRenderer.invoke("flux:callHook", hook, method, params),
})