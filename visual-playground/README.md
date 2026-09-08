# N.O.V.A. Visual Playground

既存アプリから独立した外装・存在感の試作。依存パッケージ、外部フォント、ネットワーク接続、実データ、マイク・画面取得は使用しません。

## 起動

`visual-playground/index.html` をブラウザーで直接開くか、Node.jsを使って以下を実行してください。npm install は不要です。

```powershell
cd visual-playground
npm start
```

http://127.0.0.1:4173 にアクセス。終了は Ctrl+C。別ポートは環境変数 PORT で指定できます。

## 操作

- Coreクリック: Floating → Active → Full HUD → Floating。
- 1–9、またはLAB CONTROLS: Idle / Active / Listening / Thinking / Speaking / Scanning / Notification / Error / Full HUD。
- Esc: 収納。H、またはLAB CONTROLSボタン: 開発用操作盤の表示切替。
- COREスライダー: Floatingの外周直径40–70px（初期58px、光のにじみを除く）。Activeの外周直径148px。
- SEQUENCE: 静 → 呼出 → 入力 → 思考 → 発話 → HUD → スキャン → 通知 → エラー → 収納の約36秒デモ。STOPまたは手動切替で中断。
- SOUND: 初期OFF。ON時にWeb Audioの短いサイン波を使用。完成音源ではなくイベント確認用。
- 個別選択した状態は観察用に維持します。スキャンは約2.6秒でロックし、状態を保持します。
- OSの「視差効果を減らす / reduced motion」設定で浮遊・回転・波形の時間変化を抑制し、展開は即座に切替。非表示タブでは描画とデモを停止します。

## 構造

| ファイル | 役割 |
| --- | --- |
| index.html | セマンティックHUD、Core操作、分離した開発用操作盤 |
| style.css | 配色、球体からのパネル生成・収納、画面サイズ対応 |
| app.js | Canvas球体・リング・粒子・走査、状態遷移、効果音イベント |
| server.cjs | Node標準ライブラリのみのlocalhost静的サーバー |
| package.json | 起動・構文・実行チェック |
| smoke-test.cjs | 依存不要の描画・状態遷移スモークテスト |
| README.md | 操作、設計、統合境界 |

参考画像からは暗いネイビー、シアン・青白の発光、多重リング、微細なグリッド、目盛り、軌道光点、少量のアンバー、四方へ伸びる接続線を採用。画像そのものや画像内の装飾・数値の配置はコピーしていません。

独自に、球体内部の経緯線と粒子、通常時の小さな常駐形態、余白を残した横長HUD、段階的な生成、短い効果音イベントを追加。縮小時は文字・パネル → 接続線 → 外周リング → 球体の順に収束します。数値はすべて固定のダミーで、時計のみローカル時刻です。発話・入力波形は合成モーションです。

## 将来の統合

`window.nova.setState('thinking')` と `window.nova.getState()` を試作用APIとして公開しています。

```js
window.addEventListener('nova:statechange', event => console.log(event.detail));
window.addEventListener('nova:sound', event => console.log(event.detail.name));
// sound: start, expand, lock, notify, error, close
```

統合時には、本体の状態イベントを上記状態に対応付けるアダプター、実音声の振幅入力、HUD用の読み取り専用データ、完成音源の再生担当を別途用意してください。ブラウザー内の常駐表現であり、デスクトップの常時最前面・透過・クリック透過・ドラッグ・ホットキーは未実装です。OS上のFloating CoreにはElectron/Tauri等の別ホストが必要です。本体への組み込みは今回の対象外です。

この作業フォルダーは空のGitリポジトリから開始しました。university-ai本体はこのフォルダーに存在せず、DB、OCR、LLM、Capture、Scheduler、Memory repositoryや既存Repository構造は変更していません。

## 検証

```powershell
npm run check
```

手動確認: 9状態、Core循環、Esc収納、連続切替、スライダー、操作盤切替、シーケンス停止、音OFF/ON、狭い画面、reduced motion。Web Audioはブラウザーのユーザー操作制限に従います。

### 検証結果と制約

依存なしの `smoke-test.cjs` で、実際のapp.jsを最小DOM/Canvasホスト上で実行し、9状態、有限な描画座標、連続切替、スキャン完了、収納時のARIA状態、狭い描画サイズ、reduced-motion分岐、シーケンス停止、6効果音イベントを確認します。これはピクセル品質や実ブラウザーのレイアウト・音質を保証するテストではありません。

ローカルブラウザーの初回ページ読み込みと操作要素の表示は確認しました。画像取得・再接続がタイムアウトしたため、スクリーンショットでの外観レビューと実ブラウザーでの全操作検証は未完了です。
