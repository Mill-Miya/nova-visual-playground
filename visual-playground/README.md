# N.O.V.A. Visual Playground v2

既存本体から独立した、AIの存在感と外装を検討するCanvasプロトタイプです。依存パッケージ・外部フォント・画像素材・実通信・デバイス取得はありません。

## 起動と操作

```powershell
cd visual-playground
npm start
```

http://127.0.0.1:4173 にアクセス。npm install は不要。index.htmlの直接オープンでも動作します。サーバー終了はCtrl+C。

- Coreクリック：Floating → Active → Full → Floating。Shutdown後のCore位置をクリックするとBoot。
- 1–9：Idle / Active / Listening / Thinking / Speaking / Scanning / Notification / Error / Full HUD。
- Esc：入力欄にフォーカスがある場合もIdleへ戻り、デモとシーケンスを中断。
- HまたはLAB CONTROLS：開発操作盤を表示。初期状態は収納。
- CORE：Floatingの基準外周40–70px（初期58px）。楕円軌道の張り出しと光のにじみを除く。
- SEQUENCE：9状態を約40秒で一巡しIdleに戻る。STOPまたは手動切替で中断。
- CINEMATIC VIEW：背景グリッドを含むLAB装飾をIdleで消し、Coreだけを残す。Hで操作盤を再表示可能。通常モードに戻すにはチェックを外す。
- BOOT：2.2秒。point → nucleus → shell → orbit → amber node → pulse → Idle。
- SHUTDOWN：2秒。HUD収納 → 軌道消失 → 粒子収束 → 球縮小 → 白点 → 消失。IdleというAPI状態は維持し、表示のみ消える。
- DEVICE LINK：6秒。検出 → 軌道整列 → チャネル → QR風表示 → 転送 → 接続成立 → 断片収納。QRは読み取り用の情報を持たない装飾。実際の接続・転送はしない。
- SOUND：初期OFF。ONで6イベント用の短い合成サイン波。完成音源ではない。

## N.O.V.A. Concentric Signature

白〜青白の不透明核、暗い内部、明るい薄膜を重ねたシアンの球体に、中心を揃えた同心円リングと主アンバー点1個を組み合わせています。最新のユーザー指定に合わせ、傾いた楕円・非対称軌道を廃止し、切れ目とセグメントも対向配置にしています。内部粒子はすべて青系です。Idleの呼吸は6秒周期・±2%、外周の姿勢変化はほぼ静止、粒子は極低速です。

Coreから300px以内のpointermoveに対し中心核だけ最大4px移動します。本体の位置は追従せず、主アンバー点の位相だけわずかに寄せます。reduced-motion時は追従しません。

## 状態ごとの視覚とHUD

| 状態 | 演出 | HUD |
| --- | --- | --- |
| Idle | 静かな呼吸、微粒子、対称な同心円と1点 | なし |
| Active | Core拡大、名称・状態・精密目盛り | なし |
| Listening | 外から内へ消える弧状波、受容 | AUDIO / SIGNAL |
| Thinking | 0.4秒で外周減速、粒子収束、核を徐々に強化、アンバー点のみ加速 | CORE / PROCESS |
| Speaking | 内から外へ円形波、球面リングの微細な変形 | AUDIO OUT |
| Scanning | 円形走査と水平線、Core外の仮想対象、2.6秒でロック | VISION / TARGET / ANALYSIS |
| Notification | 短い控えめな発光、イベント色 | EVENT / SOURCE |
| Error | 軌道・内部の位相ずれ、主点が一度逸脱、5.6秒で再同期 | DIAGNOSTIC / RECOVERY |
| Full HUD | Orbital Signatureを大きく表示し暗い余白を保持 | CORE / MEMORY / SYSTEM |

Thinkingから別状態へ移る際に完了パルスを1回描画します。Errorは状態名をerrorのまま保ち、表示をSIGNAL RESTOREDへ変更します。Scanもscanningのままロック状態を保ちます。実データではなく時限の視覚デモです。

