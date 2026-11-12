use flux_core::{resolve_root, Supervisor};
use serde_json::Value;
use std::sync::Arc;
use tauri::http::Response;
use tauri::Manager;

// -- App state --

struct AppState {
    core: Arc<Supervisor>,
}

// -- Tauri commands --
// The core is blocking; Tauri's runtime is not. Hand each call to a blocking
// thread so a slow plugin never stalls the UI.

#[tauri::command]
async fn plugin_request(
    state: tauri::State<'_, AppState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let core = Arc::clone(&state.core);
    tauri::async_runtime::spawn_blocking(move || {
        core.request(&method, params.unwrap_or_else(|| serde_json::json!({})))
    })
    .await
    .map_err(|e| format!("plugin task failed: {}", e))?
}

#[tauri::command]
async fn resolve_hook(
    state: tauri::State<'_, AppState>,
    hook: String,
) -> Result<Value, String> {
    let core = Arc::clone(&state.core);
    tauri::async_runtime::spawn_blocking(move || core.resolve_hook(&hook))
        .await
        .map_err(|e| format!("hook task failed: {}", e))?
}

#[tauri::command]
async fn call_hook(
    state: tauri::State<'_, AppState>,
    hook: String,
    method: Option<String>,
    params: Option<Value>,
) -> Result<Value, String> {
    let core = Arc::clone(&state.core);
    tauri::async_runtime::spawn_blocking(move || core.call_hook(&hook, method.as_deref(), params))
        .await
        .map_err(|e| format!("hook task failed: {}", e))?
}

// -- App entry point --

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let base_dir = resolve_root();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .plugin(tauri_plugin_mcp_bridge::init())
        .setup(move |app| {
            let supervisor = Supervisor::new(&base_dir);
            println!(
                "[host] {} plugins running, starting Tauri...",
                supervisor.count()
            );
            app.manage(AppState {
                core: Arc::new(supervisor),
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
        .register_uri_scheme_protocol("stream", |_app, request| {
            let uri = request.uri().to_string();
            let target_url = uri.split("u=").nth(1).unwrap_or("");
            let decoded_url = urlencoding::decode(target_url).unwrap_or_default().to_string();
        
            // Use a dedicated thread to avoid blocking the main/UI thread
            let (tx, rx) = std::sync::mpsc::channel();
        
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                let response = rt.block_on(async move {
                    let client = reqwest::Client::new();
                    let mut req = client.get(&decoded_url)
                        .header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        
                    if let Some(range) = request.headers().get("range") {
                        req = req.header("Range", range);
                    }
        
                    let res = match req.send().await {
                        Ok(r) => r,
                        Err(e) => return Response::builder().status(500).body(e.to_string().into_bytes()).unwrap(),
                    };
        
                    let status = res.status().as_u16();
                    let ct = res.headers().get("content-type").cloned();
                    let cl = res.headers().get("content-length").cloned();
                    let cr = res.headers().get("content-range").cloned();
                    let body = res.bytes().await.unwrap_or_default().to_vec();
        
                    let mut builder = Response::builder()
                        .status(status)
                        .header("accept-ranges", "bytes");
                    if let Some(ct) = ct { builder = builder.header("content-type", ct); }
                    if let Some(cl) = cl { builder = builder.header("content-length", cl); }
                    if let Some(cr) = cr { builder = builder.header("content-range", cr); }
        
                    builder.body(body).unwrap()
                });
                let _ = tx.send(response);
            });
        
            rx.recv().unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            plugin_request,
            resolve_hook,
            call_hook
        ])
        .plugin(victauri_plugin::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
