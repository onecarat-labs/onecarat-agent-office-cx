# フェーズ0検証計画と既存結果

## 最新：セキュリティ対応（2026-11-22）

[対応報告](SECURITY_RESPONSE_2026_11_22.md)。自動テスト98件、Windowsのセキュリティ検査7項目、ネイティブフォーム、ビルド、パッケージ内容検証を実施。保護先へのインストールと実ACL検証は未実施。以下の過去の起動成功を保護配置成功へ読み替えない。

## 最新：画面改善の反復確認（2026-11-22）

[画像確認記録](VISUAL_REVIEW_2026_11_22.md)に、3段階の画像確認と修正、全94件の自動テスト、合成状態のフォーム、実ログ描画、製品EXEの合成ログでの起動を区別して記録。通常デスクトップでの表示は利用者による更新後確認が必要。

## 最新：v1.1（2026-11-21）

現行の実行結果は[V1_1_REPORT](V1_1_REPORT.md)。自動テスト93件、合成ログによるネイティブ小窓検査、実ログの親と子2つの識別、実製品ランチャーの同一窓再利用を確認した。承認の合成検証と実ログ取得不能の制約を区別し、実際のセッション終了・新規の子の全ライフサイクル・OS表示言語変更は未検証として記載する。以下は過去の検証記録。

## 観測専用v1.0（2026-11-21）

作者の新しい自律開発指示により、read-only rollout observerとWindows Forms小窓を実装。現在の設計と結果は[OBSERVER_DESIGN](OBSERVER_DESIGN.md)、[OBSERVER_REPORT](OBSERVER_REPORT.md)。保存済みログ構造調査、実ログ追記観測、合成ログによるWindowsフォーム操作、単体テストを分けて記録した。以下は過去の検証経緯であり、新製品への成功実績の自動転用はしない。

更新日：2026-11-15。初期整備では保存資料の読み取り・移管のみを行い、今回のS7反映では文書だけを更新した。下記の実測値は過去のresult.json（S5・S6）からの転記で、再実行結果ではない。

## 検証01：stdio

根拠：[コード](../probes/01-stdio/probe.mjs)、[結果](../probes/01-stdio/result.json)。

| 項目 | 保存結果 |
|---|---|
| 初期化前thread/list | エラー -32600、169 ms |
| initialize／initialized | initialize成功 1 ms、initialized送信済み |
| 初期化後thread/list | 成功 1 ms、配列、0件、nextCursor=null |
| config/read | 成功 4 ms、config/origins/layers、layersCount=2 |
| 未知メソッド | probe/nonexistentでエラー -32600 |
| JSON解析 | parseErrors=0 |
| 通知 | remoteControl/status/changedが記録されている。内容は未保存 |
| 終了 | stdinを閉じて終了コード0、forcedStop=false、processClosed=true |

stderrは306 bytes／1行。本文は保存されず原因は要確認。modelRequests=0はスクリプトの固定値であり通信を計測した結果ではない。コードにTurn開始処理はなく、モデル接続先は127.0.0.1:9へ向けている。外部通信が一切なかったことの独立した監査証拠はない。

## 検証02：認証付きWebSocket

根拠：[コード](../probes/02-websocket/probe.mjs)、[結果](../probes/02-websocket/result.json)。

| 項目 | 保存結果 |
|---|---|
| 実行環境 | Node v24.19.0、bind=127.0.0.1、port=49873（当時の一時ポート） |
| 認証 | capability-token / Bearer。トークン無し・不正トークンはHTTP 401 |
| 正しいトークン | A・B・C-reconnectのUpgradeはHTTP 101 |
| A・Bの初期化前thread/list | ともにエラー -32600 |
| A・Bの初期化と同時要求 | 各initialize成功 1 ms、並行thread/listは各11 ms、0件 |
| 未知メソッド後 | -32600の後、Aのthread/list成功 |
| A切断後 | Bのthread/list成功 |
| 両方切断後 | 2秒待機後もサーバー生存 |
| 再接続 | Cが再初期化・thread/listに成功、各1 ms |
| stdin EOF | 1秒待機後もサーバー生存 |
| 終了 | child.kill、signal=SIGTERM、processClosed=true、portClosed=true |
| 出力 | parseErrors=0、stderrBytes=528、stdoutBytes=0 |

stderr本文・終了時の詳細ログは未保存。再接続成功は、実行中Turn・通知・承認要求が復元される証拠ではない。タイミング値は単回観測で性能保証ではない。

## 証拠の限界

両スクリプトはWindows用Codex実行ファイルの絶対パスと分離したホームを使う。Codexバージョン、実行日時、実行者は結果JSONに記録されておらず要確認（元ファイル更新日は2026-11-15だが実行日時の確証とはしない）。検証01のNodeバージョンも未記録。ブラウザ・UI・ユーザー認証済みアカウントでのモデル実行は確認されていない。

## フェーズ0の残り（未実施・未承認）

S7に明記された製品体験は作者確認済み。以下は実現方法と利用条件の検証であり、要件の採否を再び未決にするものではない。検証できない点があっても体験を勝手に削除しない。検証作業自体の実行承認は別途必要。

| 検証対象 | 成功条件案 |
|---|---|
| Thread / Turn / Item | 依頼・出力・ツール作業・終了のIDと通知順序を保存し、根拠付きで対応付けられる |
| 承認・拒否の配送と競合 | Officeからの要求・承認・拒否・切断を区別でき、重複回答を防ぐ方法を確認できる。秘書が修正後の内容を提示して明示承認を得るまで最終実行せず、未承認の送信・予定変更を行わないことを確認できる |
| app-serverとremote TUI、PowerShellとOfficeの同一Thread操作 | 同じ作業・会話への参加方法、通知の配送先、同時入力・回答の競合条件を説明できる。完全な画面同期は成功条件にしない |
| 再接続・永続化 | 通知欠落の検出、履歴取得・再開、サーバー再起動後の状態を確認できる |
| サブエージェントのイベント取得範囲・Research Lab | 分担・レビュー・成果物とイベントの対応、およびOfficeで可視化できる範囲を示せる。完了・部分失敗を証拠から区別し、出典・担当・状態・不確実性と深掘りの関連を保持する方法を確認できる |
| ブラウザ接続・認証 | 認証経路、Origin、トークン保護と拒否動作を実機で確認できる |
| 定期実行とサブスクリプション利用条件 | 指定時刻に向けた調査、メール・カレンダーの定期確認、開発セッションから独立した実行の方式と利用条件を確認できる。重複防止・停止・承認境界を説明できる |
| Gmail・iCloud・Google Drive等の認証方式と公開条件 | 認証・秘密情報の保護、必要な権限、公開条件を確認できる。ローカル／Driveへのカード・束の保存方法を整理できる。実サービス操作は個別の承認範囲内に限る |
| Codex Cloud・Dotsとの連携方法 | 連携範囲と方式の候補、認証・データ・権限の境界、制約を説明できる。具体的な連携仕様は先に確定しない |
| Windows向け配布・更新方式 | Codex CLIとChatGPTサブスクリプションを前提に、初期設定を簡単にする導線と秘密情報を保護する配布・更新方式を評価できる |

## 当初の次の技術検証案：03（履歴）

以下は当初案。今回の作者指示ではremote TUIとapp-serverのモデルなし接続検証に対象を具体化した。実施結果と許可範囲は末尾の「検証03」を参照。Turnを伴う部分は引き続き未承認。

目的は、接続確認から一段進め、最小のThread／Turn／Itemライフサイクルと通知の実態を確認すること。作者の承認前にコード作成・実行しない。

事前に、対象Codexバージョン、認証方法、モデル呼出しの可否・費用、隔離作業先、許可するツールと保存内容を明示する。必要なAPI仕様をその時点の資料で確認し、未確認のメソッド名や通知形式を先に確定しない。

成功条件案：

1. 一つの明示的な依頼についてThread・Turn・Itemの識別子と開始／出力／終了を対応付けられる。
2. 生の通知から表示可能な事実と取得できない状態を一覧にできる。
3. 接続障害と処理完了を区別し、終了後の取得可能な履歴を確認できる。
4. バージョン・日時・条件・観測結果・未確認点を秘密情報を除いて保存できる。

モデル利用の承認がない場合は実行せず、仕様確認のみで停止する。検証03の成功だけで製品実装へ自動移行しない。

## 検証03：remote TUIとapp-server（2026-11-15）

### 許可範囲と根拠

今回の作者依頼「フェーズ0 / 技術検証03」により、モデル呼出し・外部サービス接続・既存データ変更を伴わない範囲のスクリプト作成・実行が許可された。AGENTS.mdおよびS1・S7の過去の文書整備限定指示に対する、今回限りの具体的な許可として扱う。製品仕様の変更や製品実装は行わない。

根拠：[検証コード](../probes/03-remote-tui/probe.mjs)、[環境分離・ヘルプ取得コード](../probes/03-remote-tui/inspect.mjs)、[結果JSON](../probes/03-remote-tui/result.json)、[付属ヘルプ](../probes/03-remote-tui/help.json)、[保存資料の説明](../probes/03-remote-tui/README.md)。検証01・02の結果と根拠は変更していない。

実測環境：Windows（Nodeのplatform=win32）、Node v24.19.0、`codex-cli 0.169.0`。本試行は2026-11-15 04:55:13〜04:55:15 UTC（13:55:13〜13:55:15 JST）。PowerShellからNodeの検証スクリプトを実行し、その子プロセスとしてCLIを起動した。通常のPowerShell対話コンソールでのTUI操作は実施していない。

