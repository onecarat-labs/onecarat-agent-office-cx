# CX観測専用版 設計（2026-11-21）

## 根拠と変更範囲

作者の「Onecarat Agent Office CX — 自律開発指示書」（本会話）により、Windowsで既存Codexの活動を眺めるアプリへの再構築、設計・実装・実機確認を一括して承認された。入力・承認・拒否・実行制御・Research Lab・秘書は製品対象から除外。従来のB方式やフェーズ2モックで停止する条件を今回の範囲で置き換える。CC版、認証・設定・既存Thread、公開・push・課金に関する禁止は維持する。

## 調査結果

- CC版1.0のREADME、SECURITY、architecture、adapter-claude-code/normalize、Figureを読んだ。観測専用、ローカル完結、最前面の小窓、必要最小限のイベント、監視障害の分離を参考にした。コード・素材はコピーせず新規実装。
- 旧CXは所有app-serverを操作する構成。新しいセッションを操作できる事実は、独立した既存CLIを監視できる証拠ではない。旧プローブの結果は再実行結果として扱わない。
- [公式app-serverガイド](https://learn.chatgpt.com/docs/app-server)はthread/readを購読なしの読み取りと説明する。既存CLIを監視するために別app-serverを起動・resumeする方式は採らない。今回app-serverを新規起動しての再検証は行っていない。
- 実機の既存rolloutを読み取り、0.169.0のsession_meta、task_started、task_complete、turn_aborted、response_item、item_completedを確認。現在の開発セッションの追記を観測した。schema inventoryでは直近5ログのキー・イベント型・ツール名だけを調査し、本文は出力・保存していない。
- 実ログにCommandExecution、FileChange、Reasoning、ImageView等のitem_completedがある。ラッパーツールexecの中身を解析してコマンドや編集を推定しない。execは一般の「ツール呼び出し」とする。item_completedは「直近に観測した活動」であり実行中とは断定しない。
- 今回調査したログには承認要求と明示的な親子関係を確認できなかった。検出コードと合成テストは実機取得の証拠ではない。

## 構成

```text
利用者のCodex → 既存sessions/**/*.jsonl
                         ↓ read-only
                  Node.js observer
                         ↓ 識別ID＋固定種別 / stdout pipe
                  Windows Forms / GDI+ 小窓
```

HTTPサーバー、WebView、ブラウザ、外部依存、Codex RPCを使用しない。Node.jsは既存ランタイムを活用し、Windows FormsはOSの.NET Frameworkを使用。新しい依存のダウンロードや別ランタイムの配布を避ける。軽い図形描画でアニメーションを作り、複数ウィンドウではなく1つのセッション切替欄に集約した。

観測処理はNodeの非同期read-onlyファイルハンドルで動く。Windowsフォームは50ms描画タイマー、観測は750ms周期、探索は3秒周期。最小化中は描画を止める。stdoutが詰まった場合はバックプレッシャーを待ち、蓄積しない。ウィンドウは最新スナップショット1件だけを受け取る。ウィンドウ終了時は子stdinを閉じ、必要時は所有する観測プロセスだけ終了する。親が異常終了してもpipe EOFで観測プロセスが終了する。Codexを起動・停止しない。

## データ・状態

| 元記録 | 表示 |
|---|---|
| task_started | 作業イベント |
| response_item.reasoning / item_completed.Reasoning | 思考 |
| CommandExecution / exec_command_begin / 既知シェルツール名 | コマンド実行 |
| FileChange / patch_apply_begin / apply_patch | 編集 |
| ImageView / 既知読み取りツール名 | 資料を確認 |
| WebSearch / web_search | 調べもの |
| assistant message / AgentMessage | 応答（ターン終了ではない） |
| その他のfunction/custom tool call | ツール呼び出し |
| task_complete | ターン終了（成果の成功とは無関係） |
| turn_aborted | ターン中断 |
| exec_approval_request / apply_patch_approval_request | 明示イベントが存在するときのみ承認待ち。実機未観測 |
| session_meta.source.subagent.thread_spawn.parent_thread_id | 明示的な親子関係。実機未観測 |

本アプリはライブステータスAPIではなく、直近の記録を可視化する。15秒無更新なら「現在の状態は不明」。長時間コマンド・思考中でも不明になるが、無根拠な状態継続を避ける。記録が復帰すると動きも再開する。観測プロセスの5秒以上の無応答・終了・ログ読取障害も不明にする。Turn IDの異なる終了イベント、古い時刻、同Turn開始の再適用で終了状態を巻き戻さない。

親子関係が確認できたセッションだけ追加の人物を描く。画面に収まらない人数は+N。任意の独立セッションをサブエージェントとみなさない。成功率、進捗率、失敗、再試行、セッション終了を推測しない。キャラクターのしぐさは状態種別の演出で、実際のキー操作等の再現ではない。

## 読み取り範囲・制約

直近24時間更新または起動後に探索で更新を発見したログを、更新順で最大64件追跡。年月日形式の3階層まで探索し、1回の探索に10,000エントリー上限。初回は最大512KiBのメタデータ先頭と512KiBの末尾、通常は1回512KiBずつ。1行512KiB超過は改行まで捨てる。部分行と分割UTF-8を保持し、完全な行でのみ解析。切詰め・ファイル置換で状態を破棄して取り直す。巨大ログや巨大行の途中から読む場合はイベント欠落があり得る。未知型も無視するため全活動の表示は保証しない。

シンボリックリンクを探索対象から除外し、open前に実パスが観測ルート配下か再確認する。OS上で同一ユーザーが同時にファイルを置換する悪意ある競合まで完全に防ぐ境界ではない。

本文を含む行をメモリでJSONとして読む必要はあるが、project関数から出すのは固定フィールドのみ。会話・コマンド・引数・出力・cwd・名前を保持しない。認証ファイル・設定・SQLiteを開かない。製品はディスクへ観測結果を書かない。テスト専用captureモードの画像・集計は開発先内だけに保存した。

## 残る互換性

rollout形式は安定した公開APIとは扱わない。確認済みはCLI 0.169.0の実ログのみ。CLI以外の同形式ログが読める場合でもChatGPT Work全体やCloud、将来版の完全対応とはしない。日付ディレクトリ・保存設定が異なる場合は観測できない。現在開いているセッションと、最近使ったが閉じたセッションの区別はできない。
