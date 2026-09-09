# N.O.V.A. Overlay × University AI Integration v1 — 作業報告

作業日: 2026-09-09〜10（JST）。実装範囲は状態表示のみ。回答本文やFull HUDへの結果表示は追加していない。

## Architecture

`University AI UI/controller/NotificationService → NovaOverlayAdapter → NovaOverlayClient → authenticated localhost TCP → Electron main → sandboxed preload bridge → window.nova.setState(state)`

Pythonからrendererを直接操作しない。Adapterがクライアント障害を吸収し、通信・再接続・子プロセス起動は専用daemon threadで処理する。既存QMessageBox、Tray、Windows Toast/fallback、LlmServiceの公開API、DB/キャプチャ/OCR保存の責務を維持した。

## Protocol

- IPv4 127.0.0.1限定。ポートはOSが割り当てる。
- ユーザー専用LocalAppDataのdiscovery JSONにportと起動ごとに更新する256-bit tokenを保存。
- NDJSON v1、state/shutdownの固定schema、4096-byte受信バッファ制限、最大16接続。不正state・任意フィールド・不正tokenは切断する。
- 外部からJavaScript、rendererメソッド、ファイル操作、コマンド実行を指定できない。
- heartbeat 1秒、状態lease 4秒、切断時即座に接続の状態を解除。Pythonは1秒間隔で再接続し、最新の状態のみ再送する。
- 所有者token一致時のみOverlayへ終了を要求。独立Overlayにはdetachに相当するshutdown通知だけを送り、終了しない。必要な子プロセス終了も自身のPopen handleに限定。
- contextIsolation=true / sandbox=true / nodeIntegration=false、renderer通信禁止・資産allowlistを維持。
- message引数はPythonから送らず、v1のOverlayはschema上のmessageも表示しない。質問・回答・OCR本文・通知本文はIPCへ流さない。

完全な仕様と起動手順は [Integration v1仕様](overlay-prototype/INTEGRATION_V1.md) を参照。

## State mapping

| 処理 | 表示 |
|---|---|
| startup / connection | idle |
| AI質問画面の呼び出し | active |
| capture開始・範囲選択 | scanning |
| OCR | scanning継続 |
| LLM要求 | thinking |
| capture/OCR/LLM成功・重要通知 | notification（2秒） |
| 回復可能な処理エラー | error（3秒） |
| 全活動・一時表示が終了 | idle |

優先度は `error > scanning > thinking > speaking > notification > active > idle`。処理ごとのtokenで所有権を分け、一つの処理終了が別処理を取り消さない。通知はThinkingを上書きせず、OCRからLLMへ移る際にはScanning tokenを解放する。

## Changed files

### Mill-Miya/university-ai

ローカル作業コピー: `.integration-work/university-ai`。開始時のHEADは `1c0250a`。

- `university_ai/overlay/__init__.py`, `client.py`: fail-open Adapter、activity管理、IPC、再接続・起動・終了。
- `university_ai/app/main.py`, `lifecycle.py`: composition、起動、終了、例外時cleanup、二重stop防止。
- `university_ai/ui/llm.py`: UI workerでThinking/Notification/Error。質問画面を閉じても実行中workerを破棄しないためQApplicationに保持。
- `university_ai/ui/capture.py`: Capture/OCR/LLM連携、選択キャンセル、重複worker参照の保持。
- `university_ai/notification/service.py`: 既存通知と同時に状態を反映。
- `tests/test_overlay.py`: 追加19テスト。
- `tools/native_overlay_smoke.py`: 実Windowsの通し検証。
- `docs/NOVA_OVERLAY.md`, `README.md`, `.gitignore`: 設定・仕様・検証手順、一時成果物の除外。

### Mill-Miya/nova-visual-playground

開始時のHEADは `4321c1c`。

- `overlay-prototype/integration.cjs`: localhost IPC、schema/auth、接続単位のpriority/lease、所有者別shutdown。
- `overlay-prototype/main.cjs`: IPC→既存settings bridge、native focusと処理状態の分離、テスト失敗時の終了コード。
- `overlay-prototype/renderer.js`, `overlay.css`: state受信と操作可能状態に連動するdrag領域。
- `overlay-prototype/integration-test.cjs`, `test.cjs`, `native-smoke.cjs`: プロトコルとnative実行の検証。
- `overlay-prototype/integration-observer.cjs`: 明示的なnativeテストモードのみでrendererの状態を観測。
- `overlay-prototype/package.json`: IPCチェックをcheckへ追加。依存・lockfileは変更なし。
- `overlay-prototype/INTEGRATION_V1.md`, `overlay-prototype/README.md`, `README.md`: 手順・仕様。
- `.gitignore`: ローカルの別リポジトリ作業コピーを除外。
- 本報告書。