### 結論

**認証付きapp-serverと2つの観測クライアントは接続成功。remote TUIは非対話の標準入力で終了したため、同じThreadへの参加可否は判定できていない。** remote TUIの失敗理由は `stdin is not a terminal`（終了コード1）。対話端末の操作が必要な段階へ進めず、停止条件に従って終了した。この結果をWindowsでremote TUIが動かない証拠とはしない。

### 対象別の結果（実測・公式インターフェース・推測の分離）

| 項目 | 実測 | 当該バージョンの公式CLI付属ヘルプ | 推測・限界 |
|---|---|---|---|
| 1. remote TUI起動・認証 | 正しい検証用トークンを子の環境変数に渡して無入力起動。stdin非端末エラーで終了 | `--remote`で接続先、`--remote-auth-token-env`でBearerトークンの環境変数名を指定 | remote TUIの認証成立は未確認。認証拒否を観測したわけではない |
| 2. app-serverとの接続 | app-server起動成功。観測クライアントA・BはHTTP 101、initialize成功。トークン無し・不正はHTTP 401 | `--listen`、`--ws-auth capability-token`、`--ws-token-sha256`が提供される | 観測クライアントの成功をremote TUIの成功に代用しない |
| 3. Thread生成・一覧・再参加 | A・Bのthread/listはTUI起動前後とも成功、各0件。TUI側の生成・選択・再参加は未実施 | resumeはSESSION_IDまたは選択UIを使い、remote関連オプションを持つ | resumeがこの接続構成で成功するか未検証。空の一覧は全Thread状態の不存在を証明しない |
| 4. 複数クライアント | A・Bが同一サーバーに同時接続し、それぞれ一覧を取得 | 今回のヘルプだけでは同一Thread参加の保証は得られない | 接続共有とThread共有を区別。同一Threadの状態取得・操作は未検証 |
| 5. 通知配送 | A・BそれぞれにremoteControl/status/changedを1件観測。parseErrors=0 | 個別通知の購読・配送仕様はヘルプでは説明されていない | これが全通知のブロードキャストを意味するとは推定しない。Thread・Turn・Item通知は未検証 |
| 6. 切断・再接続・終了 | TUI終了後もサーバー生存、A・Bの一覧取得成功。A・B切断後も生存。所有するサーバーをkillし終了・ポート閉鎖を確認 | app-serverのlisten形式は確認済み。寿命・復帰の詳細仕様は未確認 | remote TUIの接続自体を確認できず、切断・再接続は未検証。今回の再接続試行は行っていない |
| 7. 既存CC版との差 | CC版に変更なし。CX検証は直接RPCで認証・初期化・一覧取得 | CC版資料S2・S3はHook→bridge→表示と内蔵端末を説明する | CC版の承認は利用者がClaude Code端末で行う。CXはOfficeからの承認・拒否を要件とするが、その配送は今回未検証 |
| 8. Windows起動・接続エラーと残件 | 非対話TUIの終了コード1、サーバーは所有子プロセスへのkillでsignal=SIGTERM。トークン検査は401/101を観測 | Windows非対応との記述は今回のヘルプにはない | 端末条件による失敗をOS非対応と一般化しない。接続拒否、サーバー異常終了、操作中切断は未検証 |

公式仕様欄はインストール済み公式CLI v0.169.0のヘルプに限定する。オンライン公式ドキュメント・ソースの確認は、今回の外部サービス接続を行わない制約の下で実施していない。推測だけで接続順序や認証の成否を断定しない。

### 終了・保護の記録

- 作成したapp-serverとremote TUIはともに終了済み。app-server終了後は接続ポートの閉鎖を確認。
- CC版・既存Codex設定／履歴／認証情報を変更せず、既存セッションの操作・停止もしていない。既存ChatGPTログインを読取・コピー・利用していない。
- 認証付きWebSocketは127.0.0.1のみ。モデル・ChatGPT用URLとプロキシもループバックの無効エンドポイントへ向け、更新・計測系を無効化。新規依存・管理者権限・製品実装なし。
- プロンプト、turn/start、キー入力を送っていない。記録するのは件数・結果キー・通知名・エラー分類・終了状態で、秘密情報や実際の会話本文は保存しない。
- app-serverのstderrは587 bytes、remote TUIは390 bytes。本文は保存しておらず、既知エラー分類以外の診断は未確認。モデル要求ゼロの記録はプローブが送信した要求に関するもので、全ネットワーク通信の独立監査ではない。

### 未検証事項と次の候補（実行しない）

まず利用者の対話端末で、同じ分離環境・認証付き127.0.0.1接続のremote TUIを無プロンプトで起動し、画面と接続状態を確認する候補がある。現時点ではChatGPTログインが必要との証拠はなく、既存認証情報を利用する理由もない。信頼確認・ログイン・選択等のユーザー操作が必要な場合は内容を示して確認し、勝手に応答しない。

その後にモデルを使わず可能なThread生成・選択・再参加、別クライアントの状態取得、通知配送、TUI再接続を検証する候補がある。実際のプロンプトやturn/startが必要と判明した時点で、送信内容、モデル・費用／利用枠、保存範囲を具体化して別途承認を求める。今回その段階には到達していない。

検証03はこの到達点で終了。対話操作、次の検証、製品実装には進まない。

## 検証03-B：Windows疑似端末でのremote TUI接続

実施日：2026-11-15。作者の「技術検証03-B」指示により、検証03の非対話端末による停止点から、対話型端末の無入力起動を個別に許可された。製品実装、プロンプト・turn/start・モデル実行は引き続き禁止。過去の検証03の結果はそのまま保持する。

根拠：[probe-b.mjs](../probes/03-remote-tui/probe-b.mjs)、[result-b.json](../probes/03-remote-tui/result-b.json)、[方法・再現手順・限界](../probes/03-remote-tui/README-B.md)。実測時刻は2026-11-15 05:07:56〜05:08:06 UTC（14:07:56〜14:08:06 JST）。Windows、Codex CLI 0.169.0、Node v24.19.0。

### 結果

**疑似端末からremote TUIを無入力起動し、認証付きapp-serverへの接続・初期化と、起動時Thread生成を確認した。** 既存ChatGPTログインは使っていない。

| 報告対象 | 実測結果 | 未確認・解釈の限界 |
|---|---|---|
| 端末方式 | 実行ツールのtty:trueでPowerShell→Node→remote TUIへ端末を継承。stdin/stdout/stderrのisTTYはすべてtrue | 端末バックエンドの内部方式は未調査。wt.exe・conhost.exeは所在確認のみ |
| 起動・接続 | OpenAI Codex v0.169.0のloadingから入力待ち画面に進んだ。透過中継で1接続、HTTP 101、initialize成功、initializedを観測 | 実機の通常PowerShell窓で作者が操作した結果ではない。今回は疑似端末による自動起動 |
| 認証 | TUI自身が環境変数のトークンを使い、認証必須サーバーでUpgrade成功。別の負例接続はトークン無し・不正とも401 | ChatGPTアカウント認証の確認ではない。既存認証の読取・コピーなし |
| 観測クライアント | A・Bともinitialize成功。TUI起動前のthread/loaded/listは0件、稼働中は1件。通常のthread/listは0件のまま | TUI接続中を直接返すAPIは未確認。接続成立の証拠は中継のHTTP/RPC記録であり、loaded件数を接続状態の代用にはしない |
| Thread・通知 | TUIがキー入力なしでthread/startを送信し成功。TUI・A・Bでthread/startedを観測 | Thread ID・状態値・選択状態の突合、選択操作、再参加、同一Threadの共同操作は未検証 |
| モデルなしの範囲 | プロンプト・キー入力なし。TUI通信のclientMethodsにturn/startなし | thread/startは観測したがturn/startとは異なる。全ネットワーク通信の独立監査はしていない |
| 終了 | 10秒の観察後に所有TUIをkill。サーバーは生存、A・Bは一覧取得を継続。所有サーバーをkill後にポート閉鎖確認 | TUIからの正常終了操作は未検証。終了コードは両子ともnull、signal=SIGTERM |

付属ヘルプによる公式CLIインターフェースの根拠は検証03のhelp.jsonを継承する。03-Bの接続・Thread結果は実測であり、全バージョン・全クライアントへの動作保証ではない。通常thread/listが0件なのにloaded一覧が1件となる理由は未確認で、永続化条件を推測で確定しない。

### 保存・制約・次に必要な操作

検証コードはprobes/03-remote-tui配下のみ。秘密情報はTUI子の環境変数経由、app-serverへはダイジェストのみ。接続先は中継も含め127.0.0.1限定、認証必須。既存CC版・Codex設定／認証／履歴／セッションに変更なし。追加パッケージ、管理者権限、製品実装なし。

中継はヘッダーや本文を保存せず、メソッド名・応答ID・キー・成否だけを集計。TUIの画面出力は実行ツールで確認したがファイルには保存していない。結果のremote-TUI stdoutBytes/stderrBytes=0は端末継承により未計測であり、無出力という意味ではない。モデル要求数0の固定値に加え、今回のTUIメソッド記録にturn/startがないことを確認した。

画面には検証用TEMP配下でPATH alias用helperを作れない旨の警告が出たが、起動・接続は成功した。警告除去のために既存環境や検証条件を変更していない。

**今回の無入力接続確認について作者の操作は不要。入力待ち画面で停止し、検証用プロセスは終了済み。** 再現用PowerShellコマンドと期待表示はREADME-Bに記載。Thread選択・再参加を続ける場合は、その操作範囲を別途決める必要がある。今回は選択操作・モデル実行・次の検証へ進まない。

