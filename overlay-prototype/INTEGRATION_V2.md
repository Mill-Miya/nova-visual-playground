# N.O.V.A. Core — Integration v2

Integration v2 adds a Core menu and a fixed command bridge on top of v1. Existing answers remain in Qt; this is not a chat/HUD implementation. The v1 state, lease, priority, fail-open and ownership contracts remain in place. No dependency or browser `visual-playground/` change is required.

## Architecture and actions

`Active Core → orbital menu → narrow preload invoke → Electron main → authenticated local connection → Python daemon → queued Qt signal → ApplicationCommandDispatcher → existing Tray handler/controller`.

| Label | Command | Existing action |
|---|---|---|
| AI質問 | `ask_ai` | AiQuestionDialog |
| 範囲AI | `ask_region` | ScreenCaptureController.select_region_and_ask |
| 資料 | `open_documents` | DocumentsDialog |
| 設定 | `open_settings` | SettingsDialog |

Document-question and notification-history UIs do not exist on the v1 base, so they are excluded. Quit is not a Core command. The University AI Tray retains its existing graceful quit action.

The production Tray and Core share one fixed Enum-to-handler mapping. Dialogs are retained and opened asynchronously with QDialog.open(); a second invocation raises the existing dialog and returns busy. Qt UI creation happens only in the queued main-thread slot. One pending Qt delivery is allowed even across reconnects, preventing an unresponsive UI from accumulating intents.

## Compatible protocol extension

Still NDJSON `v:1`, 127.0.0.1, 4096-byte receive buffer, the existing rotating 256-bit token and at most sixteen connections. Discovery adds `"capabilities":["commands-v1"]`. A new Python client registers commands only when that capability is advertised; with an old Overlay it continues sending v1 states. An old Python client ignores the capability and remains state-only. The renderer never receives either authentication or ownership secrets.

Python → Electron:

```json
{"v":1,"op":"register_commands","token":"<credential>","commands":["ask_ai","ask_region","open_documents","open_settings"]}
```

Electron → the single fresh registered Python peer:

```json
{"v":1,"op":"command","token":"<credential>","request_id":1,"command":"ask_ai"}
```

Python → Electron:

```json
{"v":1,"op":"command_result","token":"<credential>","request_id":1,"command":"ask_ai","ok":true}
{"v":1,"op":"command_result","token":"<credential>","request_id":2,"command":"ask_region","ok":false,"error":"unavailable"}
```

Accepted Python packets still receive `{"v":1,"ok":true}`. The daemon demultiplexes command frames from acknowledgements. A success means the existing action was opened/started, not that OCR/LLM finished. Engine failures continue through the existing Qt error UI and v1 state mapping. Opening the AI dialog does not promise Ollama availability.

Unknown fields/commands, arbitrary payloads, malformed packets, wrong tokens and invalid IDs are rejected. IDs are increasing integers 1..2147483647 per connection. Fixed result errors are `unavailable`, `busy`, `invalid`, `failed`, `timeout`, `disconnected`, `duplicate`; no paths, URLs, code, question/answer text or tracebacks are accepted. Dispatch never uses a received string as a Python method name.

## Delivery and failure semantics

- Commands require exactly one live registered University AI peer; ambiguous/missing peers disable actions.
- One in-flight command and a 400 ms debounce in the sender; duplicate dialogs and active region operations also have application guards.
- IDs are recorded before queued UI dispatch. A duplicate/overlapping wire intent closes the session.
- The queued Qt slot checks its session's connected flag and a three-second deadline before invoking any handler. Detected disconnect invalidates queued work.
- Electron expires an unanswered command after four seconds and closes that connection. A late result cannot resolve a new request.
- No command retry queue exists. Reconnect advertises availability and sends the current state; it never replays an old command. After a lost reply the action may have happened, so the UI reports uncertainty rather than retrying.
- State heartbeats continue every second and may be resent. State priority remains error > scanning > thinking > speaking > notification > active > idle.
- Neither endpoint failure stops University AI. Owned-child shutdown and standalone protection are unchanged.

## Native UI

Ctrl+Alt+Space or the Overlay tray explicitly activates the Core. Idle is click-through. Active Core click opens four 92×44 logical-pixel buttons on a cyan orbit; amber is reserved for pressed selection. A small MOVE grip preserves dragging separately from the clickable Core.

Esc closes the menu first; a second Esc returns to click-through. Outside clicks, loss of focus, command selection, native Idle, an external return to Idle, or loss of command availability close the menu. Selecting a command releases native focus before Qt opens its existing UI. Merely opening the menu does not send Thinking/Scanning: University AI owns processing state. Concurrent higher-priority activity still wins.

The renderer caches its elements and uses click/pointerdown events, with no frame-loop queries, pointermove handler or command heartbeat. CSS respects reduced motion. Existing nine-state `window.nova` API and browser files are retained. The sandbox/contextIsolation/local-resource policy and disabled nodeIntegration remain unchanged.

## Verification

`npm run check` covers existing nine-state rendering and v1 IPC, plus schema, command registration/results, duplicate/inflight guards, ambiguity, disconnect/reconnect/no replay and timeouts. `npm run test:native` covers real Electron menu visibility, selection, Esc, outside click, click-through, disconnect and existing state transitions. Screenshots and reports remain ignored under `.test-profile/`.

The University AI `tools/native_core_acceptance.py` is an opt-in isolated interactive harness. It uses Ctrl+Alt+Shift+Space so an independent resident Overlay need not be stopped. Use Core → AI質問 and Core → 範囲AI, capturing only the white sample; then test owned crash, shared Tray action, independent restart and graceful shutdown. It never saves answers or tokens in its summary. The existing `tools/native_overlay_smoke.py` exercises real Qt/Tesseract/Ollama, fail-open and ownership.

## Acceptance and limits

Verified on Windows on 2026-09-10: University AI **105 passed**; Overlay `npm run check` and `npm run test:native` passed. Real Qt → Capture → Tesseract → Ollama → Electron passed, including native Qt Escape cancellation, error recovery, forced Overlay exit, reconnect and ownership shutdown. Actual desktop Core clicks opened the existing AI question, region AI and Documents UIs; a real question and sample-region answer completed in Qt. Core-menu Escape was exercised by desktop key input. Region Escape used the native Qt event test because the desktop automation inventory omits Qt Tool windows.

The operational desktop test is not human aesthetic approval. Status: **Integration v2 implementation complete, final acceptance incomplete**. The v1 Draft PRs stay open; v2 is stacked on `codex/integration-v1`, with no merge authorized.

Actual Core clicks, existing AI question UI, sample capture/OCR/LLM, native Core Esc and crash/reconnect are checked separately from human aesthetic acceptance. Human final review, standard-hotkey availability on the target desktop, mixed DPI/multiple monitors, long-duration resources and Windows Toast appearance remain acceptance work. The test desktop already has an independent Overlay using the standard hotkey; it is intentionally preserved.

A hostile process running as the same OS user can read that user's discovery file; loopback token authentication does not isolate it. Qt's synchronous capture/OCR can delay queued commands; expired commands fail without execution. No cloud or remote-network capability, dynamic execution, Full HUD answers, RAG, voice, or v3 feature is added.