## HUD生成タイムライン

Core収縮（0–350ms）→ 主点の偏向 → 接続線（360–630ms）→ 接続先光点 → フレーム（710–980ms）→ 文字（1030–1250ms）。各パネルを110msずらします。収納は文字 → フレーム → 接続線の順で600ms、その後Coreが縮小します。連続切替では表示途中の値から収納し、古い文字が再点灯しないようにしています。

HUDは3個の再利用スロットと状態別データで構成し、不要なパネルはDOM上でも非表示。Speakingのみ指定どおり1枚。パネル位置は状態変更・resize時に計算し、毎フレームのDOM検索・getBoundingClientRectはありません。

## API互換

```js
window.nova.states; // 従来どおりの9状態
window.nova.setState('thinking');
window.nova.getState(); // { state: 'thinking', level: 'active', simulated: true }
// v2の追加API。既存9状態には追加しない。
window.nova.playDemo('boot'); // 'shutdown', 'device'
window.nova.setCinematic(true);
window.addEventListener('nova:statechange', e => console.log(e.detail));
window.addEventListener('nova:sound', e => console.log(e.detail.name));
// start / expand / lock / notify / error / close
```

## パフォーマンスと動作軽減

devicePixelRatioは2が上限。Canvasサイズはstageの実寸に合わせます。非表示タブではRAFを停止し、SEQUENCEを中断。進行中のBoot等は表示復帰から再開します。時計は秒単位で更新。reduced-motionでは追従・浮遊・継続回転・波の移動を抑制し、安定したIdleを再描画しません。デモの段階やScan完了等の意味的な更新は維持します。

## 検証

```powershell
npm run check
```

実app.jsを決定的なDOM/Canvasホスト上で実行します。9状態API、状態別HUDと時間差、有限座標、連打、Scanロック、Recovery、Boot/Shutdown/Deviceの完了と中断、Cinematic、pointer、SEQUENCE全走と停止、非表示RAF停止・重複防止、DPR上限、reduced-motionの安定時描画抑制、6音イベント、毎フレームDOM検索・計測なしを検証します。

ブラウザー検証の詳細は作業報告に記載します。自動テストはピクセル品質、音質、GPU性能、実機の画面輝度を保証しません。

## ファイルと統合境界

- index.html：Coreの操作、3つのHUDスロット、LAB操作。
- style.css：暗部、極細フレーム、Cinematic、幅・高さに応じた配置用スタイル。
- app.js：描画、状態、HUDタイムライン、デモ、音イベント。
- smoke-test.cjs：依存なしの実行テスト。
- package.json：起動・チェック。
- server.cjs：既存のlocalhost静的配信（v2で変更なし）。

university-ai、DB、OCR、LLM、Scheduler、Memory repository等は変更しません。将来の本体状態アダプター、実音声の振幅、読み取り専用HUDデータ、デスクトップ透過・常駐ホストは別作業です。GitHub Pagesはmasterブランチの静的ファイルを配信でき、ビルドや外部依存の追加は不要です。

### v2ブラウザー確認（2026-09-09）

Codex内蔵ブラウザーでIdle、Full HUD、Listening、Thinking、Speaking、Scanningの表示を確認。1280×720のHUD座標、844×390と390×844の配置、仮想ターゲットのロック、Device LinkのQR風表示と完了、Shutdown消失、Boot復帰、Cinematic切替を確認しました。最後のユーザー指定により、楕円・非対称軌道を対称な同心円へ変更した後もFull HUDとCinematic Idle、Device Link、Boot/Shutdownを確認しています。

未確認：Safari/Firefox、実機モバイル、スクリーンリーダー音声、効果音の聴感、HDR等の表示差、実GPUのFPS計測。reduced-motionは自動テストで検証し、実ブラウザーのOS設定切替は未実施。モーションの映画的な質感は最終的にユーザーの目視評価が必要です。
