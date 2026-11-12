//! flux-core — everything that does not know which skeleton runs it.
//!
//! It owns: the content root, plugin discovery, plugin subprocesses, and
//! JSON-over-stdio routing. It owns nothing else — no window, no assets,
//! no frontend bridge. Those belong to a skeleton.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

// ---------------------------------------------------------------- manifest --
// Only fields the core needs to route are typed. Unknown fields are ignored
// by serde: adding a manifest field must never break an older core.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedContrib {
    #[serde(rename = "type")]
    pub feed_type: Option<String>,
    pub method: Option<String>,
    pub card: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub run: Option<String>,
    pub methods: Option<Vec<String>>,
    pub components: Option<Vec<String>>,
    pub feeds: Option<Vec<FeedContrib>>,
    pub hooks: Option<Vec<String>>,
}

// ------------------------------------------------------------ content root --

/// Find the directory that holds `plugins/`, `build/` and `dist/`.
///
/// 1. `--root <path>` argument
/// 2. `FLUX_ROOT` environment variable
/// 3. walk up from the current directory looking for `flux.json`
/// 4. the checkout this crate was compiled in
pub fn resolve_root() -> PathBuf {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--root") {
        if let Some(p) = args.get(i + 1) {
            return PathBuf::from(p);
        }
    }

    if let Ok(p) = std::env::var("FLUX_ROOT") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }

    let mut dir = std::env::current_dir().ok();
    while let Some(d) = dir {
        if d.join("flux.json").is_file() {
            return d;
        }
        dir = d.parent().map(|p| p.to_path_buf());
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent()) // crates/flux-core -> repo root
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

// --------------------------------------------------------------- discovery --

/// Walk `dir` recursively and collect every directory holding a plugin.json.
pub fn discover_plugins(dir: &Path) -> Vec<(PluginManifest, PathBuf)> {
    let mut results = Vec::new();
    if !dir.exists() {
        return results;
    }
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            let manifest_path = path.join("plugin.json");
            if manifest_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                    if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                        results.push((manifest, path.clone()));
                    }
                }
            }
            results.extend(discover_plugins(&path));
        }
    }
    results
}

/// `"bun ./main.ts"` in `<plugin>/` -> `("bun", ["<abs>/<plugin>/main.ts"])`.
pub fn resolve_run(run: &str, plugin_dir: &Path) -> (String, Vec<String>) {
    let mut parts = run.split_whitespace();
    let cmd = match parts.next() {
        Some(c) => c.to_string(),
        None => return (String::new(), Vec::new()),
    };
    let args = parts
        .map(|a| {
            if a.starts_with("./") || a.starts_with("../") {
                plugin_dir.join(a).to_string_lossy().to_string()
            } else {
                a.to_string()
            }
        })
        .collect();
    (cmd, args)
}

// ---------------------------------------------------------- one plugin I/O --

struct PluginHandle {
    name: String,
    methods: Vec<String>,
    hooks: Vec<String>,
    stdin: Mutex<std::process::ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, mpsc::SyncSender<Result<Value, String>>>>>,
    next_id: AtomicU64,
}

impl PluginHandle {
    fn spawn(manifest: &PluginManifest, root: &Path, plugin_dir: &Path) -> Result<Self, String> {
        let run = manifest
            .run
            .as_deref()
            .ok_or_else(|| "manifest declares no `run` command".to_string())?;
        let (cmd, args) = resolve_run(run, plugin_dir);

        let mut child = Command::new(&cmd)
            .args(&args)
            .current_dir(plugin_dir)
            .env("PLUGIN_BASE_DIR", root.to_string_lossy().to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("{}: {}", cmd, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "could not capture stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "could not capture stdout".to_string())?;

        let pending: Arc<Mutex<HashMap<u64, mpsc::SyncSender<Result<Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // One reader thread per plugin, matching replies back by id.
        let pending_reader = Arc::clone(&pending);
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(_) => break,
                };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let msg: Value = match serde_json::from_str(trimmed) {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let id = match msg["id"].as_u64() {
                    Some(id) => id,
                    None => continue,
                };
                let tx = pending_reader.lock().unwrap().remove(&id);
                if let Some(tx) = tx {
                    let result = match msg["error"].as_str() {
                        Some(err) => Err(err.to_string()),
                        None => Ok(msg["result"].clone()),
                    };
                    let _ = tx.send(result);
                }
            }
        });

