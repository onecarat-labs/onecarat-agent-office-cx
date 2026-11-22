# フェーズ1の仕上げ（2026-11-15）

作者のフェーズ1仕上げ指示に基づくUI・操作性・テスト改善。実Codex/app-serverは起動せず、実Thread作成・モデル送信・認証操作は行っていない。テスト中のセッション・Turn・承認はmockFactoryによるローカルfixtureのみ。

## 問題と修正

| 確認した問題 | 修正 |
|---|---|
| 画面更新失敗で送信以外の操作が残り、同じrevisionの応答で復旧しない | UI操作を無効化し「最終確認時点」の表示にする。画面再確認ボタンと定期GETで復旧し、同じrevisionでも再描画する。Codex再接続・POST再送はしない |
| 定期GETが重複し得る | 状態取得を単一の進行中Promiseにまとめる。HTTP待ちに35秒の上限を設ける。タイムアウトはサーバー側処理の取消保証ではなく、結果不明と案内 |
| 別セッションへ下書きが持ち越される | セッション単位のメモリ内下書きにする。境界変更では全破棄し、古い非同期送信応答で別セッションの入力を消さない |
| 操作中もボタンが有効で、クリックが無反応に見える | 操作中のボタン停止、入力readonly、処理中案内、aria-busyを追加 |
| 解消後も古い画面エラーが残る | 通信・操作・ランタイムエラーを区別して描画。通信復旧や正常な次操作で該当の一時エラーを消す。ランタイム側の未解決エラーは残す |
| 不明状態で送信ボタンが有効／空白依頼が送られる | 既存ランタイム条件を画面にも反映し、不明時は送信不可。空白入力はHTTP要求前に止める。maxlength=12000 |
| Threadがidleに戻ると直近Turnの結果が分かりづらい | Threadの待機表示を保持し、別途「直近のTurn：実行完了／失敗／中断」を表示。Item完了からTurn完了を推定しない |
| 更新時にセッション・承認ボタンのフォーカス、会話スクロールが失われる | IDでフォーカスを復元。末尾閲覧時のみ会話末尾を追従し、途中閲覧時はスクロール位置を維持 |

認証ゲート、権限チェック、Runtime/RPC/状態投影、実行プロバイダー判定は変更していない。安全機構の条件緩和なし。CC版は既存Playwrightの読み取り参照のみで、書き込みやCC版でのテスト実行はない。

## 検証

- `node --test tests/*.test.mjs probes/phase1-e2e-greeting/provider-gate.test.mjs`：70件成功、失敗0。既存の認証境界・遅延応答・ID分離・二重承認・再送停止・未知イベント・HTTP境界を含む。
- `node scripts/check.mjs`：構文検査成功。
- `scripts/ui-check.mjs`：Windows上の既存Edge headless、mockFactory限定。27項目成功。接続、架空セッション作成、入力、承認/拒否、回答、完了、失敗、不明、照合拒否、通信断ロック、同revision復旧、空白入力で要求0、エラー解除、直近Turn結果、下書き分離、処理中ロック、セッション切替、認証変化時の情報破棄、隔離、再接続、古い通知無視、切断、モバイル幅、ページ例外0。
- 自動UI結果：[ui-result.json](../artifacts/ui-result.json)。デスクトップと390px幅の会話あり画面を画像でも確認。横スクロールなし。
- 画像：[desktop](../artifacts/office-desktop.png)、[mobile session](../artifacts/office-mobile-session.png)、[mobile disconnected](../artifacts/office-mobile.png)。すべてモック。

保存済み実E2E資料を変更していないことを作業前後のSHA256で確認：

| ファイル | SHA256 |
|---|---|
| probes/phase1-e2e-greeting/consumed.json | C4E0F17F23C0C60A0A5A498102E14957D440F24A8CAEEFFD5CFE8E52AA70F981 |
| run-1yNyRR/result.json | E08D25CD84E9A5C43B2F5659BCFB48740BE3E2FA73F2039533B3933D05E5EED5 |
| run-1yNyRR/office.png | 0CB27DA1F1E921841656AEAA11621FB895F01AE6175717798F3E53FBA6C15778 |

## 変更ファイルと残る範囲

製品変更はui/app.mjs、ui/index.htmlのみ。検証はscripts/ui-check.mjs。READMEと本書・VALIDATION_PLANを更新した。テスト成果物はartifacts、fixture保存先は.cx/ui-tests。

今回発見した対象内の不具合は修正し、モック回帰を完了。実モデルでの追加再検証はしていない。実承認・拒否、実通信断・認証切替、サブエージェント、復元、将来CLIへの互換性は未実証のまま。35秒タイムアウト経過の実時間試験とスクリーンリーダーによる手動操作は未実施。実E2E成功は以前の挨拶1回に限定する。ページを再読込した下書き復元は行わない。

Gitリポジトリではないためgit diffによる比較はできなかった。新規Git初期化や公開は行っていない。追加モデル検証には別途承認が必要。Research Lab・秘書には進まず、この仕上げで停止する。