## 検証04：同一Threadの参照・再参加（2026-11-15）

### 範囲と根拠

作者の「フェーズ0 / 技術検証04」指示による、モデルなしの参照・再参加までの個別許可。過去の文書整備限定指示とは区別する。製品実装、turn/start、プロンプト、承認要求を発生させる操作は行わない。

根拠：[コード](../probes/04-shared-thread/probe.mjs)、[最新結果](../probes/04-shared-thread/result.json)、[詳細・試行別結果一覧](../probes/04-shared-thread/README.md)、[CLIからのスキーマ生成記録](../probes/04-shared-thread/schema-command.json)。既存の検証01〜03-Bは保持。

Windows疑似端末、Codex CLI 0.169.0、Node v24.19.0。初回は2026-11-15 05:14:04〜05:14:08 UTC、再試行は05:14:30〜05:14:34 UTC（JSTは各+9時間）。初回にresumeエラーが出たため、原因識別用の秘密情報を除いたエラー本文を記録して再試行した。

### 1. 同一Threadの参照（実測）

remote TUIを無入力起動し、TUIのthread/startに由来するthread/startedをA・Bが受信。通知IDはTUI側の通知と一致した。そのIDを指定したthread/read（includeTurns=false）はA・Bで成功し、同一ID、status.type=idleを返した。

thread/loaded/listはTUI起動前0件、起動後はそのIDが1件。通常のthread/listは0件のまま。TUIだけを終了してもloaded一覧とreadは成功し、idleを維持した。Aの切断・新規接続後も同じIDをreadできた。参照可能性は確認できたが、TUI選択UIを操作したわけではない。

### 2. thread/resume（実測と公式CLI定義）

引数は `{threadId: 対象ID, excludeTurns: true}` のみで、設定や権限のoverrideなし。

| 条件 | 初回 | 再試行 |
|---|---|---|
| A単独 | -32600 | -32600、no rollout found for thread id |
| B単独 | -32600 | 同上 |
| A・B並行 | 両方-32600 | 両方同上 |
| TUI終了・A再接続後 | -32600 | 同上 |

**同一Threadの参照は成立したが、今回の無プロンプトThreadへの再参加は成立しなかった。** readが成功することとresumeが成功することは区別する。初回の本文は保存しておらず、詳細な拒否理由は再試行で確認した。

既存CLIのgenerate-json-schemaから生成したThreadResumeParamsには、running threadのIDなら再参加する旨の説明がある。ThreadReadResponseではstatusをruntime statusと定義する。ただし今回のidle・rolloutなしの条件への適用関係は未確認。スキーマの説明と実測の違いを、推測で解消しない。オンライン調査・外部接続は行っていない。

### 3. 通知配送（実測）

TUI・A・Bが同じThread ID、idleのthread/startedを各1件受信した。3者ともremoteControl/status/changed（disabled）も受信。後者はremote TUIのWebSocket接続が無効という意味には扱わない（接続・初期化は実際に成功している）。

resume試行中に追加通知は記録されなかった。A再接続後はremoteControl/status/changedのみで、観測時間内にthread/startedの再送は見られなかった。これを全イベントの購読・配送・再送仕様へ一般化しない。Turn・Item・承認の通知配送は未検証。

### 4. TUI選択状態とThreadの状態

| 概念 | 今回わかったこと |
|---|---|
| TUIの表示・選択 | 自動作成されたThreadの入力待ち画面を表示。選択切替や選択中ID専用APIは未検証 |
| loaded | サーバーがロード中として返すID。TUIを終了しても一覧に残った |
| readable | A・B・再接続AがIDを指定してread成功 |
| resumable | 同じIDでも今回のresumeはrolloutなしで失敗 |
| runtime status | read／通知はidle。ロード済み・画面表示中でも実作業中とは限らない |

turnsArrayLength=0は本文取得を省略した応答の長さであり、全履歴の不存在を証明しない。TUIの選択はクライアントの表示状態、Thread statusはサーバーの実行状態として分離して検討する。これは実測を踏まえた設計上の示唆であり、新しい製品仕様の確定ではない。

### 5. 競合・承認管理の課題（未検証／設計上の示唆）

- 並行resumeは双方が同じ条件で拒否された。競合を正常処理できることや、一方だけが操作権を得ることは確認できていない。
- 接続ごとのリクエストIDと、共通Thread ID・Turn ID・承認要求IDを区別する必要がある。
- 入力・中断・承認／拒否が重なった場合の順序、担当クライアント、二重回答、回答後の他画面更新、切断中の承認要求をどう扱うかは残件。
- 通知受信だけで「そのクライアントが選択中／操作権を持つ」と推定しない。再接続時の状態取得と通知欠落の扱いを別途確認する。

### 6. 次の検証でモデル呼出しが必要か

**再参加成功にモデル呼出しが必須かは、現時点では未確定。** エラーはrolloutが見つからないことを示すが、その生成条件までは今回確認していない。モデルを使わない永続化条件・再参加条件の仕様確認を候補とする。過去の実会話をコピーして試すことはしない。

実際の作業中の競合やTurn／Item通知を観測するには、turn/startを含む別検証が必要になる。その場合の候補は、新規隔離Threadへ明示された短い無害な依頼を1回だけ送り、TUI・A・Bの通知と状態を比較する手順。実行前に認証方法、送信内容、モデル、費用・利用枠、ログ範囲を提示して承認を得る。承認要求の配送確認はさらに別の操作計画を必要とする。今回はどちらも実施しない。

### 7. Agent Office CXへの影響と終了

実在するThread IDに基づいてOffice相当のクライアントが状態を参照できることは確認できた。一方、同じ作業への参加を参照だけで完成扱いにはできず、resume失敗条件・入力権限・承認管理の検証が必要。通常一覧だけでは今回の新規Threadを見つけられなかったため、loaded一覧と開始通知も状態把握の候補になる。合意済み製品体験は維持し、実現方式の検討に反映する。

両試行でプロンプト・キー入力なし、TUI通信にturn/startなし、承認要求なし。接続先は127.0.0.1のみ、認証必須。既存認証・設定・履歴・CC版・既存セッションは変更していない。追加依存・権限拡大・製品実装なし。検証用子プロセスは全て終了し、サーバーポート閉鎖を確認。参照・再参加の検証はここで終了する。

## 検証05：ChatGPTログインによる1 Turn検証（認証事前確認で停止）

### 許可範囲と証拠

2026-11-15の作者指示により、ChatGPT Proの既存ログインを正規経路で利用し、指定された接続テスト依頼をremote TUIから最大1回送ることが許可された。APIキー・認証ファイルのコピー／表示／保存は禁止。正規ログインを利用できない場合や追加設定変更が必要な場合は停止して作者判断を求める条件がある。

指定依頼：『これはOnecarat Agent Office CXの接続検証です。日本語で「CX接続テスト成功」とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。』今回は送信していない。

根拠：[事前確認コード](../probes/05-one-turn/preflight.mjs)、[判定結果](../probes/05-one-turn/preflight-result.json)、[方法と作者向け確認手順](../probes/05-one-turn/README.md)。過去の検証結果は保持する。

### 実測結果

初回確認は2026-11-15 05:22:03 UTC、診断分類を加えた再確認は05:22:20 UTC（JSTは14:22）。モデル依頼の再試行ではなく、`--version`と`login status`の読取確認のみを2回行った。保存JSONは最後の診断結果。

| 報告対象 | 結果 |
|---|---|
| CLIバージョン | 公式CLIの--versionでcodex-cli 0.169.0、終了コード0 |
| 1. ChatGPTログイン利用 | login statusが終了コード1。Error loading configurationという分類を確認。ログイン状態の判定に至らず、利用可能性は未確認 |
| 2. モデル実行 | 未実施。指定依頼の送信0回、turn/start 0回。モデル名・応答は未取得 |
| 3. Thread ID照合 | 未実施。今回の新規検証Threadを作成していない |
| 4. Turnイベント | 未実施。開始・完了・モデル応答のイベントなし |
| 5. thread/resume | 未実施。検証04の失敗がTurn後に解消するかは未実証 |
| 6. TUI終了後の状態 | 今回はTUI・app-serverを起動していない。同期実行したCLIはすべて終了済み |
| 7. Office CXへの影響 | 共有Thread方式の評価は検証04時点のまま。既存認証を正規に利用する起動条件を確認する必要がある |
| 8. 未解決事項 | 設定読み込みエラーの項目・原因、作者の通常端末との差、ChatGPTログイン利用、1 Turn後の共有・再参加 |

プローブは認証ファイルを直接開かず、公式CLIのlogin statusに認証状態の読取を委ねた。標準出力・標準エラー原文は保存せず、既知のログイン分類・エラー分類だけを保存した。親のAPIキーは渡していない。ユーザープロファイルは通常のものを使用し、CODEX_HOMEは今回未設定。設定overrideや認証経路の切替は行っていない。

設定読み込みエラーは「未ログイン」と同義ではない。具体的な設定値・原因は未取得であり、誤った設定や権限不足と断定しない。既知のaccess deniedパターンは検出されず、権限昇格も試していない。

### 停止理由と次に必要な確認

今回の依頼の認証条件に従い、ログインを確認できない状態でapp-server・TUIやモデルを起動することを避けて停止した。検証04の接続機構は参照済みだが、05の接続成功として流用しない。設定の書換え・無視、認証コピー、新規ログイン、APIキーへの切替は行わない。

