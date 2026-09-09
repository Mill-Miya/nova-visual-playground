# N.O.V.A. × University AI — Integration v1

## Architecture

University AI controller / UI worker / NotificationService → fail-open NovaOverlayAdapter → thread-safe NovaOverlayClient → authenticated IPv4-loopback TCP → Electron main → existing sandboxed preload settings bridge → `window.nova.setState(state)`.

The adapter sends state only. Questions, OCR text, answers, notification bodies and error details stay in University AI. QMessageBox, Tray, Windows Toast/fallback and LlmService APIs remain in place. No Full HUD answer view, RAG, indexing, microphone or cloud service is added. Browser `visual-playground/` assets and the public nine-state API are unchanged.

External activity never changes native focusability or click-through. The native hotkey/tray still explicitly controls interactivity. A running activity has priority over native Active; after external Idle, explicitly activated native Active remains until Esc/hotkey. Changing core size or native interaction does not reset an in-progress scan animation.

## Setup

Install the overlay dependencies once with `npm ci` in this directory. University AI retains its existing Python requirements; this integration adds no Python package dependency.

For automatic launch, in the shell that starts University AI:

```powershell
$env:NOVA_OVERLAY_DIR = 'C:\path\to\nova-visual-playground\overlay-prototype'
python -m university_ai.app.main
```

`NOVA_OVERLAY_DIR` points to the directory containing main.cjs. The client launches the installed Electron binary directly without a shell. If no launch directory/command is configured, it connects to an independently started `npm start` overlay. Missing installation/configuration is logged; University AI starts normally. Installation/download never happens automatically during application startup.

Advanced: `NOVA_OVERLAY_COMMAND` can be a JSON array of a trusted executable and arguments. `NOVA_OVERLAY_ENDPOINT` can override the discovery file for both processes. Do not place discovery files in a public/shared directory. Autostart is attempted at most once per University AI lifetime; crash recovery reconnects to a restarted overlay rather than repeatedly respawning a process the user closed.

## Protocol 1

Electron binds **127.0.0.1 only**, using an OS-assigned port. It writes `%LOCALAPPDATA%\UniversityAI\nova-overlay.json` (Unix fallback: `~/.local/share/UniversityAI/nova-overlay.json`):

```json
{"v":1,"port":49152,"token":"<random 256-bit lowercase hex credential>"}
```

Every startup rotates the credential. Parent directory/file are created with 0700/0600 modes where supported; on Windows they inherit the private user's LocalAppData ACL. This is not a security boundary against another process running as the same Windows user. The descriptor contains no hostname; Python always connects to 127.0.0.1.

One persistent TCP connection per client. UTF-8 JSON + LF, bounded receive buffer 4096 bytes, at most 16 concurrent sockets:

```json
{"v":1,"op":"state","token":"<credential>","state":"thinking"}
{"v":1,"op":"shutdown","token":"<credential>","owner":null}
```

- Allowed external states: `idle`, `active`, `notification`, `speaking`, `thinking`, `scanning`, `error`.
- Optional state field `message`: string, at most 512 JS UTF-16 code units; validated and discarded in v1. Python does not transmit message arguments.
- Unknown version/op/state/field, nonconforming values, malformed JSON, wrong credential and oversized buffers close the socket. No JS, shell command, filename or renderer method can be requested.
- Accepted packets receive `{"v":1,"ok":true}\n`.
- Python sends current effective state on change and once per second as a heartbeat. Socket timeout is 250 ms, on the daemon only. Reconnect/discovery retry is once per second; repeated failure logging is throttled to once per 30 seconds. Pending changes coalesce into current state.
- Electron prioritizes connections with `error > scanning > thinking > speaking > notification > active > idle`. A connection's state expires after four seconds without a valid state packet; disconnect removes it immediately. Stale sockets are closed after five seconds without data.
- Shutdown with `owner:null` detaches the client and leaves the overlay alive. An ownership secret matching `NOVA_OVERLAY_OWNER_TOKEN` permits app quit. The secret is given only to the child University AI starts, not published in the descriptor. Cleanup may terminate only that exact Popen child, never a process discovered by name or stale PID.

The renderer retains contextIsolation=true, sandbox=true, nodeIntegration=false, no permissions, local allowlisted assets and no renderer networking. IPC is enabled only in the Electron main entry. Security references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox), [Node TCP API](https://nodejs.org/api/net.html).

## State mapping and concurrency

| Event | Activity |
|---|---|
| Resident application constructed / connected | Idle |
| AI question dialog invoked | Active token until request or dialog close |
| Capture start / region selection | Scanning token |
| OCR | Same Scanning token |
| Capture / OCR success | Release Scanning, Notification for 2 seconds |
| LLM request in UI worker | Independent Thinking token |
| LLM completion | Release Thinking, Notification for 2 seconds |
| NotificationService delivered important event | Notification for 2 seconds; existing notification delivery preserved |
| Capture / OCR / LLM / notification failure | Release operation token where applicable, Error for 3 seconds |
| Region selection cancelled | Release Scanning without a success pulse |
| All operations and transient pulses finished | Idle |

Python begin/finish tokens are independent across requests, captures and dialogs. Releasing one cannot cancel another. A short notification never obscures Thinking; Scanning wins while an independent capture overlaps an LLM. Error temporarily wins, then the still-running activity resumes. Expiry is based on monotonic time and continues when an overlay is unavailable. Error pulse duration is display duration, not a claim that the underlying failing service has recovered.

## Verification commands

```powershell
npm run check
npm run test:native
```

`check` covers native host boundaries, real local IPC/schema/auth/priority/lease/disconnect/reconnect/ownership, and existing nine-state renderer checks. `test:native` starts a real Electron test profile, checks transparency/position/interaction, then sends protocol states and reads `window.nova.getState()` through a fixed test-only assertion. Renderer crash/load failure returns a failing exit status in smoke mode.

From University AI, opt-in Windows integration test:

```powershell
python tools/native_overlay_smoke.py --overlay-dir C:\path\to\nova-visual-playground\overlay-prototype
```

It uses an isolated application data directory, real Qt Tray, a dedicated sample window, real capture/Tesseract/Ollama and Electron. It avoids changing the user's Toast registration, observes renderer states, forces termination of its own child and checks independent restart ownership. Its `.test-artifacts/native-*/report.json` records results without answer text. `--integration-smoke` uses an isolated Electron profile and writes only state labels to `.test-profile/integration-native/states.jsonl`; the observer is never loaded for normal startup. It is a native automated test, not a human visual usability review.

## Known scope limits

- No installer, Windows startup registration, RAG/indexing integration, answer rendering, or service restart management.
- No special screen-capture exclusion for the floating core; a full-screen capture can include it. The native integration test captures its own sample window away from the core.
- Native GUI test requires a real interactive Windows desktop. Sandboxed/headless runs may fail GPU startup; they do not establish a passing native test.
- Mixed DPI, multiple monitors and long-duration resource profiling need separate validation.
- Python coalesces fast successive states; a very short operation need not visibly animate every intermediate state. Ongoing priority is preserved.
- Connect-only mode is the default until the user specifies the installed overlay directory/command. The repository does not assume a fixed checkout layout.
