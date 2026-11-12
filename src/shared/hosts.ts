export interface FluxHost {
	request(method: string, params?: unknown): Promise<unknown>;
	resolveHook(hook: string): Promise<unknown>;
	callHook(hook: string, method?: string, params?: unknown): Promise<unknown>;
}

declare global {
	interface Window {
		__flux_host__?: FluxHost;
	}
}
export function host(): FluxHost {
	const h = window.__flux_host__;
	if (!h) {
		throw new Error(
			"[flux] No skeleton installed window.__flux_host__.\n" +
				"One of skeletons/{webui,tauri,electron} must install it before the app loads.",
		);
	}
	return h;
}
