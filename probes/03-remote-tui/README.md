# 技術検証03：remote TUI（非対話起動まで）

実施日：2026-11-15 JST。今回の作者指示により、過去の文書整備限定の制約に対し、モデル呼出し・外部サービス接続・既存データ変更を伴わない検証が個別に許可された。製品実装は許可されていない。

## 保存資料

- `inspect.mjs`：分離した環境でバージョンと付属ヘルプを取得。`help.json`に保存。
- `probe.mjs`：認証付きapp-server、2つの観測クライアント、無入力のremote TUI起動と終了観測。
- `result.json`：秘密情報と会話本文を含まない集計結果。
- `runs/<UTC時刻>/result.json`：実行ごとの結果。server-home／tui-homeは使い捨ての検証用状態であり製品資産ではない。
- `inspection-home`：ヘルプ取得用の分離状態。

CLIが生成する分離ホーム（SQLite等を含む）は.gitignoreで除外した。集計JSONとCLI自身の内部状態は区別し、内部状態を配布用の検証結果には含めない。

新規依存なし。Node.jsの標準モジュールだけを使用。対象exeはコード中のWindows用絶対パス。実測はCodex CLI 0.169.0、Node v24.19.0。全コード・生成先はこのディレクトリ配下。

## 起動・認証方法（ローカル付属ヘルプで確認）

```text
codex app-server --listen ws://127.0.0.1:<port> --ws-auth capability-token --ws-token-sha256 <digest>
codex --remote ws://127.0.0.1:<port> --remote-auth-token-env ONECARAT_PROBE_WS_TOKEN --no-alt-screen
codex resume --remote ws://127.0.0.1:<port> --remote-auth-token-env ONECARAT_PROBE_WS_TOKEN <SESSION_ID>
```

これらは構文の説明であり、再実行や対話操作の承認ではない。resumeはヘルプ確認のみで実行していない。トークンは起動ごとにメモリ内で生成し、remote TUI子プロセスの環境変数にのみ渡す。サーバー引数にはハッシュを渡し、トークン・ハッシュを結果へ保存しない。

## 到達点と停止理由

app-serverと2つの観測クライアントの認証・初期化・thread/listは成功。remote TUIは標準入出力をpipeにして起動すると `stdin is not a terminal` で終了コード1。対話端末・キー入力・ログイン操作へは進まなかった。

この結果はremote TUIの認証失敗やWindows非対応を示すものではない。remote TUIの接続成立、Thread生成・選択・再参加、同じThreadの共有、Threadイベント配送は未検証。空のthread/listから、未永続化・未一覧化のThreadも存在しないとは断定しない。

## 分離とログの制約

子プロセスには環境変数を許可リストで渡し、CODEX_HOME・USERPROFILE・APPDATA・LOCALAPPDATA・TEMP・TMPを検証用ディレクトリへ設定。既存ログイン・APIキー・既存セッション用環境を引き継がない。ログイン情報の読取・コピーや既存設定の書換えは行わない。CLI認証保存先はfileを指定。

モデル用URL・ChatGPT用URL・プロキシは127.0.0.1:9に設定し、更新チェック・analytics・feedback・OTel出力を無効化。これは通信設定上の抑止であり、OSレベルの全通信監査ではない。プローブから外部サービスを呼び出す処理、プロンプト、turn/startはない。

標準出力・標準エラー本文は結果に保存せず、バイト数と既知エラーの分類だけを保存する。通知はメソッド名とリクエストID有無のみ。Thread一覧は件数・キーだけ。実際の会話は読み取らない。`modelTurnRequestsSent=0`はプローブが送る要求の範囲を示し、CLI内部通信を独立計測した値ではない。

終了は保持している子プロセスハンドルに対してのみ行い、PID検索・一括kill・既存セッションの停止は行わない。管理者権限や権限昇格は使用していない。

付属ヘルプは当該バージョンの公式CLIインターフェースの根拠。外部サービス接続の制約に従いWeb調査はしておらず、オンライン公式仕様・ソースによる動作保証は確認していない。
