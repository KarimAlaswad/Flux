export interface PluginInfo {
  name: string
  methods: string[]
}

export interface FeedContrib {
  type?: string // e.g. "video", "post", "image"
  method?: string // RPC method to call (default to methods[0])
  card?: string // WC tag, e.g. "yt-video-card" - path derived
}

export interface PluginManifest {
  name: string
  version?: string
  description?: string
  author?: string
  run?: string
  methods?: string[]
  ui?: string // tag name for main-UI WC 
  components?: string[] // WC tags to build but NOT auto-mount (resolved by slot consumers)
  feeds?: FeedContrib[]
  hooks?: string[]
  slots?: string[] // named placeholders this plugin fills
}