作者が普段使うPowerShellで `codex --version` と `codex login status` を実行し、v0.169.0とChatGPTログイン済みの表示になるか確認する。設定エラーが再現する場合は、秘密情報を除いたエラー種別・設定項目名を確認する。認証ファイルや設定全文の共有は不要。作者の端末で成功するなら起動環境の差を調べ、追加設定変更が必要と分かった時点で具体案を提示して判断を求める。

今回のコードにはモデル送信機能自体がなく、送信数は0。接続・認証が確認できた後に進める場合も、指定依頼の一回限りの制御と失敗時の再送禁止を維持する。現時点でTurn後のresumeが成功するかは推測できない。

既存セッション・CC版・既存設定の変更、製品実装、依存追加、管理者権限、メール・Drive等の外部連携は行っていない。検証用常駐プロセスなし。検証05はこの停止点を記録して終了し、次の検証へは進まない。

### 検証05続報：作者のログイン確認後の診断（2026-11-15）

上記は初回停止時点の記録。作者から通常PowerShellでChatGPTログイン済み・v0.169.0を確認したとの報告を受け、モデルなしで起動環境差を調べた。

根拠：[診断結果](../probes/05-one-turn/diagnosis.json)、[接続結果](../probes/05-one-turn/result.json)、[コードと権限制約・操作手順](../probes/05-one-turn/README.md)。

1. 当初のエラーの具体的理由は`Could not find home directory`。既存CODEX_HOMEを子プロセスへ明示すると公式login statusでChatGPTログインを確認できた。認証コピー・設定ファイル編集・再ログインは不要だった。
2. app-serverの試験用引数untrustedはこのCLIでは非対応で、送信前に終了した。CLIが対応するon-requestへ修正後、サンドボックス内でos error 5が発生した。一時引数のみの修正で、既存設定を書き換えていない。
3. 接続限定・モデルなしでのサンドボックス外実行を要求したところ、実行結果の端末タイトルに「管理者」が表示された。非管理者での実行を意図したが、**この実行経路は管理者権限禁止条件を満たしたと確認できず、その条件に適合する実測として採用しない**。ここで停止し、以後の起動前に管理者／判定不能を拒否するガードを追加した。
4. その試行（05:31:13〜05:31:14 UTC）では認証必須WebSocketへの観測クライアント接続とaccount/readが成功。type=chatgpt、planType=prolite。planTypeをChatGPT Pro等の商品名に推定変換しない。設定上のモデルはgpt-6-astraだったが未実行。
5. 接続限定のためTUI・新規Thread・Turnは起動せず、依頼送信は依然0回。Thread ID照合、Turnイベント、Turn後resume、TUI終了後の参照はすべて未実証。app-serverは終了しポート閉鎖済み。

結果のfailure=CONNECTION_PREFLIGHT_COMPLETE_NO_MODELは接続限定終了を表す制御用コード。connectionPreflightComplete=trueと併せて読む。今回の接続成功を、通常権限下の成功やモデル実行成功とは扱わない。

次は作者の**非管理者PowerShell**から `node .\probes\05-one-turn\probe.mjs --connection-only` を実行し、通常権限で既存認証を使った接続が成立するか確認する。モデルモードは現時点でコード上も拒否する。既存設定変更・認証情報の共有は求めない。通常権限での結果を確認してから、元の指定依頼最大1回の許可範囲内で続行方法を決める。

準備した送信制御は、固定プロンプト・新規Thread IDの照合、送信前の排他的な消費済み印、消費済み印の存在時の再実行拒否。ただし送信部分は未実行であり動作確認済みとはしない。製品実装・追加モデル依頼には進まず、この停止点で終了する。

### 検証05続報：非管理者での接続成功と手動送信への引き継ぎ

作者の通常PowerShell実行と保存JSON（2026-11-15 05:42:36〜05:42:37 UTC）を照合。管理者拒否ガード通過、CLI 0.169.0、auth.type=chatgpt、A/Bの認証付き接続・初期化成功、connectionPreflightComplete=trueを確認した。送信は0回、TUI未起動。検証app-serverは終了しportClosed=true。これにより、前項で未確認だった**通常権限での既存ログイン利用・接続は確認済み**になった。

作者が同じ通常PowerShellで進めるため、明示的な`--one-turn`モードと手順を[README](../probes/05-one-turn/README.md)に用意した。元の指定依頼最大1回の許可を利用し、追加承認は求めない。作者の操作が必要になった場合は停止するという元の指示に従い、ここではTUI入力を代行していない。

送信ゲートは`one-turn-guard.mjs`に分離し、指定文・同一Thread・準備完了・未消費を検査。送信前の排他的ファイル作成で再送・再起動後の追加送信を拒否する。`guard-check-result.json`では通信・モデルなしの5項目検査が成功。実モデルの成功証拠ではない。TUIの検証用ローカル設定に残っていたダミーproviderを除き、実際のThread開始応答のモデル名とproviderを確認してから送信可能にする。

次の作者操作は通常PowerShellで`node .\probes\05-one-turn\probe.mjs --one-turn`を起動し、READYと入力欄を確認後、元の指定文を1回だけ送ること。エラー・ログイン・承認画面では操作せず停止する。Turn完了後の参照・resume・終了処理はスクリプトが行う。失敗時の再送や消費済み印の削除は禁止。現時点ではThread・Turn・実行後resumeの結果は未取得のまま。

### 検証05続報：失敗後のゲート修正・モデルなしの確認（2026-11-15）

本節が上記の手動送信案内を置き換える。現在モデル実行・再送は許可されていない。`--one-turn` は子プロセス起動前に拒否する。既存の失敗結果は保存したまま、新結果は [dry-run-check-result.json](../probes/05-one-turn/dry-run-check-result.json) に分離した。

**修正内容（コード確認）**：準備完了、Threadの存在・一致、入力配列・件数・型、本文の完全一致、消費済み状態、セッション内ロックを個別診断する。本文や認証情報は保存しない。拒否時は接続を切断せず、要求ID付きのローカルエラー（-32005）を返す。一度拒否または受理した後は別接続からのTurn要求もロックする。今回の共有ゲートには実Turnを転送する分岐がなく、正常要求も遮断する。完全一致条件は維持した。

要求受信、ゲート許可／拒否、転送試行／遮断、サーバー応答、Turn開始／完了を別イベントとして接続番号・要求ID・時刻で追跡する。通知には要求IDがないためnullを記録する。`tuiTurnStartObserved` は開始通知、`tuiTurnRequestReceived` は要求受信を表す。親のREADY表示を削除し、TUI稼働中の案内混在を避けた。

**自動モック確認（実測）**：`node probes/05-one-turn/check-dry-run.mjs` の19項目成功。未準備・Thread不一致・入力形式／件数／型・文字列不一致・消費済み・要求ID不備の診断、正しい要求の転送遮断、拒否後の2回目遮断、接続番号をまたぐロック、同じソケットで参照要求が通過すること、分割フレーム・分割受信・Upgrade・Ping処理、本文非保存を確認した。サーバー応答・Turn通知には合成データを使用。`node --check probes/05-one-turn/probe.mjs` も成功。

ソケットはメモリ内の代替であり、実WebSocketや実TUIの正常動作を証明するものではない。Codexプロセス起動0、ネットワーク接続0、モデル要求転送0。認証・設定・履歴、CC版、CX製品コード、依存は変更していない。常駐プロセスは作成していない。

**未確認・制限**：通常実行経路はstdin/stdoutとも非TTY。実TUIへの入力には作者の対話操作が必要で、以前に権限制約を満たせなかった経路を再利用していない。隔離された転送遮断専用の実TUI観測起動経路は未整備のため、今回の実要求形式は未確認。前回どの条件が拒否されたか、Codex画面の利用不可表示との因果関係は、このモックから断定できない。接続維持と画面分離の実機確認も残る。

**次回の条件**：通常権限・隔離環境の対話端末で、実Turn転送不能の状態で要求形式と拒否理由を確認する。その後のモデル実行は失敗後の新たな明示承認が必要。指定依頼最大1回、失敗時再送禁止、永続的な消費記録、既存認証の正規利用、同一Thread照合を確認し、別途レビューした実行経路を準備する。今回は修正とモック確認で停止し、モデル実行や次の検証へ進めない。

### 検証05：実TUI入力形式の確認準備・作者操作待ち（2026-11-15）

今回の依頼に基づき、[observe-tui.mjs](../probes/05-one-turn/observe-tui.mjs) を追加した。通常権限の対話型PowerShellで、既存認証・設定・履歴から隔離したserver-homeとtui-home、無効なローカルモデル接続先、認証付き127.0.0.1 WebSocketを使用する。既存の一回送信モードは無効のまま。コード変更はprobes/05-one-turn内に限定。

TUIから上流への経路は共有のdry-runゲートだけ。turn/startは条件一致時も必ず遮断し、要求ID付きローカルエラーを返す。本文完全一致は緩めていない。新しいrequest_shapeイベントは既知キーの構造・型（未知キーは件数のみ）、Thread IDを記録する。各条件の一致・不一致と拒否理由はchecks/reasonsに記録し、本文・認証情報・生のTUI画面を保存しない。親の案内はTUI起動前と終了後だけに表示する。