        Ok(Self {
            name: manifest.name.clone(),
            methods: manifest.methods.clone().unwrap_or_default(),
            hooks: manifest.hooks.clone().unwrap_or_default(),
            stdin: Mutex::new(stdin),
            pending,
            next_id: AtomicU64::new(1),
        })
    }

    fn request(&self, action: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = mpsc::sync_channel(1);
        self.pending.lock().unwrap().insert(id, tx);

        let msg = serde_json::json!({ "id": id, "method": action, "params": params });
        let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        line.push('\n');
        self.stdin
            .lock()
            .unwrap()
            .write_all(line.as_bytes())
            .map_err(|e| format!("stdin write error: {}", e))?;

        rx.recv_timeout(REQUEST_TIMEOUT).map_err(|_| {
            format!(
                "Plugin '{}' timed out after {:?}",
                self.name, REQUEST_TIMEOUT
            )
        })?
    }
}

// -------------------------------------------------------------- supervisor --

/// Owns every plugin process. One per app; the skeleton holds it and forwards
/// its three calls. Blocking by design: stdio is blocking, and a blocking API
/// needs no runtime, so every skeleton can use it unchanged.
pub struct Supervisor {
    root: PathBuf,
    plugins: Vec<PluginHandle>,
}

impl Supervisor {
    /// Discover and start every plugin that declares a `run` field.
    pub fn new(root: &Path) -> Self {
        let root = root.to_path_buf();
        let plugins_dir = root.join("plugins");
        let discovered = discover_plugins(&plugins_dir);
        println!(
            "[core] discovered {} plugin manifests at {:?}",
            discovered.len(),
            plugins_dir
        );

        let mut plugins = Vec::new();
        for (manifest, dir) in &discovered {
            // No `run` = a frontend-only plugin (components, hooks, feeds).
            // It has no process, so there is nothing to start and nothing failed.
            if manifest.run.is_none() {
                continue;
            }
            match PluginHandle::spawn(manifest, &root, dir) {
                Ok(handle) => {
                    println!("[core] spawned plugin: {}", handle.name);
                    plugins.push(handle);
                }
                Err(e) => eprintln!("[core] failed to spawn plugin '{}': {}", manifest.name, e),
            }
        }
        println!("[core] {} plugins running", plugins.len());

        Self { root, plugins }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn count(&self) -> usize {
        self.plugins.len()
    }

    /// `"youtube.feed"` -> ask the `youtube` plugin for `feed`.
    pub fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let (name, action) = split_method(method)?;
        let plugin = self
            .plugins
            .iter()
            .find(|p| p.name == name)
            .ok_or_else(|| format!("Plugin not found: {}", name))?;
        plugin.request(action, params)
    }

    /// Which plugin provides `hook`, and what it can do.
    pub fn resolve_hook(&self, hook: &str) -> Result<Value, String> {
        let plugin = self.plugin_for_hook(hook)?;
        Ok(serde_json::json!({
            "name": &plugin.name,
            "methods": &plugin.methods,
        }))
    }

    /// Call the provider of `hook`. Omit `method` to use its first method.
    pub fn call_hook(
        &self,
        hook: &str,
        method: Option<&str>,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let plugin = self.plugin_for_hook(hook)?;
        let action = match method {
            Some(m) if !m.is_empty() => m.to_string(),
            _ => plugin
                .methods
                .first()
                .cloned()
                .ok_or_else(|| format!("Plugin '{}' has no methods", plugin.name))?,
        };
        plugin.request(&action, params.unwrap_or_else(|| serde_json::json!({})))
    }

    fn plugin_for_hook(&self, hook: &str) -> Result<&PluginHandle, String> {
        self.plugins
            .iter()
            .find(|p| p.hooks.iter().any(|h| h == hook))
            .ok_or_else(|| format!("No plugin provides hook: {}", hook))
    }
}

fn split_method(method: &str) -> Result<(&str, &str), String> {
    let dot = method
        .find('.')
        .ok_or_else(|| "Method must be in 'name.action' format".to_string())?;
    Ok((&method[..dot], &method[dot + 1..]))
}
