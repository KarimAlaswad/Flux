use flux_core::{resolve_root, Supervisor};
use serde_json::Value;
use std::sync::OnceLock;
use webui::webui::{wait, Event, Window};

static CORE: OnceLock<Supervisor> = OnceLock::new();

fn core() -> &'static Supervisor {
    CORE.get().expect("core was not initialised")
}

fn error_json(message: String) -> String {
    serde_json::json!({ "error": message }).to_string()
}

// -- webui handlers --

fn plugin_request_handler(event: Event) {
    let method = event.get_string_at(0);
    let params: Value =
        serde_json::from_str(&event.get_string_at(1)).unwrap_or_else(|_| serde_json::json!({}));

    match core().request(&method, params) {
        Ok(val) => event.return_string(&val.to_string()),
        Err(e) => event.return_string(&error_json(e)),
    }
}

fn resolve_hook_handler(event: Event) {
    let hook = event.get_string_at(0);

    match core().resolve_hook(&hook) {
        Ok(val) => event.return_string(&val.to_string()),
        Err(e) => event.return_string(&error_json(e)),
    }
}

fn call_hook_handler(event: Event) {
    let hook = event.get_string_at(0);
    let method_arg = event.get_string_at(1);
    let params: Value =
        serde_json::from_str(&event.get_string_at(2)).unwrap_or_else(|_| serde_json::json!({}));
    let method = if method_arg.is_empty() {
        None
    } else {
        Some(method_arg.as_str())
    };

    match core().call_hook(&hook, method, Some(params)) {
        Ok(val) => event.return_string(&val.to_string()),
        Err(e) => event.return_string(&error_json(e)),
    }
}

// -- Main --

fn main() {
    let base_dir = resolve_root();
    let supervisor = Supervisor::new(&base_dir);
    CORE.set(supervisor).ok();

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