**自動確認（実測）**：既存check-dry-run.mjsの19項目とcheck-observer.mjsの追加4項目が成功。追加項目は構造情報の秘匿、モデル／操作メソッドの遮断、ローカル応答IDと接続維持、専用入口の転送経路の静的確認。observe-tui.mjsの構文検査も成功。結果は[observer-check-result.json](../probes/05-one-turn/observer-check-result.json) とdry-run-check-result.json。これらはメモリ内モック・静的確認であり、実TUIの成功結果ではない。今回の確認でCodex起動0、モデル要求転送0、ネットワーク接続0。

**停止点・未確認**：実TUI入力は作者の対話操作を必要とするため、起動を代行せず停止した。実要求形式・ゲート一致の成否・実接続維持は未確認。完了条件はまだ満たしておらず、実結果を待つ。これはCLI側の制約や過去の失敗原因を確定する結果ではない。

作者は[最新手順](../probes/05-one-turn/README.md)に従い、通常PowerShellで `node .\probes\05-one-turn\observe-tui.mjs` を起動し、通常入力欄に元の指定文を1回だけ入力する。正常一致でも意図的なローカルエラーが期待結果。追加送信せずTUIを終了し、allChildrenClosed/portClosedがtrueであることを確認する。ログイン・信頼設定変更・追加承認が必要なら操作せず終了する。

結果はruns/observe-<時刻>/input-shape-result.jsonに保存される。requestObserved=true、request_shapeの構造、gate_allowed/gate_rejectedのchecks/reasons、turnForwardingAttempts=0、turnStartedObserved=falseを確認してから、各条件の実測判定を追記する。既存の失敗結果は上書きしない。モデル実行・次の検証へは進まない。

### 検証05：実送信経路の準備とモック確認（2026-11-15）

実TUIの保存結果observe-2026-11-15T06-09-44-928Z/input-shape-result.jsonを確認した。要求ID 6、06:10:11.359 UTCについて、同一Thread・入力1件text・本文93文字の完全一致・gate_allowedを実記録で確認。モデルへは転送しない観測経路の結果である。後続の不一致・SESSION_LOCKED要求と区別する。保存ファイルには終了記録がなくchildren.closed=falseのため、前回プロセス終了はこの資料だけでは確認できない。

今回はprobes/05-one-turn内にlive-gate.mjs、live-probe.mjs、owned-cleanup.mjs、check-live.mjsを追加した。共有WebSocket処理は判定済みJSONを再構成して転送するよう変更した。観測専用ゲートは引き続き転送不能。既存コード・結果は保持した。

最初のturn/startに対し固定パスlive-attempt.jsonをwxで排他的作成しfsyncを完了してから転送する。不一致も消費扱い。失敗や再起動でマーカーを解除しない。旧マーカーも尊重する。Thread作成時とTurn送信時にTUIの追加指示・モデル変更等を取り除き、検証済み本文だけを送る。事前条件は非管理者、バージョン、ChatGPT認証、provider、認証付き接続、観測初期化、同一Thread参照、準備状態。別Thread操作は拒否する。

受信・ゲート許可・転送試行・ローカル書込完了・サーバー受理／拒否・Turn開始／完了を別記録とする。配送不明は再送しない。拒否は要求ID付きエラー応答。Turn完了後とTUI終了後にA/Bからread/resumeする経路を準備した。本文・秘密情報・自由文エラーは診断保存しない。

**自動確認（モデルなし）**：新規20項目、既存19項目＋4項目が成功。別Nodeプロセスでの永続マーカー再送拒否、書込I/O失敗、通信失敗、サーバー拒否、別Thread拒否、参照継続、秘密情報非保存、所有ハンドルだけを使う終了処理を含む。live-probe.mjs構文検査成功。結果はprobes/05-one-turn/live-check-result.json。Codex起動0、モデル実送信0、ネットワーク接続0。

**未実証と次回条件**：モックは実サーバーの最小JSON受理・モデル応答・resume成功・実プロセス終了を証明しない。既存CODEX_HOMEを使う実行入口について、認証の自動更新や新Thread rolloutの書込み先と「既存認証・履歴を変更しない」の両立確認が残る。history.persistence=noneやsqlite/log隔離だけで全書込みを防ぐとは断定しない。この条件を解決し、新たな明示承認を得るまで実入口を起動しない。前回プロセスの終了確認も必要。

次回手順はprobes/05-one-turn/README.mdに記載。承認後のみlive-probe.mjs --authorized-one-turnを使い、別端末で今回のlive-result.jsonのready=trueを確認してから指定文を一回入力する。引数は承認の代用ではない。マーカー削除・失敗時再送は禁止。今回の作業は準備とモック確認で終了し、実送信には進んでいない。

### 検証05：実行環境の最終整理（2026-11-15）

作者から既存PID 23772/11576は停止・変更しない方針を受領。所属調査は打ち切り、今回はプロセス一覧取得も停止操作も行わなかった。正規認証更新、新規検証Thread保存、CLI補助ファイル操作は許容済みとなり、従来の許可待ち事項から除外する。モデル送信自体は未承認のまま。

live-probe.mjsに親Node・子プロセスのPID、親／所有者PID、起動・終了情報、専用runとポートの記録を追加した。同期確認用子プロセスは終了後に戻り値のPIDを記録する。mkdtempで実行ディレクトリを一意化し、サーバーTEMP/TMPをrun/tmpへ分離。TUIの専用ホーム／一時領域もrun内。サーバーとプロキシは127.0.0.1の空きポートを使用する。終了は所有するChildProcessハンドルだけに対して行い、記録PIDやプロセス名から他プロセスを終了しない。

live-gate.mjsでread/resumeを今回のThread IDから再構成し、path等の追加指定を除去する。観測A/Bにも同じ制限を追加。既存Threadの一覧問い合わせを上流へ転送せず、Thread開始応答前の二重作成も拒否する。正規ChatGPT認証、APIキー非継承、通常権限、本文完全一致、転送前の永続予約と再送禁止は維持。

モデルなしテストはcheck-live 24項目＋既存19＋4項目、合計47項目成功。live-probe.mjs構文検査成功。結果はprobes/05-one-turn/live-check-result.json等。今回のCodex起動・モデル送信・ネットワーク接続は0。既存Thread・CC版・製品本体・依存は変更していない。

判定：コードとモックの範囲で次回実送信の準備完了。明示承認後の通常PowerShellによる実行が必要。実機接続・最小要求のサーバー受理・モデル応答・resume・実プロセス終了は次回確認事項であり、成功済みとは扱わない。最新手順はprobes/05-one-turn/README.md冒頭。今回はここで停止する。

### 検証05：実モデル送信承認の受領・作者入力待ち（2026-11-15）

作者から、既存ChatGPTログインを正規利用し指定文を最大1回だけ送る許可を受領。通常認証更新、新規検証Thread保存、CLI補助ファイル操作を含む。追加依頼・再送・API課金・既存Thread操作は許可されていない。

今回の実測：Nodeによる端末確認はstdinTTY=false、stdoutTTY=false。live-attempt.jsonとturn-consumed.jsonはどちらも未作成。準備済みlive-probe.mjsは対話端末と作者のTUI入力を必要とするため、作者操作が必要なら手順を提示して停止するという指示に従い、起動せず引き継いだ。検査条件・検証コードは変更していない。既存プロセスの調査・停止もしていない。

今回の要求受信、転送、サーバー受理、Turn開始、Turn完了はすべて未実施。モデル送信0回。新しい検証用app-server/TUIは作成していないので、今回の終了対象はない。Thread参照・resume、イベント配送、TUI表示、実行後のポート閉鎖は未確認であり、成功とは扱わない。

最新手順はprobes/05-one-turn/README.md冒頭。作者は通常PowerShellからlive-probe.mjs --authorized-one-turnを実行し、表示された今回のlive-result.jsonを別端末で確認する。ready=trueを確認してから指定文を1回のみ入力する。以後追加入力せず、自動観測・終了を待つ。エラー時も再送・再起動・マーカー削除は禁止。予期しない権限要求等には応じず終了処理へ進む。

次に実結果を確認する際は、受信／転送／受理／Turn開始／完了を分け、観測A/Bの同一Threadイベント、各段階のread/resume応答、allChildrenClosed・portClosed・proxyClosedを確認する。TUI画面の指定応答表示は作者確認も必要。今回は作者入力待ちで停止し、別の検証や製品実装へ進まない。

### 検証05：観測継続・購読処理の修正（2026-11-15、モデルなし）

実送信後の分析に基づきlive-gate.mjs、live-probe.mjsを修正し、turn-observation.mjsとcheck-observation.mjsを追加した。READMEや過去の実送信結果・永続マーカーは変更していない。古いREADMEの実行手順より本節を優先する。現在live-probe.mjsはOBSERVATION_REPAIR_MOCK_ONLYで子プロセス起動前に停止するため、そのまま実モデル検証には使えない。別途レビュー・新たな許可なしに解除しない。

**修正内容**：SECOND_THREAD_BLOCKEDは追加Threadを拒否しつつ、進行中Turnの観測終了に直結させない。2回目のturn/startも拒否し、元のTurnを引き続き観測する。指定文完全一致、排他的作成・fsyncによる永続マーカー、再起動後の再送防止は維持。入力待ちと転送後の完了待ちは別々の期限とし、input_timeout、turn_timeout、rejected、error、completed、failed、interrupted、operator_stop、tui_closed、server_closed等を区別する。

