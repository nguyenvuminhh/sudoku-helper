use std::{
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const BACKEND_SIDECAR: &str = "puzzle-hint-backend";
const BACKEND_HEALTH_URL: &str = "http://127.0.0.1:48731/api/health";
const BACKEND_STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const BACKEND_HEALTH_INTERVAL: Duration = Duration::from_millis(250);

struct BackendProcess {
    child: Mutex<Option<CommandChild>>,
}

impl BackendProcess {
    fn new(child: CommandChild) -> Self {
        Self {
            child: Mutex::new(Some(child)),
        }
    }

    fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let backend = start_backend(app.handle())?;
            app.manage(BackendProcess::new(backend));
            wait_for_backend()?;

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
                window.set_focus()?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let state = window.state::<BackendProcess>();
                state.kill();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Puzzle Hint desktop app");
}

fn start_backend(app: &tauri::AppHandle) -> Result<CommandChild, Box<dyn std::error::Error>> {
    let sidecar_command = app
        .shell()
        .sidecar(BACKEND_SIDECAR)
        .map_err(|error| format!("failed to resolve backend sidecar '{BACKEND_SIDECAR}': {error}"))?;
    let (mut events, child) = sidecar_command
        .spawn()
        .map_err(|error| format!("failed to start backend sidecar '{BACKEND_SIDECAR}': {error}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    eprintln!("[backend] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[backend:error] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[backend] terminated: {:?}", payload);
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

fn wait_for_backend() -> Result<(), Box<dyn std::error::Error>> {
    let deadline = Instant::now() + BACKEND_STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if backend_is_healthy() {
            return Ok(());
        }
        thread::sleep(BACKEND_HEALTH_INTERVAL);
    }

    Err(format!(
        "Puzzle Hint backend did not become healthy at {BACKEND_HEALTH_URL}. Check that port 48731 is available."
    )
    .into())
}

fn backend_is_healthy() -> bool {
    match ureq::get(BACKEND_HEALTH_URL).call() {
        Ok(response) => response.status() == 200,
        Err(_) => false,
    }
}
