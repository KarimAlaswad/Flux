import { spawn, type ChildProcess } from "child_process"
import { existsSync, readdirSync, readFileSync, lstatSync } from "fs"
import { join, resolve } from "path"
import { createInterface } from "readline"
import { createSend } from "../_shared/stdin.ts"

const TIMEOUT_MS = 15_000

type Manifest = {
  name: string
  run?: string
  methods?: string[]
  hooks?: string[]
  role?: string
}

function resolveRoot(): string {
  const i = process.argv.indexOf("--root")
  if (i !== -1 && process.argv[i + 1]) return resolve(process.argv[i + 1])
  if (process.env.FLUX_ROOT) return resolve(process.env.FLUX_ROOT)
  if (process.env.PLUGIN_BASE_DIR) return resolve(process.env.PLUGIN_BASE_DIR)
  let dir = process.cwd()
  while (true) {
    if (existsSync(join(dir, "flux.json"))) return dir
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return join(import.meta.dir, "..", "..")
}

function discover(dir: string): { manifest: Manifest; dir: string }[] {
  if (!existsSync(dir)) return []
  const found: { manifest: Manifest; dir: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!lstatSync(full).isDirectory()) continue
    const manifestPath = join(full, "plugin.json")
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
        if (manifest.name) found.push({ manifest, dir: full })
      } catch {}
    }
    found.push(...discover(full))
  }
  return found
}

function resolveRun(run: string, dir: string): [string, string[]] {
  const [cmd, ...rest] = run.split(/\s+/)
  return [
    cmd,
    rest.map((a) =>
      a.startsWith("./") || a.startsWith("../") ? join(dir, a) : a,
    ),
  ]
}

class PluginHandle {
  name: string
  methods: string[]
  hooks: string[]
  private proc: ChildProcess
  private pending = new Map<number, (r: { ok: boolean; value: any }) => void>()
  private nextId = 1

  constructor(manifest: Manifest, root: string, dir: string) {
    const [cmd, args] = resolveRun(manifest.run!, dir)
    this.name = manifest.name
    this.methods = manifest.methods ?? []
    this.hooks = manifest.hooks ?? []
    this.proc = spawn(cmd, args, {
      cwd: dir,
      env: { ...process.env, PLUGIN_BASE_DIR: root },
      stdio: ["pipe", "pipe", "inherit"],
    })
    createInterface({ input: this.proc.stdout! }).on("line", (line) => {
      const text = line.trim()
      if (!text) return
      let msg: any
      try {
        msg = JSON.parse(text)
      } catch {
        return
      }
      const resolve = this.pending.get(msg.id)
      if (!resolve) return
      this.pending.delete(msg.id)
      resolve({ ok: !msg.error, value: msg.error ?? msg.result })
    })
  }

  request(method: string, params: any): Promise<any> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Plugin '${this.name}' timed out after ${TIMEOUT_MS}ms`))
      }, TIMEOUT_MS)
      this.pending.set(id, (r) => {
        clearTimeout(timer)
        r.ok ? resolve(r.value) : reject(new Error(String(r.value)))
      })
      this.proc.stdin!.write(
        JSON.stringify({ id, method, params: params ?? {} }) + "\n",
      )
    })
  }

  kill() {
    try {
      this.proc.kill()
    } catch {}
  }
}

const root = resolveRoot()
const discovered = discover(join(root, "plugins"))
const plugins: PluginHandle[] = []

for (const { manifest, dir } of discovered) {
  if (manifest.role === "supervisor") continue
  if (!manifest.run) continue
  const handle = new PluginHandle(manifest, root, dir)
  plugins.push(handle)
  console.error(`[supervisor] spawned ${handle.name}`)
}
console.error(
  `[supervisor] discovered ${discovered.length} manifests, ${plugins.length} running`,
)

function byName(name: string) {
  const p = plugins.find((p) => p.name === name)
  if (!p) throw new Error(`Plugin not found: ${name}`)
  return p
}

function byHook(hook: string) {
  const p = plugins.find((p) => p.hooks.includes(hook))
  if (!p) throw new Error(`No plugin provides hook: ${hook}`)
  return p
}

const send = createSend()

async function handle(msg: any) {
  const id = msg.id ?? null
  const params = msg.params ?? {}
  try {
    if (msg.method === "request") {
      const dot = String(params.method ?? "").indexOf(".")
      if (dot === -1)
        throw new Error("Method must be in 'name.action' format")
      const plugin = byName(String(params.method).slice(0, dot))
      const action = String(params.method).slice(dot + 1)
      send(id, await plugin.request(action, params.params ?? {}))
    } else if (msg.method === "resolveHook") {
      const plugin = byHook(params.hook)
      send(id, { name: plugin.name, methods: plugin.methods })
    } else if (msg.method === "callHook") {
      const plugin = byHook(params.hook)
      const action = params.method || plugin.methods[0]
      if (!action) throw new Error(`Plugin '${plugin.name}' has no methods`)
      send(id, await plugin.request(action, params.params ?? {}))
    } else {
      throw new Error("Method not found: " + msg.method)
    }
  } catch (e: any) {
    send(id, null, e?.message ?? String(e))
  }
}

let inflight = 0
let closed = false

function maybeExit() {
  if (!closed || inflight > 0) return
  for (const p of plugins) p.kill()
  process.exit(0)
}

const rl = createInterface({ input: process.stdin })
rl.on("line", (line) => {
  const text = line.trim()
  if (!text) return
  let msg: any
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }
  inflight++
  handle(msg).finally(() => {
    inflight--
    maybeExit()
  })
})
rl.on("close", () => {
  closed = true
  maybeExit()
})
