use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
struct CpuInfo {
    brand: String,
    vendor: String,
    architecture: String,
    physical_cores: Option<usize>,
    logical_cores: usize,
    frequency_mhz: u64,
}

#[tauri::command]
fn get_cpu_info() -> CpuInfo {
    let sys = System::new_all();

    let cpus = sys.cpus();

    let first_cpu = cpus.first();

    CpuInfo {
        brand: first_cpu
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_default(),

        vendor: first_cpu
            .map(|cpu| cpu.vendor_id().to_string())
            .unwrap_or_default(),

        architecture: System::cpu_arch(),

        physical_cores: System::physical_core_count(),

        logical_cores: cpus.len(),

        frequency_mhz: first_cpu
            .map(|cpu| cpu.frequency())
            .unwrap_or(0),
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn cpu_info() -> String {
    // 使用 Rust crate 获取 CPU 信息
    "Intel Core i9".into()
}

#[tauri::command]
fn my_custom_command() -> String {
  "Hello from Rust!".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            cpu_info,
            get_cpu_info,
            my_custom_command
         ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
