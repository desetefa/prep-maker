/// Clear OS read-only flag and (on Windows) remove Mark of the Web so Word does not open the file read-only / Protected View.
#[tauri::command]
fn ensure_file_writable(path: String) -> Result<(), String> {
    use std::path::Path;

    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("path does not exist: {path}"));
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let status = Command::new("attrib")
            .args(["-R", &path])
            .status()
            .map_err(|e| format!("attrib: {e}"))?;
        if !status.success() {
            return Err("attrib -R did not succeed".into());
        }
        // Drop Mark of the Web (often triggers Word Protected View → behaves like read-only).
        let zone = format!("{path}:Zone.Identifier");
        let _ = std::fs::remove_file(zone);
        return Ok(());
    }

    #[cfg(unix)]
    {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(p).map_err(|e| e.to_string())?.permissions();
        let mode = perms.mode();
        perms.set_mode(mode | 0o200);
        fs::set_permissions(p, perms).map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(windows, unix)))]
    {
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![ensure_file_writable])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