Thread IDとサーバー受理応答のTurn IDを照合して通知を対応付ける。応答より先に通知が届いた場合は本文を含まないメタデータを保留し、応答後に照合する。異なるThread/Turnの通知は完了に使わない。TUIだけでなくA/Bの一致する完了通知も判定に使う。Item開始／完了はTurn完了とは区別する。detailedEventsに時刻・クライアント・イベント名・Thread/Turn ID・Item型/ID・一致判定のみを保存し、Item本文や回答本文の照合情報は記録しない。eventComparisonでクライアントごとの一致イベントを比較できる。最初の正常完了後は短い受信猶予を置くが、全クライアントへの配送成功を推定しない。

拒否理由・安全な文字列要求ID・要求methodを記録し、観測への影響continue/stopを区別する。turn/startの成功応答を別のpending管理表でunmatchedと記録していた問題も修正した。準備済みの実入口は新しい観測状態を使うが、今回は入口そのものを無効にしている。

**公式仕様の確認**：

- v0.169.0のthread_state.rsのThreadListenerCommand::SendThreadResumeResponseは、既に稼働するThreadの履歴応答と新規更新の購読を原子的に行う処理として定義されている。https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/thread_state.rs
- 公式app-serverガイドはthread/readを購読なしの参照と説明し、thread/startは作成した接続をTurn/Item通知へ自動購読する。https://learn.chatgpt.com/docs/app-server
- 未確認のthread/subscribe等は追加していない。initialize/initialized済みのA/Bに対し、thread/readで今回のThread IDとidleを確認してからthread/resume({threadId, excludeTurns:true})を呼ぶ方式を実装した。resume応答成功と詳細イベントの実受信は別の確認事項として扱う。

**制約・未実測**：resumeが設定や実行中Turnへ与える影響の実機確認はしていない。今回のヘルパーはactive/notLoaded/不明状態でresumeしない。既存検証Threadでの再参加・再送はしていない。空の新Threadでresumeが失敗する可能性も残り、失敗時はコードのみ記録してreadyにせず停止する。元のTurn開始後に自動でresumeを再試行する処理はない。

**モック結果**：node probes/05-one-turn/check-observation.mjs の11項目成功。追加Thread拒否後と2回目のモデル要求拒否後の観測継続、完了までの状態維持、本文非保存、Thread/Turn/クライアント不一致排除、通知と応答の順序逆転、分離した期限、A/B/TUI比較、拒否・エラー・正常/失敗完了の区別、idle時だけのread→resume、resumeエラー、実送信入口の停止を検査した。live-probe.mjs・live-gate.mjs・turn-observation.mjsの構文検査も成功。今回、以前の47項目を再実行したという意味ではない。

実モデル呼び出し0、実turn/start転送0、Codexプロセス起動0、テストのネットワーク接続0。公式資料参照のWebアクセスは行った。認証・履歴・既存Thread・CC版・製品本体は変更していない。テスト用の消費済み印はprobes/05-one-turn/guard-checks内の新規合成マーカーのみ。実購読方式と修正後の実通知配送は未実測。今回の修正とモック確認で停止し、実モデル検証へ進まない。

### 検証06：新規・未実行Threadの参照と再参加（2026-11-15、実機）

作者の今回の許可に基づき、Windows疑似端末から実TUIを無入力で起動した。実行時間は07:15:28〜07:15:32 UTC（16:15 JST）。Codex CLI 0.169.0、Node v24.19.0、通常ユーザー権限（管理者判定false）。コードは[probe.mjs](../probes/06-subscription/probe.mjs)、実測は[result.json](../probes/06-subscription/result.json)、終了後の確認は[postcheck.json](../probes/06-subscription/postcheck.json)。各runの原結果も保持した。

**環境・安全条件**：server-home/tui-homeを新規run配下に隔離し、既存ChatGPT認証は使用・コピーしていない。モデル接続先は無効な127.0.0.1:9、APIキーは継承しない。認証付きWebSocketは127.0.0.1の空きポート。無認証・誤認証は401、TUI/A/BとA再接続は101。TUI経路に既存dry-runゲートを使用しturn/startを常時遮断、観測側は限定メソッドと今回のThread IDだけを許可。TUI入力、プロンプト送信、turn/start要求・転送、モデル呼び出しは0。実TUIを起動した実機確認であり、モック結果ではない。

**対象Thread**：TUIが新規作成した `01a1de0f-a225-7880-8fc6-466135e69297`。初期一覧は空で、作成後のthread/loaded/listには同じIDが1件、thread/listは0件。状態はidleで、Turn未実行。readのturns配列長は0だがincludeTurns:falseのため、この配列だけを履歴全件の証拠にはしない。終了後の隔離server-homeにはsessionsディレクトリがなく、rolloutファイル0件を別途確認した。

| 操作 | 実測結果 |
| --- | --- |
| A/Bのthread/read({threadId, includeTurns:false}) | 作成後・resume失敗後とも成功。同じID、idle |
| A単独、B単独のthread/resume({threadId, excludeTurns:true}) | ともに失敗、コード-32600 |
| A/B同時のthread/resume | 2要求とも同じ失敗 |
| TUI終了後のA/B read | サーバー稼働中は成功、loaded/listも1件 |
| A接続を閉じ、新接続でinitialize後のresume | 同じ失敗。その後のreadは成功 |

resume計5要求のエラーはすべて `no rollout found for thread id [THREAD]`。既存のモデル実行済みThreadへの切替や、rolloutを手作業で生成する回避は行っていない。

**通知範囲（実測）**：TUI/A/Bは同じThread IDのthread/startedを各1回受信。各接続ではremoteControl/status/changed=disabledも受信した。再接続したAでは後者だけを受信した。Turn/Itemは生成していないため受信0であり、これを通知欠落や詳細通知の配送差の証拠にはできない。resumeによる詳細購読の成立は確認できなかった。thread/startedの受信やread成功だけで購読済みと判断しない。

**公式仕様と実測の区別**：v0.169.0の[thread_state.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/thread_state.rs)は、稼働Threadのresume応答と新規更新の購読を原子的に行う処理を定義している。[thread_processor.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/thread_processor.rs)のthread_store_resume_read_errorはThreadNotFoundを今回と同じno rolloutエラーへ変換する。これは実測のエラーと整合するが、別の再参加方法やモデルなし永続化が不可能であることまでは証明しない。今回のID指定resumeでは参照可能なrolloutが不足していた。公式の購読処理が存在することと、このThreadで購読に成功したことを区別する。

**終了・保存**：親Node PID2396が起動したapp-server PID2088とremote TUI PID13788の所有関係・終了を記録した。既存プロセスの所属調査や停止はしていない。allChildrenClosed/proxyClosed/portClosedはすべてtrue。TUI終了後もサーバーはreadに応答し、その後サーバーも終了した。TUIのremoteTui.exited=falseは起動直後の記録であり、最終終了はchildren[].closedで判定する。検証05 live-attempt.jsonの実行前後SHA256は一致。認証情報・プロンプト本文・会話本文・生のTUI出力は保存していない。既存CC版・製品本体・依存・検証05コード/結果/マーカーは変更していない。

TUI起動時には、TEMPと隔離CODEX_HOMEの配置に伴うPATH補助ファイル作成警告が表示された。TUI起動と接続・Thread作成は成功。警告とresume失敗の因果関係は未確認であり、今回の直接のRPCエラーはrollout不在である。

**Office CXへの影響・未確認事項**：ロード済み・参照可能、永続化済み・再参加可能、詳細購読済みを別状態として扱う必要がある。検証05修正の「未実行の新規Threadをread→resumeして準備完了にする」手順は、今回の構成ではresume段階で進めない。製品体験を削除する根拠ではなく、接続手順の未解決条件として残す。resume成功後のA/BへのTurn/Item配送、実行中Turnへのresumeの影響、サーバー再起動後の再参加は未実測。

**次の検証候補（未着手）**：公式ソース・プロトコルで、モデルなしにrolloutを確立する正規手段、または未永続化Threadへの別の正式な購読手段があるかを確認する。今回の結果だけでモデル実行が必須とは断定しない。モデルを使う配送検証は別途明示承認が必要で、過去Threadの利用・再送や消費済みマーカー解除は行わない。検証06はここで終了し、次の検証・製品実装へ進まない。

### 検証07：検証05の保存状態と購読成立条件（2026-11-15、読み取り調査）

今回は保存済み結果・検証コード・公式rust-v0.169.0ソースと、対象rolloutのファイルメタデータのみを確認した。app-server/TUI起動、Threadへのread/resume、モデル実行、turn/start送信は行っていない。認証・設定・履歴本文は読まず、履歴ファイルのハッシュ計算もしていない。文書追記以外の変更はない。

#### 確認済み事実：検証05の保存状態

根拠は [live-result.json](../probes/05-one-turn/runs/2026-11-15T06-55-07-716Z-7pYRRY/live-result.json)。対象Threadは `01a1ddfd-03ef-7a11-8865-7e8f7a696537`、Turnは `01a1ddff-4086-75f2-b669-9ab7472ef8a7`。要求受信06:57:35.359、転送試行.362、server_accepted .384 UTC。TUIでturn/started、item/started、item/completedを記録したがturn/completedはない。A/Bはthread/startedとthread/status/changedを記録し、Turn/Item通知は記録していない。元のnotificationsには時刻・Item型が保存されていないため、Itemをモデル回答と特定できない。

06:57:36.022 UTCのSECOND_THREAD_BLOCKEDに続き、06:57:36.140に終了記録。modelTurnRequestsSent=1、failure=TURN_NOT_COMPLETED_DELIVERY_UNKNOWN_NO_RETRY。これは保存ログの結果であり、今回再実行した結果ではない。現在のlive-probe.mjsは後日修正済みであり、その観測継続処理を当時の動作と混同しない。

