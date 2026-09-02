use tauri::Manager;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, oneshot};
use tokio::time::{Duration, timeout};

// -- Manifest types (mirrors src/shared/types.ts) --

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
    components: Option<Vec<String>>,
    feeds: Option<Vec<FeedContrib>>,
    hooks: Option<Vec<String>>,
}

// -- Plugin process handle --

struct PluginHandle {
    name: String,
    methods: Vec<String>,
    hooks: Vec<String>,
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: Arc<AtomicU64>,
}

// -- App state managed by Tauri --

struct AppState {
    plugins: Mutex<Vec<PluginHandle>>,
}

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
                    if let Ok(manifest) =
                        serde_json::from_str::<PluginManifest>(&content)
                    {
                        results.push((manifest, path.clone()));
                    }
                }
            }
            results.extend(discover_plugins(&path));
        }
    }
    results
}

// -- Resolve `run` field ("bun ./main.ts" → cmd="bun", args=[abs/plugin/main.ts]) --

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

// -- Spawn one plugin subprocess (async) --

async fn spawn_plugin(
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
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .ok()?;

    let stdin = Arc::new(Mutex::new(child.stdin.take()?));
    let stdout = child.stdout.take()?;

    let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(AtomicU64::new(1));

    // Background stdout reader — matches responses by id
    let pending_clone = Arc::clone(&pending);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<Value>(&trimmed) {
                if let Some(id) = msg["id"].as_u64() {
                    let mut map = pending_clone.lock().await;
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
    });

    Some(PluginHandle {
        name: manifest.name.clone(),
        methods: manifest.methods.clone().unwrap_or_default(),
        hooks: manifest.hooks.clone().unwrap_or_default(),
        stdin,
        pending,
        next_id,
    })
}

// -- Tauri command: plugin_request --
//   invoke("plugin_request", { method: "yt-feed.feed", params: {} })

#[tauri::command]
async fn plugin_request(
    state: tauri::State<'_, AppState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let dot = method
        .find('.')
        .ok_or_else(|| "Method must be in 'name.action' format".to_string())?;
    let plugin_name = &method[..dot];
    let action = &method[dot + 1..];

    let mut plugins = state.plugins.lock().await;
    let plugin = plugins
        .iter_mut()
        .find(|p| p.name == plugin_name)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_name))?;

    let id = plugin.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel();
    plugin.pending.lock().await.insert(id, tx);

    let msg = serde_json::json!({
        "id": id,
        "method": action,
        "params": params.unwrap_or(serde_json::json!({})),
    });
    let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
    line.push('\n');
    plugin
        .stdin
        .lock()
        .await
        .write_all(line.as_bytes())
        .await
        .map_err(|e| format!("stdin write error: {}", e))?;

    drop(plugins); // release lock so reader task can access pending

    timeout(Duration::from_secs(15), rx)
        .await
        .map_err(|_| "Plugin request timed out".to_string())?
        .map_err(|_| "Plugin request cancelled".to_string())?
}

// -- Tauri command: resolve_hook --
//   invoke("resolve_hook", { hook: "feed.video" })

#[tauri::command]
async fn resolve_hook(
    state: tauri::State<'_, AppState>,
    hook: String,
) -> Result<Value, String> {
    let plugins = state.plugins.lock().await;
    let plugin = plugins
        .iter()
        .find(|p| p.hooks.contains(&hook))
        .ok_or_else(|| format!("No plugin provides hook: {}", hook))?;

    Ok(serde_json::json!({
        "name": plugin.name,
        "methods": plugin.methods,
    }))
}

// -- Tauri command: call_hook --
//   invoke("call_hook", { hook: "feed.video", method: "feed", params: {} })
//   method and params are both optional

#[tauri::command]
async fn call_hook(
    state: tauri::State<'_, AppState>,
    hook: String,
    method: Option<String>,
    params: Option<Value>,
) -> Result<Value, String> {
    let (plugin_name, plugin_methods) = {
        let plugins = state.plugins.lock().await;
        let plugin = plugins
            .iter()
            .find(|p| p.hooks.contains(&hook))
            .ok_or_else(|| format!("No plugin provides hook: {}", hook))?;
        (plugin.name.clone(), plugin.methods.clone())
    };

    let action = method.unwrap_or(
        plugin_methods
            .first()
            .ok_or_else(|| format!("Plugin '{}' has no methods", plugin_name))?
            .clone(),
    );
    let full_method = format!("{}.{}", plugin_name, action);

    plugin_request(state, full_method, params).await
}

// -- App entry point --

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let base_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri should have a parent directory")
        .to_path_buf();
    let plugins_dir = base_dir.join("plugins");
    let discovered = discover_plugins(&plugins_dir);
    println!("[host] discovered {} plugin manifests at {:?}", discovered.len(), plugins_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .plugin(tauri_plugin_mcp_bridge::init())
        .setup(move |app| {
            let handles = tauri::async_runtime::block_on(async {
                let mut handles = Vec::new();
                for (manifest, plugin_dir) in &discovered {
                    if manifest.run.is_some() {
                        match spawn_plugin(manifest, &base_dir, plugin_dir).await
                        {
                            Some(handle) => {
                                println!("[host] spawned plugin: {}", handle.name);
                                handles.push(handle);
                            }
                            None => {
                                eprintln!(
                                    "[host] failed to spawn plugin: {}",
                                    manifest.name
                                );
                            }
                        }
                    }
                }
                handles
            });

            println!(
                "[host] {} plugins running, starting Tauri...",
                handles.len()
            );
            app.manage(AppState {
                plugins: Mutex::new(handles),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.as_ref().with_webview(|w| {
                    #[cfg(target_os = "linux")]
                    {
                        use webkit2gtk::{WebViewExt, SettingsExt};
                        if let Some(settings) = w.inner().settings() {
                            settings.set_media_playback_requires_user_gesture(false);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            plugin_request,
            resolve_hook,
            call_hook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
