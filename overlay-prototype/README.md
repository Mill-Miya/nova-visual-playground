# N.O.V.A. Windows Overlay Prototype

ブラウザ版を残し、同じCore描画をWindowsデスクトップ上に常駐させる独立エントリです。OSログイン時の自動起動登録はしません。

## 起動

Node.jsとnpmがあるWindowsで、リポジトリのルートから：

```powershell
cd overlay-prototype
npm ci
npm start
```

追加依存はElectron 44.3.0のみ（lockfileで固定）。初回起動時にElectron本体を取得する場合があります。二重起動した場合は既存CoreをActiveにします。

起動すると右下〜右中央付近に58px基準のCoreが表示されます。背景は完全透過、枠・影なし、常時最前面、タスクバー非表示。Idleではウィンドウ全体がクリック透過で、背後のアプリをそのまま操作できます。小さな浮遊・6秒の呼吸を維持し、Idleのアンバー点・暖色反射は抑止します。

## 操作

| 操作 | 結果 |
| --- | --- |
| Ctrl+Alt+Space | Idle ⇄ Active、クリック透過を切替 |
| Active時にEsc | Idleへ戻り、クリック透過を再開 |
| Active時にCoreをドラッグ | デスクトップ上で移動、停止後に自動保存 |
| 通知領域のN.O.V.A.を右クリック | 呼び出し／収納・サイズ・位置リセット・終了 |
| 通知領域のアイコンをダブルクリック | Idle ⇄ Active |
| メニューのCore size | 40 / 50 / 58 / 64 / 70px |
| Quit N.O.V.A. | 完全終了、ホットキーを解除 |

通知領域アイコンはWindowsの隠れているアイコン一覧に入る場合があります。ホットキー登録が他アプリと競合した場合もトレイメニューから操作できます。別のキーを使う場合は起動前に `NOVA_OVERLAY_HOTKEY` をElectron accelerator形式で設定してください（例：`Control+Alt+N`）。

Active時はCoreが約140pxへ拡大し、Core上がWindowsのネイティブドラッグ領域になります。Active中は320×320pxの透明ホスト領域がマウスを受け取るため、作業へ戻る際はEscまたはホットキーで収納してください。ホストは固定サイズなので拡大時の中心位置は変わりません。

## 保存

`%APPDATA%\NOVA Overlay Prototype\settings.json` にCoreサイズと最後のウィンドウ位置を保存します。移動停止後250ms、サイズ変更時、終了時に保存します。保存失敗はコンソールへ表示し、Core自体は動作を継続します。

壊れた設定は初期値に戻し、サイズを40〜70pxに制限します。モニターが切断された場合や前回位置が画面外の場合は、利用可能な作業領域内へ戻します。初期位置は通知領域メニューからリセットできます。

## 構成

- `main.cjs`：Electronウィンドウ、クリック透過・フォーカス、ホットキー、トレイ、位置保存。デスクトップ機能の境界。
- `preload.cjs`：ready／Idle通知と限定された設定受信のみを公開するブリッジ。
- `renderer.js`：既存window.nova APIとホスト設定を接続。Overlay段階ではIdle／Activeだけを操作UIに公開。
- `overlay.css`：透過・Core以外の非表示・Active時のドラッグ領域。
- `prepare.cjs`：既存HTMLから `.generated/index.html` を生成。既存のDOM契約と描画資産を再利用し、コピーの手動保守を避ける。
- `window-state.cjs`：設定の検証、画面内への配置、サイズ制限。
- `test.cjs`：依存なしのホスト制御テスト。
- `native-smoke.cjs`：実Electronでの透過画素・Active拡大・設定保存確認。
- `package.json` / `package-lock.json`：OverlayだけのElectron依存とコマンド。

`visual-playground/` のブラウザ版・9状態・window.nova.setState/getState/statesと追加デモAPIは維持します。共有描画の `data-surface="overlay"` 分岐は背景グリッドとIdleのアンバーを消すだけで、通常ブラウザ描画には適用しません。HTML・CSS・Canvas主体の表現、DPR上限2、非表示時停止、reduced-motionを引き継ぎます。

将来のFull HUDは既存rendererとAPIを使い、ホストサイズ・配置とOverlayの表示スタイルを拡張できます。今回はFull HUD常駐・実通信・音声取得・university-ai本体への統合は行いません。

## ホストの境界

Node integrationなし、contextIsolationあり、sandboxあり。読み込めるファイルは生成HTMLと既存の描画資産、Overlay資産だけです。ネットワーク要求、新しいウィンドウ、ページ遷移、webview、権限要求は許可しません。位置保存はmainプロセスが固定の専用ファイルへ行います。レンダラー停止時は見えない操作妨害ウィンドウを残さず終了します。

## 検証コマンド

```powershell
npm run check
npm run test:native
```

`check`はウィンドウ設定、クリック透過切替、Esc、ホットキー・トレイ代替操作、IPCの送信元、ローカル資産制限、保存復元、画面外復帰、サイズ制限、終了処理と既存9状態を検証します。

`test:native`は一時的に実Overlayを起動して検証後に終了します。本番設定には触れず、`.test-profile/` に検証結果とIdle／ActiveのPNGを保存します。このフォルダーとnode_modulesと生成HTMLはGit管理から除外します。

Windowsの排他的全画面表示、管理者権限のアプリ、ロック画面などでの最前面表示は対象外です。Mixed-DPI、多数のモニター、長時間稼働は実環境ごとに確認が必要です。

### 今回の検証結果（2026-09-09）

- `npm run check`：PASS。既存9状態・finite座標・連続遷移・reduced-motion・音イベントと、Overlayホスト制御を検証。
- `npm run test:native`：PASS。実Windows/Electronで背景のアルファ0、Core描画、Active拡大、Esc収納、ネイティブ移動イベントによる位置保存を検証。
- 表示直後に通常の最前面指定が失われるケースに対処し、Overlay向けの `screen-saver` レベルを指定。切替時にも再設定。
- ホットキーでのActive化を実操作で確認。手動ドラッグと背後アプリへのクリック透過は、自動操作の画面座標にずれがあり、通しの目視確認は未完了。ドラッグ領域設定とクリック透過APIの切替はテスト済み。
- インストーラー配布、Windowsログイン時の自動起動、複数DPI環境・長時間稼働は今回の検証対象外。

技術仕様：Electron公式の [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) と [カスタムウィンドウ操作](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) に従っています。
