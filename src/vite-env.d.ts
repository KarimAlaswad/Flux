/// <reference types="vite/client" />

interface Window {
  __pluginRpc: (method: string, params: any) => Promise<any>;
  resolveHook: (hook: string) => Promise<any>;
  callHook: (hook: string, methodOrArgs: any, args?: any) => Promise<any>;
}