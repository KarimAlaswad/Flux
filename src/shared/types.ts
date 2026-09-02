export interface PluginInfo {
  name: string;
  methods: string[];
}

export interface FeedContrib {
  type?: string; // e.g. "video", "post", "image"
  method?: string; // RPC method to call (default to methods[0])
  card?: string; // WC tag, e.g. "yt-video-card" - path derived
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  run?: string;
  methods?: string[];
  components?: string[]; // WC tags to build (resolved by hooks at runtime)
  feeds?: FeedContrib[];
  hooks?: string[]; // capability labels (frontend + backend)
}