検証コードがserverEnv.CODEX_HOMEに指定した通常ホームのsessions/archived_sessionsを、上記Thread IDを含むファイル名に限定して検索した。次の1ファイルを確認：

- パス：`C:/Users/oneca/.codex/sessions/2026/11/15/rollout-2026-11-15T15-55-08-01a1ddfd-03ef-7a11-8865-7e8f7a696537.jsonl`
- サイズ：88,562バイト。
- CreationTimeUtc：2026-11-15T06:57:35.3849249Z。
- LastWriteTimeUtc：2026-11-15T06:57:35.3861854Z。

**判定**：対象IDと一致する非空rolloutファイルの存在は確認済み。「作成された可能性」から「ファイル存在確認済み」へ更新する。作成時刻は受理ログとミリ秒精度で一致する。ただしファイル名・サイズ・時刻だけでは、内部SessionMetaのID、履歴の正常性、回答本文、Turn完了、現在のresume成功を証明できない。内容は今回の許可範囲外として未読。検証05の消費済みlive-attempt.jsonのSHA256は `C2361232A8F8961B0245408893A6CDFD7EA9BE0708F51D29750559CC83CB2BB2` で検証06時と一致し、変更・削除していない。

#### 公式v0.169.0実装から確認した条件

- [thread_processor.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/thread_processor.rs)：resume_running_threadはロード済みでもread_stored_thread_for_resumeを先に呼ぶ（4471〜4502付近）。ID/任意pathから保存状態を取得し、アーカイブ状態などを検査する。excludeTurns=trueでもこの取得は省略しない。ロード済みでは返却履歴を省けるが、cold resumeは復元用履歴を読み込む。稼働Threadへのhistory指定は拒否され、history注入は同一Thread購読の回避策にならない。終了処理中、path不整合、設定/provider検査なども失敗要因になる。完了Turnを1件持つこと自体を、この経路の必須条件とはしていない。
- [thread_lifecycle.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/thread_lifecycle.rs)：handle_pending_thread_resume_requestは終了状態を再確認し、try_add_connection_to_threadで要求元接続を登録する（1138〜1159付近）。作成時にもsubscribe_and_install_listenerを使用する。履歴応答と新規通知をlistener上で順序付ける仕組みであり、単なるスナップショット参照とは異なる。接続が閉じていれば購読登録は成立しない。
- [rollout/src/recorder.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/rollout/src/recorder.rs)：新rolloutには遅延作成状態があり、未永続化時のAddItemsは直ちにファイル作成するとは限らない。Persist等で書き出す。読み出しではSessionMetaを識別するため、ファイル存在・サイズだけでは復元可能性を保証できない。内部persist処理の存在は、公開APIで安全に空Threadを永続化できる証拠ではない。
- [公式app-serverガイド](https://learn.chatgpt.com/docs/app-server)：thread/readは購読なしの参照。thread/startを行う接続の購読と、thread/resumeによる再参加が基本経路。ガイドは現行資料なので、版固有の判断は上記固定タグの実装を優先した。

今回、未確認のthread/subscribeなどを実装・呼び出ししていない。initialize/initialized済みの接続、正しいThread ID、読み出せる保存状態、稼働listenerと接続登録が必要。購読成功後のイベント実受信は別の確認項目であり、過去通知の全面再送を保証するものではない。resumeはランタイムの復元・設定検査・登録等を伴うため、モデルを直接要求しないことと、既存状態に一切影響しないことは同義ではない。

#### 新規ThreadとTurn開始済みThreadの比較

| 状態 | 検証06：新規・未実行 | 検証05：Turn開始済み |
| --- | --- | --- |
| ロード中の参照 | A/B read成功 | 保存ログに送信前read成功 |
| rollout | 隔離sessionsなし、ファイル0 | 今回メタデータで非空ファイルを確認 |
| resume | 個別・同時・再接続すべてno rollout | 今回未実行、成功は未確認 |
| 詳細イベント | 生成していない | TUIのみTurn/Item記録、完了なし |

**推測**：検証05では検証06の直接の失敗条件であった「ファイル不在」は解消している可能性が高い。ただし当時のsqlite_homeはrun内であり、将来のapp-serverがどの保存領域・索引を使うかも整合確認が必要。別環境でresumeできるとは断定しない。ファイル時刻はTurn開始前後の保存を支持するが、保存内容とトリガーの断定は避ける。

#### 代替方式の比較と推奨（提案、採用未決）

| 方式 | モデルなしで確認できる範囲 | 制約 |
| --- | --- | --- |
| Officeの長寿命接続でthread/startし、UIへ通知を配信 | 作成・接続・初期通知。作成接続が最初から観測主体になる | 空Threadへ別TUIがresumeできるとは限らない |
| TUIとapp-server間の仲介でTUI宛通知をOfficeへ複製 | 作成からの通信・ID対応を観測。検証05/06のproxyに先例あり | 独立購読APIではない。要求ID管理、切断、秘密情報保護、承認の単一配送が必要 |
| 永続化後、別接続A/Bでthread/resume | 成功応答・接続登録の確認候補 | 認証/保存環境、履歴正常性、復元の副作用を別途許可・確認。最初の通知を取りこぼし得る |
| thread/read / loaded/listの周期参照 | 概要・ロード状態の観測 | 詳細購読にならず、短時間イベントを取りこぼす |
| rolloutを直接監視 | メタデータから保存の有無を判定 | 正式な詳細イベント購読ではない。承認配送・リアルタイム性・形式互換性を保証しない |

Office主導の新規作業は、Office側接続でThreadを作りイベントを一元管理する方式を第一候補とする。remote TUI主導を維持して最初から観測する場合は、同じTUI接続上の通信を仲介して複製する方式を候補とする。追加クライアントの正式な再参加は保存状態成立後のresumeを検証する。これは提案であり、新しい製品仕様の確定ではない。接続/参照可能・保存済み・購読登録済み・実イベント受信済みを分けて表示する。

#### 次の検証に必要な事項（未着手）

1. 新規隔離環境でOffice作成接続またはTUI仲介方式の初期観測・ID対応・切断を、モデルなしで確認する。詳細Turn/Item配送の証明とは分ける。
2. 検証05のresumeを試すなら、対象Threadへの接続とランタイム復元・付随書込みの許可、当時の保存/索引環境の確認、本文を保存しない結果形式、turn/start遮断を先に定める。今回は許可されていないため実施しない。
3. 保存ファイルの健全性を確認する場合、メタデータ調査では不十分。内容の限定解析が必要なら、その範囲の承認を得る。モデル回答・完了をファイルサイズから推定しない。
4. 新しいTurn/Item配送試験には別途モデル実行の明示承認が必要。既存マーカーを解除せず、再送を自動化しない。

検証07は読み取り調査と本節追記で終了。検証コード変更、テスト実行、Codexプロセス起動、既存Thread接続、次の検証、製品実装は行っていない。

### 検証08：resume実測前の安全確認で停止（2026-11-15）

**結果：実機read/resumeは未実施。失敗応答を受けたのではなく、作者の停止条件に該当したためapp-server起動前に停止した。** 今回は既存ChatGPT認証による対象Threadの復元を許可されたが、「resumeによってTurnが自動実行される可能性が判明した場合は、実行前に停止する」が優先される。

**メタデータ再確認（事実）**：対象は検証05の `01a1ddfd-03ef-7a11-8865-7e8f7a696537` のみ。`C:/Users/oneca/.codex/sessions/2026/11/15/rollout-2026-11-15T15-55-08-01a1ddfd-03ef-7a11-8865-7e8f7a696537.jsonl` のファイル名一致、サイズ88,562バイト、CreationTimeUtc=2026-11-15T06:57:35.3849249Z、LastWriteTimeUtc=2026-11-15T06:57:35.3861854Zを確認。検証07と同じ。本文・内部SessionMetaは読んでいないため、対応の根拠は保存ログのIDとファイル名である。消費済みマーカーのSHA256は検証07と同じ `C2361232A8F8961B0245408893A6CDFD7EA9BE0708F51D29750559CC83CB2BB2`。変更・削除なし。

**公式v0.169.0で確認した停止理由**：

1. [thread_processor.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/thread_processor.rs#L4394) の通常クライアントのcold resume経路は、応答送信後に `emit_thread_idle_lifecycle_if_idle(ThreadIdleCause::Completed)` を呼ぶ（4416〜4418）。
2. [extensions.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/extensions.rs#L77) はqueue_serviceがある場合にqueue拡張を登録する。
3. [ext/queue/src/lib.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/ext/queue/src/lib.rs#L11) は当該サービスをThread lifecycle contributorとして登録する。
4. [ext/queue/src/service.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/ext/queue/src/service.rs#L557) のon_thread_idleはInterrupted原因なら処理しないが、その他ではdispatch_if_idleを呼ぶ。同関数は保存キューの先頭入力を読み、`start_turn_if_idle`で内部Turn開始を試みる（418〜462）。したがって、条件が揃えばクライアントからturn/startを送らなくてもTurnが開始され得る。

これは「対象Threadにキューがある」「必ず自動実行される」という実測・断定ではない。queue_serviceの有効性、対象キューの有無、実際のidle判定は未確認。過去TUIのQueued follow-up inputs表示も、同じThreadのサーバー永続キューの証拠とは扱わない。新規サーバーで対象Threadをcold resumeする際に問題となり得る、具体的な条件付き経路を確認したため停止した。

別途[daemon_continuation.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/daemon_continuation.rs)にも自動継続処理が存在するが、ThreadResumeTarget::DaemonRecoveryの経路であり、通常のクライアントresumeが無条件にdaemon継続を呼ぶとは判断しない。今回の停止根拠は上記の通常resume→idle→queue経路。

| 報告項目 | 今回の結果 |
| --- | --- |
| thread/read | 未実施、応答・エラーなし |
| thread/resume | 未実施、応答・エラーなし |
| 現在のThread/Turn状態 | 未取得。過去のTurn開始・完了未観測という記録を現在状態へ転用しない |
| 詳細購読 | 未評価。購読成功の実測なし |
| ChatGPT認証 | 今回は利用・再確認せず、認証情報未読 |
| 追加モデル実行 / turn/start / 新Thread作成 | すべて0 |
| 検証プロセス | app-server/TUIを起動しておらず終了対象なし。既存プロセス未操作 |

**Office CXへの影響（提案）**：resumeを副作用のない購読専用APIとして扱わない。外からturn/startを遮断するだけでは内部の自動開始を防げない。実測再開の前に、公式の起動設定・実装で自動キュー配送や他の自律起動経路を停止できるかを確認する必要がある。今回はキュー操作、設定変更、ネットワーク遮断での強行、再試行をしていない。

**未解決・次回条件**：モデル開始を防止しつつ正規認証・同じ保存状態で復元できる構成の確認が必要。対象キュー等のメタデータ取得が必要なら、今回のread/resume以外禁止という制約に対する追加許可範囲を定める。キュー本文の取得・削除は提案していない。安全構成が確認されるまで、既存Threadのresume実測は保留。停止条件を解除したり、モデル実行許可へ読み替えたりしない。検証コード・CC版・CX製品・認証・設定・履歴は変更せず、本記録追記だけで終了する。

### 検証09の設計評価と接続アーキテクチャ採用（2026-11-15）

検証09は既存証拠・公式v0.169.0実装による比較評価であり、実行検証ではない。Bを主接続、AをPowerShell連携の補助、Cを保留とする推奨を提示した。その後、作者が「接続アーキテクチャの方針確定」でこの方針を明示採用した。根拠はDECISIONSのS8・S9、決定はD17〜D20。過去の検証結果・停止理由・根拠は変更しない。

**作者決定**：CXランタイムをCodex app-serverの主クライアントとし、Office UIはランタイム経由で操作する。ランタイムはThread、Turn/Itemイベント、エージェント活動、入力・追加指示、承認・拒否、セッション/成果永続化、Research Lab/秘書ジョブを管理する（B）。CX管理のremote TUIは必要に応じ通信を仲介し、入力・承認の競合を管理してPowerShellと同じ作業へ関与する体験を目指す（A）。管理外Codexの無条件な後付け観測は保証しない。独立接続とresumeによる共同観測（C）は副作用・購読成立の問題解消まで主経路に採用しない。

| 採用後の未実証事項 | 現在の証拠の限界 | 今後の確認観点（未着手） |
| --- | --- | --- |
| B方式のTurn完了観測 | 検証05のTUI経路では開始・Itemを記録、完了は未観測 | Bの作成接続で同じThread/Turnの完了まで追跡 |
| A方式との同一Thread共同操作 | TUI接続と別クライアントの参照成功は共同操作成功ではない | 入力元・Thread ID・応答・状態表示の一致 |
| 入力・承認・拒否の競合解消 | モックと接続成功だけでは実承認の成立を保証しない | 同時入力、二重回答、遅延回答、切断時の扱い |
| サブエージェント詳細イベント | 詳細範囲と親子対応は未実証 | 子Thread・活動・完了を事実に基づき対応付ける |
| 復元時の自動キュー配送リスク | 検証08で実装経路を確認し起動前に停止 | 自動開始を防ぐ正式な構成と安全な復元条件 |
| CLI更新時の互換性 | v0.169.0での部分的確認のみ | 要求・通知・承認・復元挙動の変更検出 |

上記は採用した製品体験を削除する理由ではなく、実装方法の検証課題として保持する。通信方式、保存形式、競合解消アルゴリズム、定期実行の方式など、作者が今回確定していない細部は未決のままとする。Office・Research Lab・秘書の製品要件は変更しない。

今回の作業はARCHITECTURE、DECISIONS、VALIDATION_PLANとPRODUCT_SPECの接続方針説明の更新のみ。製品/検証コード、既存CC版、認証・設定・履歴、検証05マーカーは変更していない。モデル実行・Turn送信・プロセス起動・テスト・pushは行わない。追加検証や実装には進まず、文書整備で終了する。

### フェーズ1：最小動作版の実装と確認（2026-11-15）

S10による自律実装の許可に基づく。B方式（CXランタイムが所有stdioでapp-serverへ接続）、Office基本画面、入力/追加指示、承認/拒否の構造、Thread別状態、メタデータ保存、切断・再接続照合を実装。Aは拡張余地のみ、C/resumeは未実装。詳細と主要ファイルは[PHASE1](PHASE1.md)。

実行時依存追加なし。モデル送信は既定で無効。モデルを使う実機確認は行っていない。旧probes・消費済みマーカーを変更せず、新しいscripts/testsで検査した。

- 自動単体・統合テスト24項目、構文検査を実施。ID対応・順序逆転・二重承認・不明状態・秘密本文非保存・復元時自動実行防止・HTTP認証境界を検査。
- Edge headlessのモックUIで接続、新規、入力、承認/拒否、回答・完了、切替、切断・再接続後の参照専用状態を確認。デスクトップ/モバイル画像とui-result.jsonをartifactsに保存。
- 実Codex 0.169.0は新規隔離ホーム、無効なモデル接続先、要求allowlistの下でinitialize/account/read/config/read成功。07:52:40.849 UTC、PID11212。所有子プロセス終了済み。Thread作成・Turn・resume・実承認は0。auth=notChatGPTは隔離環境の期待結果で、既存ChatGPTログインでの製品操作成功を意味しない。
- 実接続の初回失敗は廃止されたuntrusted設定。on-requestへの修正後に成功。本文を含む生stderrは通常保存せず、隔離された起動診断で原因を特定した。

実モデルのTurn完了、正規ChatGPTログインでの一連の操作、実承認、サブエージェント詳細、購読再開は未実測。実機モデル確認は作者が対象・回数・影響を承認した後に限る。今回の完成はフェーズ1の実装・モック・基本画面・接続確認の範囲であり、初回公開版完成ではない。Research Lab・秘書・公開・自動起動登録は行っていない。

### 認証境界の修正確認（2026-11-15）

作者の追加実装承認に基づき、共通ゲート、接続/認証世代、旧Thread隔離、UI内容消去を実装。旧Threadの再接続時readは安全側に廃止した。`node --test tests/*.test.mjs`は39件成功・失敗0。構文検査成功。Edge headlessでmock A→B変更、下書き/会話/承認消去、旧Thread非復元、新規作成、遅延通知無視と従来の入力・承認/拒否・回答・セッション切替を確認。モバイル画像も目視確認。実モデル、実CLI認証操作、app-server実機起動は行わない。詳細・残存リスクは[認証境界実装記録](AUTH_BOUNDARY_IMPLEMENTATION.md)。安定本人識別・外部CLI変更の即時検知は未保証。

## フェーズ1仕上げ（2026-11-15）

UIの通信障害復旧、下書き分離、操作中表示、一時エラー解除、直近Turn結果の表示を改善。製品認証・権限・安全ゲートは変更なし。単体・統合70件、モックUI27項目、構文検査成功。実Codex起動・実Thread作成・追加モデル送信は0。既存E2E結果と消費済みマーカーはSHA256一致で保持を確認。詳細と実機未検証範囲は[PHASE1_POLISH](PHASE1_POLISH.md)を参照。


## フェーズ1最終受け入れレビュー（2026-11-15）

判定は条件付きPASS。旧Turn完了の再適用、切断済みRPCのバッファ保持、多バイト不正tokenの比較例外、承認取消状態の上書きを追加モックで再現・修正。自動77件とモックUI29項目、構文検査に成功。実モデル/実Thread/実承認操作は0。通常起動とE2Eの接続先チェック差、本人識別・実承認等を移行条件として保持。詳細は[PHASE1_ACCEPTANCE_REVIEW](PHASE1_ACCEPTANCE_REVIEW.md)。


## フェーズ2設計（2026-11-15）

作者の設計開始指示に基づき、[詳細設計](PHASE2_DESIGN.md)、[画面設計](PHASE2_SCREENS.md)、[段階別実装・テスト計画](PHASE2_PLAN.md)、[作者判断事項](PHASE2_OPEN_DECISIONS.md)を作成。T01〜T20は将来のモック検証計画であり、今回は未実施。4文書の相対参照先を確認し欠落0。実装・アプリ起動・実モデル・実Thread作成・実承認操作なし。既存E2E成功結果と消費済みマーカーのSHA256一致を確認。フェーズ1は条件付きPASSのまま。本実装へ進まず設計で停止。


## フェーズ2 Office・Research Labモック（2026-11-15）

作者のモック実装開始指示により、共通メモリ基盤と操作可能なOffice/Labを実装。実Codex接続・保存・時刻実行・秘書はなし。自動94件（既存77＋17）、フェーズ2UI22項目、フェーズ1UI29項目、構文検査成功。新しい画面データはブラウザ内メモリのみ。実モデル/実Thread/実認証操作0、既存E2E結果・マーカーhash一致。詳細と未決事項は[PHASE2_MOCK_IMPLEMENTATION](PHASE2_MOCK_IMPLEMENTATION.md)。

