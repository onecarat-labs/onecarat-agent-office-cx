# initialize切断の原因調査

調査日：2026-11-15。製品コード・フェーズ0コードは未変更。新規診断コードはprobes/initialize-diagnosis/probe.mjs。モデル、Thread、認証APIを一切呼ばず、各プロセスにinitializeのみ送信した。

## 結論

今回の直接原因は**実行制限下でCodexの既定ホームディレクトリ解決が失敗し、app-serverプロセスが終了すること**。同じCX RPC実装・起動引数・環境変数allowlistのまま、承認を得て制限外の通常ユーザー環境で実行するとinitializeに成功した。管理者権限への昇格は行っていない。

認証エラーではなく、認証照会より前の起動失敗。initialize要求がサーバー側で解釈された後に拒否されたという証拠はない。ホーム解決に使うWindows内部APIのどの呼出しが制限されたかまでは未特定。

## 比較実測

すべてCLI 0.169.0の同じ実行ファイル、同じ引数、stdio pipe、CXのsrc/rpc.mjsを使用。cwdは診断用の新規ディレクトリ。認証ファイルをコピー・表示せず、account/readも送っていない。

| 条件 | initialize | 終了コード | stderr |
|---|---|---|---|
| 制限下、CX標準env | 失敗（2回再現） | 1 | 134 bytes、ホーム解決失敗 |
| 制限下、新規隔離CODEX_HOMEのみ追加 | 成功 | 0 | 0 bytes |
| 制限下、HOMEDRIVE/HOMEPATH追加 | 失敗 | 1 | `Could not find home directory`を確認 |
| 制限下、HOME=USERPROFILE追加 | 失敗 | 1 | 同じホーム解決失敗 |
| 制限外、CX標準envのまま | **成功** | **0** | **0 bytes** |

制限外成功：10:21:23 UTC、PID 23528。実行許可は診断スクリプトに限定して取得。モデル・Thread操作やE2E再実行へ拡張していない。

失敗時の観測順はstdout EOF → RPC_DISCONNECTED → child close(exit 1)。強制killは発生していない。成功時も記録末尾にRPC_DISCONNECTEDがあるが、これはinitialize成功後に診断がstdinを閉じて正常終了させた結果。成功前の切断と区別する。全診断プロセスはcloseイベントまで待機した。

## 起動・通信の確認

- src/codex.mjsはread-only sandbox、on-request承認、web search無効等を指定し、app-server --listen stdio://を起動。これらの引数は比較試験で共通。
- 標準入力・出力・エラーはpipe。JSONは改行区切り、要求にid/method/params。initializeのclientInfoはonecarat_cx / 0.1.0、capabilities.experimentalApi=false。jsonrpcフィールドを付けない形式は過去成功コードと共通。同一要求が今回も成功しており、プロトコルバージョン交渉や形式不一致を原因とする証拠はない。
- cleanEnvironmentはUSERPROFILE、APPDATA等を渡すがCODEX_HOMEは渡さない。親にもCODEX_HOME/HOMEはなかった。USERPROFILEのディレクトリ存在は確認したが、値・認証内容は記録していない。
- 通常envが制限外では成功したため、HOME/HOMEDRIVE等の不足だけが原因とは結論できない。追加だけでは失敗したことも確認済み。
- src/rpc.mjsはstdoutのendをRPC_DISCONNECTEDへ変換する。今回の診断ではCX Runtimeの認証ゲートやE2E wrapperなしでも再現した。したがってゲートによる自発切断が一次原因ではない。
- src/codex.mjsはstderrからUnknown feature flagだけを収集し、child exit codeを診断に公開しない。今回のホーム解決エラーがE2Eログに残らなかった理由はこの診断範囲の狭さ。

## フェーズ0・過去成功との差分

probes/01-stdio/probe.mjsは隔離CODEX_HOMEとHOMEを明示していた。artifacts/connection-result.jsonのフェーズ1成功も隔離ホームだった。一方、失敗したE2Eは通常ホームの自動解決に依存する。この差が、隔離接続テストでは問題が見えなかった理由と整合する。

公式v0.169.0のfind_codex_homeはCODEX_HOMEがあればそのディレクトリを使い、なければdirs::home_dir()を呼ぶ。後者がNoneなら今回と同じエラーを生成する。[公式ソース](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/utils/home-dir/src/lib.rs#L48)

既存E2Eの「lastMethod=initialize」はCXが送ろうとした最後のメソッドであり、app-serverが正常起動して処理した証拠ではない。以前のモデル転送0回という記録は維持される。

## 最小の対応案（今回は未実装）

1. **まず実行環境を適切にする**：今後のE2Eは作者の通常PowerShell、または適切に承認された通常ユーザーの制限外実行で行う。今回の診断成功を実モデル検証成功と扱わない。製品の安全ゲートやsandbox設定を緩める必要はない。
2. **起動診断を改善する**：src/codex.mjsに終了コード・signal・ホーム解決失敗の固定カテゴリを追加し、UIで起動失敗と認証不明を区別する。生stderr、環境変数値、資格情報は保存しない。
3. **必要なら明示ホームを設計する**：設定された正当なCodexホームを検証して子へ渡す方式は候補。ただし今回成功したのは新しい隔離ホームであり、本人の既存ホームを明示したケースは未実測。単にUSERPROFILE/.codexを固定するとカスタム配置を取り違えるため、無断で採用しない。今回の修復に必須とも断定しない。
4. **非モデル回帰テスト**：固定カテゴリのサニタイズ、プロセス終了原因の保持、制限下のホーム解決失敗を検査する。現在の接続テストはRuntimeが未ログインを拒否するよう変わっているため、initialize成功と認証ゲートの期待停止を分けた更新も必要。

## 未確認・停止範囲

通常環境でのChatGPT認証状態、Thread作成、Turn/回答/完了、UIのモデル反映は今回確認しない。Windowsホーム解決の内部失敗箇所と、明示した本人ホームでの動作も未確認。追加のモデル呼出し、認証操作、既存Threadアクセス、製品修正、公開には進まず終了した。
