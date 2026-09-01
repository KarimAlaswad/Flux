use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use webui::webui::{Window, Event, wait};

// -- Types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedContrib {
    #[serde(rename = "type")]
    feed_type: Option<String>,
    method: Option<String>,
    card: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    name: String,
    version: Option<String>,
    description: Option<String>,
    author: Option<String>,
    run: Option<String>,
    methods: Option<Vec<String>>,
    ui: Option<String>,
    components: Option<Vec<String>>,
    feeds: Option<Vec<FeedContrib>>,
    hooks: Option<Vec<String>>,
    slots: Option<Vec<String>>,
}

// -- Plugin process handle --

struct PluginHandle {
    name: String,
    methods: Vec<String>,
    hooks: Vec<String>,
    stdin: Mutex<std::process::ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, std::sync::mpsc::SyncSender<Result<Value, String>>>>>,
    next_id: AtomicU64,
}

impl PluginHandle {
    fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        self.pending.lock().unwrap().insert(id, tx);

        let msg = serde_json::json!({
            "id": id,
            "method": method,
            "params": params,
        });
        let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        line.push('\n');
        self.stdin
            .lock()
            .unwrap()
            .write_all(line.as_bytes())
            .map_err(|e| format!("stdin write error: {}", e))?;

        rx.recv_timeout(std::time::Duration::from_secs(15))
            .map_err(|_| "Plugin request timed out".to_string())?
    }
}

// -- Global state (webui bind() requires plain function pointers) --

static mut PLUGIN_HANDLES: Option<Vec<PluginHandle>> = None;

// -- Filesystem: discover plugins recursively --

fn discover_plugins(dir: &PathBuf) -> Vec<(PluginManifest, PathBuf)> {
    let mut results = Vec::new();
    if !dir.exists() {
        return results;
    }
    for entry in std::fs::read_dir(dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            let plugin_json = path.join("plugin.json");
            if plugin_json.exists() {
                if let Ok(content) = std::fs::read_to_string(&plugin_json) {
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

// -- Resolve `run` field ("bun ./main.ts" -> cmd="bun", args=[abs/plugin/main.ts]) --

fn resolve_run(run: &str, plugin_dir: &PathBuf) -> (String, Vec<String>) {
    let parts: Vec<&str> = run.split_whitespace().collect();
    let cmd = parts[0].to_string();
    let args: Vec<String> = parts[1..]
        .iter()
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

// -- Spawn one plugin subprocess --

fn spawn_plugin(
    manifest: &PluginManifest,
    base_dir: &PathBuf,
    plugin_dir: &PathBuf,
) -> Option<PluginHandle> {
    let run = manifest.run.as_ref()?;
    let (cmd, args) = resolve_run(run, plugin_dir);

    let mut child = Command::new(&cmd)
        .args(&args)
        .current_dir(plugin_dir)
        .env("PLUGIN_BASE_DIR", base_dir.to_string_lossy().to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .ok()?;

    let stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;

    let pending: Arc<Mutex<HashMap<u64, std::sync::mpsc::SyncSender<Result<Value, String>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let pending_clone = Arc::clone(&pending);

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(msg) = serde_json::from_str::<Value>(&trimmed) {
                        if let Some(id) = msg["id"].as_u64() {
                            let mut map = pending_clone.lock().unwrap();
                            if let Some(tx) = map.remove(&id) {
                                if let Some(err) = msg["error"].as_str() {
                                    let _ = tx.send(Err(err.to_string()));
                                } else {
                                    let _ = tx.send(Ok(msg["result"].clone()));
                                }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    Some(PluginHandle {
        name: manifest.name.clone(),
        methods: manifest.methods.clone().unwrap_or_default(),
        hooks: manifest.hooks.clone().unwrap_or_default(),
        stdin: Mutex::new(stdin),
        pending,
        next_id: AtomicU64::new(1),
    })
}

// -- webui handlers --

fn plugin_request_handler(event: Event) {
    let method = event.get_string_at(0);
    let params_str = event.get_string_at(1);
    let params: Value = serde_json::from_str(&params_str).unwrap_or(serde_json::json!({}));

    let dot = method.find('.').expect("Method must be 'name.action' format");
    let plugin_name = &method[..dot];
    let action = &method[dot + 1..];

    unsafe {
        let handles = PLUGIN_HANDLES.as_ref().unwrap();
        let plugin = handles
            .iter()
            .find(|p| p.name == plugin_name)
            .expect("Plugin not found");

        match plugin.send_request(action, params) {
            Ok(val) => event.return_string(&val.to_string()),
            Err(e) => event.return_string(&format!("{{\"error\":\"{}\"}}", e)),
        }
    }
}

fn resolve_hook_handler(event: Event) {
    let hook = event.get_string_at(0);
    unsafe {
        let handles = PLUGIN_HANDLES.as_ref().unwrap();
        let plugin = handles
            .iter()
            .find(|p| p.hooks.contains(&hook))
            .expect("No plugin provides this hook");

        let result = serde_json::json!({
            "name": plugin.name,
            "methods": plugin.methods,
        });
        event.return_string(&result.to_string());
    }
}

fn call_hook_handler(event: Event) {
    let hook = event.get_string_at(0);
    let method_arg = event.get_string_at(1);
    let params_str = event.get_string_at(2);
    let params: Value = serde_json::from_str(&params_str).unwrap_or(serde_json::json!({}));

    unsafe {
        let handles = PLUGIN_HANDLES.as_ref().unwrap();
        let plugin = handles
            .iter()
            .find(|p| p.hooks.contains(&hook))
            .expect("No plugin provides this hook");

        let action = if method_arg.is_empty() {
            plugin
                .methods
                .first()
                .expect("Plugin has no methods")
                .clone()
        } else {
            method_arg
        };

        let full_method = format!("{}.{}", plugin.name, action);
        drop(handles);

        let dot = full_method.find('.').unwrap();
        let plugin_name = &full_method[..dot];
        let action = &full_method[dot + 1..];

        let handles = PLUGIN_HANDLES.as_ref().unwrap();
        let plugin = handles
            .iter()
            .find(|p| p.name == plugin_name)
            .unwrap();

        match plugin.send_request(action, params) {
            Ok(val) => event.return_string(&val.to_string()),
            Err(e) => event.return_string(&format!("{{\"error\":\"{}\"}}", e)),
        }
    }
}

// -- Main --

fn main() {
    let base_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri-webui should have a parent directory")
        .to_path_buf();
    let plugins_dir = base_dir.join("plugins");
    let discovered = discover_plugins(&plugins_dir);
    println!(
        "[host] discovered {} plugin manifests at {:?}",
        discovered.len(),
        plugins_dir
    );

    let handles: Vec<PluginHandle> = discovered
        .iter()
        .filter(|(m, _)| m.run.is_some())
        .filter_map(|(m, dir)| spawn_plugin(m, &base_dir, dir))
        .collect();

    println!("[host] {} plugins running", handles.len());

    unsafe {
        PLUGIN_HANDLES = Some(handles);
    }

    // After:
    let win = Window::new();
    win.bind("plugin_request", plugin_request_handler);
    win.bind("resolve_hook", resolve_hook_handler);
    win.bind("call_hook", call_hook_handler);
    win.set_root_folder(base_dir.join("dist").to_string_lossy().to_string());
    webui::webui::set_config(webui::webui::Config::MultiClient, true);
    win.set_port(1420);
    let url = win.start_server("index.html");
    println!("[host] Server started at {}", url);
    // Command::new("brave")
    //     .arg(&url)
    //     .spawn()
    //     .expect("Failed to launch Zen Browser");
    wait();    
}