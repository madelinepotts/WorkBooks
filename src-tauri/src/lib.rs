use std::{
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::Command as StdCommand,
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::Manager;

use tauri_plugin_shell::{
    process::{
        CommandChild,
        CommandEvent,
    },
    ShellExt,
};


/*
 * Keep the backend process handle around for the
 * lifetime of WorkBooks.
 *
 * This lets us explicitly stop FastAPI when the
 * desktop application exits.
 */
struct BackendProcess(
    Mutex<Option<CommandChild>>,
);


/*
 * Return the address used by the local FastAPI backend.
 */
fn backend_address() -> SocketAddr {
    "127.0.0.1:8000"
        .parse()
        .expect(
            "Invalid backend address"
        )
}


/*
 * Check whether something is already listening on
 * WorkBooks' backend port.
 *
 * This prevents an old backend process from causing
 * the new sidecar to fail while WorkBooks mistakenly
 * thinks everything started correctly.
 */
fn backend_port_in_use() -> bool {

    let address =
        backend_address();


    TcpStream::connect_timeout(
        &address,
        Duration::from_millis(100),
    )
    .is_ok()
}


/*
 * Wait until FastAPI is actually listening on port 8000.
 *
 * PyInstaller takes a moment to unpack and start, so
 * without this the React frontend could try to load
 * customers/jobs before the backend is ready.
 */
fn wait_for_backend() -> bool {

    let address =
        backend_address();


    /*
     * Try for roughly 10 seconds.
     */
    for _ in 0..100 {

        if TcpStream::connect_timeout(
            &address,
            Duration::from_millis(100),
        )
        .is_ok()
        {
            return true;
        }


        thread::sleep(
            Duration::from_millis(100)
        );
    }


    false
}


/*
 * Stop the backend process.
 *
 * PyInstaller --onefile uses a parent process plus
 * another process containing the actual Python program.
 *
 * Killing only the parent can therefore leave FastAPI
 * running in the background.
 *
 * On Windows, taskkill /T terminates the entire process
 * tree.
 */
fn kill_backend_process(
    child: CommandChild
) {

    let pid =
        child.pid();


    #[cfg(target_os = "windows")]
    {
        let result =
            StdCommand::new(
                "taskkill"
            )
            .args([
                "/PID",
                &pid.to_string(),
                "/T",
                "/F",
            ])
            .status();


        if let Err(error) =
            result
        {
            eprintln!(
                "Could not stop WorkBooks backend: {}",
                error
            );
        }
    }


    /*
     * Fallback for non-Windows systems.
     */
    #[cfg(not(target_os = "windows"))]
    {
        let _ =
            child.kill();
    }
}


// Learn more about Tauri commands at:
// https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {

    format!(
        "Hello, {}! You've been greeted from Rust!",
        name
    )
}


#[cfg_attr(
    mobile,
    tauri::mobile_entry_point
)]
pub fn run() {

    let app =
        tauri::Builder::default()

            /*
             * Gives WorkBooks access to the bundled
             * FastAPI executable.
             */
            .plugin(
                tauri_plugin_shell::init()
            )

            .plugin(
                tauri_plugin_opener::init()
            )

            /*
             * Start FastAPI before normal application
             * operation begins.
             */
            .setup(|app| {

                /*
                 * WorkBooks owns port 8000.
                 *
                 * If something is already using it,
                 * don't attempt to start another backend.
                 *
                 * This also prevents wait_for_backend()
                 * from accidentally seeing an old process
                 * and reporting that the new backend is
                 * ready.
                 */
                if backend_port_in_use() {

                    return Err(
                        "Port 8000 is already in use. \
                         Close any existing WorkBooks \
                         backend and start WorkBooks again."
                            .into()
                    );
                }


                let mut backend_command =
                    app
                        .shell()
                        .sidecar(
                            "workbooks-backend"
                        )?;


                /*
                 * During `tauri dev`, keep using the
                 * existing backend/workbooks.db.
                 *
                 * Release builds do NOT receive this
                 * override.
                 *
                 * The packaged backend will therefore
                 * use:
                 *
                 * %LOCALAPPDATA%\WorkBooks
                 */
                #[cfg(debug_assertions)]
                {
                    let development_data_dir =
                        PathBuf::from(
                            env!(
                                "CARGO_MANIFEST_DIR"
                            )
                        )
                        .join(
                            "../backend"
                        );


                    backend_command =
                        backend_command.env(
                            "WORKBOOKS_DATA_DIR",
                            development_data_dir
                                .as_os_str(),
                        );
                }


                /*
                 * Launch the bundled FastAPI backend.
                 */
                let (
                    mut events,
                    backend_child,
                ) =
                    backend_command
                        .spawn()?;


                /*
                 * Drain stdout/stderr from the backend.
                 *
                 * This also makes backend errors visible
                 * in the Tauri development console.
                 */
                tauri::async_runtime::spawn(
                    async move {

                        while let Some(event) =
                            events.recv().await
                        {

                            match event {

                                CommandEvent::Stdout(
                                    line
                                ) => {

                                    println!(
                                        "WorkBooks backend: {}",
                                        String::from_utf8_lossy(
                                            &line
                                        )
                                    );
                                }


                                CommandEvent::Stderr(
                                    line
                                ) => {

                                    eprintln!(
                                        "WorkBooks backend error: {}",
                                        String::from_utf8_lossy(
                                            &line
                                        )
                                    );
                                }


                                _ => {}
                            }
                        }
                    },
                );


                /*
                 * Make sure FastAPI actually became
                 * available before continuing.
                 */
                if !wait_for_backend() {

                    /*
                     * Don't leave any PyInstaller
                     * backend processes behind if
                     * startup fails.
                     */
                    kill_backend_process(
                        backend_child
                    );


                    return Err(
                        "WorkBooks backend failed to start."
                            .into()
                    );
                }


                println!(
                    "WorkBooks backend is ready."
                );


                /*
                 * Store the process handle so it can be
                 * terminated when WorkBooks exits.
                 */
                app.manage(
                    BackendProcess(
                        Mutex::new(
                            Some(
                                backend_child
                            )
                        )
                    )
                );


                Ok(())
            })

            .invoke_handler(
                tauri::generate_handler![
                    greet
                ]
            )

            .build(
                tauri::generate_context!()
            )

            .expect(
                "error while building Tauri application"
            );


    /*
     * Run the desktop application and explicitly stop
     * FastAPI during shutdown.
     */
    app.run(
        |app_handle, event| {

            if let tauri::RunEvent::Exit =
                event
            {

                let backend =
                    app_handle.state::<
                        BackendProcess
                    >();


                if let Ok(mut process) =
                    backend.0.lock()
                {

                    if let Some(child) =
                        process.take()
                    {

                        /*
                         * Kill the complete PyInstaller
                         * process tree.
                         */
                        kill_backend_process(
                            child
                        );
                    }
                };
            }
        },
    );
}