# 技術検証06：モデルなしの同一Thread参照・再参加

2026-11-15、Windows疑似端末・通常ユーザー権限で実測済み。コードは `probe.mjs`、結果は `result.json` と同ファイルが指す `runs/` 内に保存した。詳細は `../../docs/VALIDATION_PLAN.md` の検証06を参照。

## 実行と制限

使用コマンド：`node probes/06-subscription/probe.mjs`。対話端末が必要だが入力はしない。今回の検証は終了済みであり、再実行やモデル検証を求める手順ではない。

- Codex CLI 0.169.0、独立したserver-home/tui-home、無効なローカルモデル接続先を使用。既存認証を使用・コピーしない。
- ランダムな認証情報による127.0.0.1 WebSocket。無認証・誤認証の拒否も確認する。
- 検証05のdry-runゲートを読み取り利用し、TUIのturn/startは常に遮断。観測クライアントは参照・再参加用メソッドのみ許可し、read/resumeは今回のThread IDに限定する。
- 既存検証05の消費済みマーカーは使用・変更しない。新規プロセスのPIDと所有関係を記録し、所有する子プロセスだけを終了する。
- 本文・認証情報・生のTUI出力は保存しない。結果のturnsArrayLengthはincludeTurns:falseの応答要約であり、履歴全件取得の証拠ではない。

## 実測

TUIが作成した新Threadはidle。A/Bのreadは成功したが、個別・同時・A再接続のresume計5要求はすべて `-32600: no rollout found for thread id [THREAD]`。TUI/A/Bは同じthread/startedを受信した。詳細イベント購読は成立確認できなかった。

TUI終了後もサーバーが稼働する間はread成功。モデル要求転送0、全所有子プロセス終了、両ポート閉鎖を確認した。終了後の隔離server-homeにはsessionsディレクトリがなく、rolloutファイルもなかった。検証05マーカーは前後のSHA256が一致した。

TUI起動時に、一時ディレクトリ内のCODEX_HOMEにPATH補助ファイルを置けない警告が表示された。起動・接続・Thread作成は成功しており、この警告をresume失敗の原因とは断定しない。