`visual-playground/`のブラウザ版コードは変更していない。前回の`audit-2026-09-09.md`も変更・コミット対象にしていない。

## Test results

- University AI: **86 passed**（既存67 + 追加19）。Overlayを起動しないunit/integration suiteを実行。環境はPython 3.12、PySide6 6.11.2。
- Overlay `npm run check`: **PASS**。native host、schema/auth/サイズ制限、fragmentation、priority、lease、disconnect/reconnect、ownership、既存9状態APIと描画・demo・reduced-motion等。
- Overlay `npm run test:native`: **PASS**。Windows/Electron 44.3.0で透過、Core拡大、Esc、位置・サイズ、外部7状態、非フォーカス維持、切断→Idle、再接続を確認。
- 実Qt→Capture→Tesseract→Ollama→Python IPC→実Electron: **PASS**。下記参照。
- 両リポジトリの`git diff --check`: 問題なし。

環境上の試行履歴: 初回pytestは既定temp directoryへのアクセス制限でsetup errorとなり、作業コピー内の専用basetempへ切り替えた。制限環境のElectronはGPU起動に失敗したため、実Windowsセッションでnativeテストを実行した。テスト用設定ファイルのrenameで一時的なEPERMログも観測したが、最終native smokeでは保存assertを含めて成功した。初回の強制終了テストは5秒のプロセス終了待ちが不足し、Windowsの終了を待つ方式へ調整後に成功した。

## 実機検証とmanual verificationの区別

Windows上の自動native通し検証で、**実サービスと実renderer**について以下を確認した。

1. University AI起動→N.O.V.A. Idle。
2. 実Ollamaへの質問→Thinking→Notification→Idle。回答は既存Qt画面内。
3. 専用サンプル画面を実Qtでキャプチャ→実Tesseract `jpn+eng`→実Ollama→Thinking→Notification→Idle。既存QMessageBoxも表示経路を維持。
4. 意図的にworkerエラーを発生→Error→Idle。
5. 自身が起動したOverlayを強制終了→University AI Trayが存続し、次の実LLM要求も成功。
6. 独立Overlayを再起動→現在状態を再同期。本体終了後も独立Overlayが存続。
7. 本体が起動したOverlayは本体client shutdownにより終了。

最終の生レポートはローカル `.integration-work/university-ai/.test-artifacts/native-xn65_xks/report.json`。初回接続中に観測したrenderer状態列は `idle → active → thinking → notification → idle → scanning → thinking → notification → idle → error → idle`。

これは手動の見た目・操作感レビューとは区別する。人間の目視による全状態レビュー、実Windows Toastの目視、混在DPI・複数モニター・長時間負荷測定は未実施。テストはユーザーのStart-menu通知登録を変更せず、専用データ・サンプル画面を使用した。

## Known limitations

- 自動起動するには`NOVA_OVERLAY_DIR`またはcommand設定が必要。無設定時はconnect-only。
- 起動試行は一度。本体は再接続を継続するが、閉じられたOverlayを繰り返し自動再起動しない。
- Full-screen captureにはCoreが映り込む可能性がある。
- 短時間の処理は状態がcoalesceされ、すべての中間状態が肉眼で見える保証はない。
- Errorの3秒表示終了は外部サービス自体の復旧を保証しない。
- descriptorはユーザー専用ディレクトリのACLに依存し、同じOSユーザーの悪意あるプロセスから隔離するものではない。
- 回答本文のOverlay表示・Full HUDの結果UIはIntegration v2以降。

## Commit

ブランチは両リポジトリとも`codex/integration-v1`。

- University AI: `ef197a9fa1af99cf2d84d9660f9474a04af9ef51`。
- Overlay: 本報告を含むコミット。自身のhashは作業完了メッセージで提示する。

ローカルコミットのみ。リモートへのpush・公開・mergeは行っていない。
