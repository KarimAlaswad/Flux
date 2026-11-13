import { app, BrowserWindow, ipcMain, net, protocol, session } from "electron"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { existsSync, readdirSync, readFileSync, lstatSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { registerMpvPrismIpc } from "@mpv-prism/electron/main"

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, "..", "..", "dist")
const SCHEME = "app"
const TIMEOUT_MS = 15_000

function resolveRoot() {
	const i = process.argv.indexOf("--root")
	if (i !== -1 && process.argv[i + 1]) return resolve(process.argv[i + 1])
	if (process.env.FLUX_ROOT) return resolve(process.env.FLUX_ROOT)
	let dir = process.cwd()
	while (true) {
		if (existsSync(join(dir, "flux.json"))) return dir
		const parent = resolve(dir, "..")
		if (parent === dir) break
		dir = parent
	}
	return resolve(here, "..", "..")
}

function findSupervisor(dir) {
	if (!existsSync(dir)) return null
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry)
		if (!lstatSync(full).isDirectory()) continue
		const manifestPath = join(full, "plugin.json")
		if (existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
				if (manifest.role === "supervisor" && manifest.run)
					return { manifest, dir: full }
			} catch { }
		}
		const nested = findSupervisor(full)
		if (nested) return nested
	}
	return null
}

class SupervisorClient {
  constructor(root) {
    const found = findSupervisor(join(root, "plugins"))
    if (!found)
      throw new Error('[electron] No plugin declares "role": "supervisor"')

    const [cmd, ...rest] = found.manifest.run.split(/\s+/)
    const args = rest.map((a) =>
      a.startsWith("./") || a.startsWith("../") ? join(found.dir, a) : a,
    )

    this.pending = new Map()
    this.nextId = 1
    this.proc = spawn(cmd, args, {
      cwd: found.dir,
      env: { ...process.env, PLUGIN_BASE_DIR: root, FLUX_ROOT: root },
      stdio: ["pipe", "pipe", "inherit"],
    })

    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      const text = line.trim()
      if (!text) return
      let msg
      try {
        msg = JSON.parse(text)
      } catch {
        return
      }
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      clearTimeout(entry.timer)
      msg.error ? entry.reject(new Error(msg.error)) : entry.resolve(msg.result)
    })

    this.proc.on("exit", (code) => {
      console.error(`[electron] supervisor exited (${code})`)
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error("[electron] supervisor exited"))
      }
      this.pending.clear()
    })
  }

  call(method, params) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`[electron] '${method}' timed out`))
      }, TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      this.proc.stdin.write(JSON.stringify({ id, method, params }) + "\n")
    })
  }

  kill() {
    try {
      this.proc.kill()
    } catch {}
  }
}

// ------------------------------------------------------------- custom protocol

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

let client

if (process.platform === "linux") {
	app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer")
  app.commandLine.appendSwitch("ignore-gpu-blocklist")
  app.commandLine.appendSwitch("enable-gpu-rasterization")
  app.commandLine.appendSwitch("enable-zero-copy")
}

app.whenReady().then(() => {
  const root = resolveRoot()
  client = new SupervisorClient(root)

  registerMpvPrismIpc({
  	loader: { baseDirectory: here }
  })

  const stamp = () => new Date().toISOString().slice(11, 23)

  session.defaultSession.webRequest.onErrorOccurred((d) => {
    console.error(`${stamp()} [net] ${d.error} ${d.url}`)
  })

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.host !== "bundle") return new Response("not found", { status: 404 })

    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith("/")) pathname += "index.html"

    const target = resolve(DIST, "." + pathname)
    const rel = relative(DIST, target)
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      return new Response("bad path", { status: 400 })

    return net.fetch(pathToFileURL(target).toString())
  })

  ipcMain.handle("flux:request", (_e, method, params) =>
    client.call("request", { method, params: params ?? {} }),
  )
  ipcMain.handle("flux:resolveHook", (_e, hook) =>
    client.call("resolveHook", { hook }),
  )
  ipcMain.handle("flux:callHook", (_e, hook, method, params) =>
    client.call("callHook", { hook, method, params }),
  )

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#111111",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.on("console-message", (event) => {
    console.error(`${stamp()} [page] ${event.message}   ${event.sourceId}:${event.lineNumber}`)
  })

  win.webContents.on("preload-error", (_e, path, error) => {
    console.error(`${stamp()} [preload] ${path}\n${error?.stack ?? error}`)
  })

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`${stamp()} [load] ${code} ${desc} ${url}`)
  })

  win.webContents.on("render-process-gone", (_e, d) => {
    console.error(`${stamp()} [crash] ${d.reason}`)
  })

  win.loadURL(`${SCHEME}://bundle/index.html`)
  if (!app.isPackaged) win.webContents.openDevTools({ mode: "detach" })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
app.on("before-quit", () => client?.kill())