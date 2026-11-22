# 初期化時アクセス拒否の切り分け

2026-11-15。通常ユーザーゲートを通る新規診断probes/initialize-diagnosis/access.mjsでinitializeだけを送信。認証API、Thread、モデルは0回。権限・認証ホーム・安全ゲート・製品コードは変更していない。stderrはメモリ上で固定語・既知ファイル名・エラー番号へ分類し、生出力を保存していない。

## 実測

1. 10:39:43 UTC、PID30372、exit=1。`.codex/tmp/arg0`の一時領域処理とPATH補助ファイル作成でos error 5。その後、SQLite state runtimeの初期化でdatabase fileをopenできず終了。読み書きを伴う状態DBのオープンが起動を阻害している。既存DBの内容は読まず、メタデータだけでstate_5.sqlite、-wal、-shmの存在を確認した。エラーが本体/WAL/SHMのどれへの操作だったかまでは未確定。
2. 10:40:12 UTC、PID14156、exit=1。既存認証ホームを変更せず、診断専用のsqlite_homeとlog_dirをCX内の新規領域へ指定。SQLite固有のエラーは消えたが、arg0警告と対象未記載のos error 5で終了。これだけでは接続を成立させられなかった。状態DB移設を製品へ採用していない。

両方ともAdministrator=Falseの確認後に実行し、stdio EOF/RPC_DISCONNECTEDとなった。子プロセスcloseまで待機し終了済み。Thread作成・認証確認には進んでいない。

## 公式実装との照合

- arg0のPATH補助作成に失敗しても警告を出して継続する実装。この警告単独を致命原因とはしない。[公式v0.169.0 arg0](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/arg0/src/lib.rs#L139)
- app-serverは状態DBの初期化失敗をエラーとして返す。[app-server起動処理](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/lib.rs#L637)
- StateRuntimeはsqlite_homeを作り、DBを開いてマイグレーションする。単なる読み取りではない。[StateRuntime](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/state/src/runtime.rs#L110)

## 結論と限界

ホーム明示後の最初の致命エラーはSQLite状態DBのオープン失敗と特定できた。arg0のディレクトリ作成にも明示的なアクセス拒否がある。実行環境がCodexホームへの書き込みを制限する条件と整合する。ただしWindows ACLそのものの誤設定、データベース破損、認証エラーとは断定しない。ローカルDB配置へ切り替えた後の拒否対象は未特定。

通常権限の制限下では書き込み制限が残り、既知の制限外経路は管理者となる。製品設定だけで安全に解決できたとは報告できない。認証キャッシュのコピー、ホーム権限変更、ゲート緩和、管理者E2Eには進まない。

次の最小手段は作者の非管理者PowerShellで通常のユーザープロファイルへのアクセスが可能かを確認すること。最初は以下の権限確認とモデルなしpreflightだけとする。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
whoami /groups
node .\probes\phase1-e2e-greeting\preflight.mjs
```

Administrator=False、Mediumを確認する。Trueならpreflightも進めない。preflightはinitialize/account/read/config/readだけで、モデル・Thread操作を許可しない。出力にchatgpt/connectedが揃うまでは実モデルE2Eを行わない。この手動操作は今回実施していない。
