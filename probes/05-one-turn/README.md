# 技術検証05：認証確認と実行権限の停止点

## 現在の停止点：指定依頼1回の実送信承認済み・作者入力待ち（2026-11-15）

作者からChatGPT利用枠による指定文最大1回の実送信許可を受領した。以下の過去の「承認未取得」は今回の許可により更新された。再送の許可ではない。

今回の確認ではstdin/stdoutとも非TTY、live-attempt.jsonとturn-consumed.jsonはともに未作成。準備済み入口は対話端末と手入力を必要とするため、app-server/TUIを起動せず作者操作へ引き継いだ。要求受信・転送・受理・Turn開始／完了は今回まだ実測していない。

通常権限のPowerShellで次を実行する。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
node .\probes\05-one-turn\live-probe.mjs --authorized-one-turn
```

TUI起動前に表示される `Result:` のパスを使い、別のPowerShellでそのlive-result.jsonを読み、ready=trueを確認する。確認前にはTUIへ入力しない。readyにならない、ログイン変更・権限要求が出る、エラーになる場合は入力せず終了する。

ready=trueの場合だけTUIの通常入力欄へ次の一行を貼り付け、Enterを1回だけ押す。

```text
これはOnecarat Agent Office CXの接続検証です。日本語で『CX接続テスト成功』とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。
```

その後は追加入力しない。成功時は「CX接続テスト成功」の表示を確認する。スクリプトはTurn完了後のread/resumeとTUI終了後の再確認を行い、所有プロセスだけを終了する。失敗・タイムアウトでも再起動・再入力・マーカー削除をしない。予期しない要求が出た場合は承認せずCtrl+Cで終了処理を要求する。

同じlive-result.jsonでallChildrenClosed、portClosed、proxyClosedを確認する。実結果の判定にはgateTraceの受信・転送試行・server_accepted・model_turn_started/completed、notificationsの観測A/B、rpcのread/resume結果を使う。TUI画面は保存しないため、指定応答の表示は作者の確認も必要。既存PID 23772/11576には触れない。

## 前回の停止点：実行環境の整理完了・モデル未実行（2026-11-15）

作者の追加方針により、既存PID 23772/11576の所属調査は終了し、停止・変更しない。正規の認証更新、新規検証Threadの保存、CLI起動に必要な補助ファイル操作は許容済み。以下の古い記録にある「前回プロセス終了確認」「補助ファイル操作の許可待ち」は、実行開始条件から外す。**実モデル送信の承認は依然として未取得。今回の作業では実行しない。**

今後の実送信入口は `live-probe.mjs --authorized-one-turn`。旧probe.mjsの手順は使わない。新しい実行ごとにmkdtempで専用runを作成し、サーバーのTEMP/TMPもrun/tmpに設定する。TUIホームと一時領域もrun内。通常認証と新Thread履歴は既存CODEX_HOMEを正規利用する。

live-result.jsonへ親NodeのPID・親PID、各子プロセスのPID・所有者PID・起動時刻・runディレクトリ・終了状態を保存する。同期実行する権限／バージョン確認子プロセスのPIDは、戻り値から記録する。終了対象はspawnが返した所有ハンドルのみであり、記録PIDからプロセスを再取得して終了する処理はない。サーバーとプロキシは127.0.0.1の空きポートを使用し、記録する。競合・起動失敗は停止し、他プロセスを終了してポートを空けない。

Thread一覧は上流へ問い合わせず、read/resumeは今回のThread IDから最小要求を再構成してpath等の上書きを除く。Thread開始応答待ちの間も2個目の作成を拒否する。観測A/Bにも同一Thread制限を適用する。指定文・ChatGPT認証確認・APIキー非継承・通常権限・永続マーカーの一回制限は維持する。

今回の結果：check-live 24項目、既存19＋4項目、合計47項目成功。構文検査成功。所有関係記録、別Threadへのパラメーター差替え拒否、一覧のローカル応答、Thread二重作成拒否を追加した。Codex起動・実モデル送信・ネットワーク接続は0。実モデル・実機終了の成功を意味しない。

コードとモックの範囲では次回の実送信準備が整った。作者の明示承認後、通常PowerShellで上記入口を使用し、TUI起動前に表示される今回のlive-result.jsonを別端末で確認する。ready=trueになってから指定文を1回だけ入力する。失敗時再送・マーカー削除は禁止。終了時はallChildrenClosed、portClosed、proxyClosedを確認する。実機の接続・モデル応答・resume成否は次回の検証対象として残る。

## 前回の停止点：実送信準備・未実行（2026-11-15）

**今回はモデル送信は禁止。下記の実行入口は次回の明示承認後にのみ使用する。** 旧 `probe.mjs --one-turn` は引き続き無効。転送不能の `observe-tui.mjs` もそのまま保持する。

保存された `runs/observe-2026-11-15T06-09-44-928Z/input-shape-result.json` で、06:10:11.359 UTCの要求ID 6について、同一Thread・入力1件text・本文93文字の完全一致・gate_allowedを確認した。後続ID 7〜9などの要求は記録に従って別扱いとし、成功した一回と混同しない。同ファイルにはfinished/portClosedがなく、children.closed=falseの途中記録なので、終了済みとは断定できない。

### 構成と一回制限

- `live-gate.mjs`：最初のturn/start受信時に `live-attempt.json` をwxで排他的に作り、fsync完了後にだけ転送を許す。不一致でも試行を消費する。プロセス再起動・同時取得・通信失敗・サーバー拒否・成功でマーカーを解除しない。旧turn-consumed.jsonがある場合も拒否する。削除して再送しない。
- 元の完全一致検査を維持し、Thread作成時のTUI追加設定を除去する。Turn送信時もThread IDと検査済み本文1件から最小JSONを再構成し、approvalPolicy=never、sandboxPolicy=readOnlyを固定する。TUIの追加モデル設定・追加指示・cwd等をそのまま転送しない。別Threadの参照・resumeや2個目のThread作成を拒否する。
- `live-probe.mjs`：通常権限、CLI 0.169.0、認証必須WebSocket（無認証・誤トークンは401）、ChatGPT認証、OpenAI provider、観測クライアント初期化、同一Thread参照、TUI接続を確認してreadyにする。準備前入力は拒否し試行を消費する。
- 受信、ゲート許可、転送試行、ローカル書込完了、サーバー受理／拒否、Turn開始／完了を区別する。書込完了はサーバー受理の証拠ではない。切断・タイムアウト時は配送不明として再送しない。ログには本文・秘密情報・自由文エラーを保存しない。
- Turn完了後にA/Bから同一Threadをread/resumeし、TUI終了後にも繰り返す。実際のresume成否は未実測。拒否には要求ID付きエラーを返し、ゲート自体では接続を切断しない。異常時は親の終了処理へ進む。
- `owned-cleanup.mjs`：保持している子プロセスハンドルだけを逆順に停止し、終了を待つ。未終了なら同じハンドルに再度停止を試し、allChildrenClosed=falseと失敗終了コードを残す。既存セッションやプロセス名による一括停止はしない。

### モデルなしの確認

```powershell
node .\probes\05-one-turn\check-live.mjs
```

新規20項目成功。指定文一致、不一致、各事前条件、永続予約、別Nodeプロセスからの再送拒否、記録I/O失敗、通信失敗、サーバー拒否、別Thread拒否、read/resumeの許可、診断の秘匿、所有プロセスの終了処理をモック確認。`live-check-result.json`に保存した。既存19＋4項目も成功。Codex起動・実モデル送信・ネットワーク接続はいずれも0。実際のモデル、実プロセス終了、最小JSONのサーバー受理、Thread再参加の成功を証明するテストではない。

### 次回の実行手順（今回実行しない）

1. 作者から新たに「指定文1回のみ」の実送信承認を得る。前回の観測プロセス終了を確認する。既存ログインの正規利用を再確認する。CODEX_HOMEは既存ホームを指すため、認証更新や新Thread rolloutの書込み先の確認が残る。history.persistence=noneやsqlite/logの隔離だけで既存ホームへの書込み全般を防げるとは扱わない。既存認証・履歴に対する書込み禁止と両立できない場合は起動せず、作者の判断を求める。
2. 条件解決・承認後、非管理者の対話型PowerShellで `node .\probes\05-one-turn\live-probe.mjs --authorized-one-turn` を実行する。この引数自体は承認の代用ではない。マーカーがあれば停止し、削除しない。
3. 別のPowerShellで、今回作成された `runs/<時刻>/live-result.json` の `ready: true` を確認する（親のREADY出力はTUIに混ぜない）。確認前に入力しない。ログインや設定変更を求められたら終了する。
4. 以前の指定文だけを1回入力し、その後は入力しない。Turn完了後のread/resumeと終了は自動。失敗時も再送しない。Ctrl+Cは親の終了処理を要求する。
5. `live-result.json`の転送試行、server_accepted、model_turn_started/completed、各read/resume、allChildrenClosed、portClosedを確認する。いずれも推定で成功扱いしない。未終了があっても既存Codexを一括停止しない。

今回は準備・モックで停止。実行入口、実認証の更新動作、Thread永続化、最小JSONのCLI受理は実機未確認。

## 前回の停止点：実TUI入力形式の確認手順（2026-11-15）

`observe-tui.mjs` を追加した。**実TUIでの操作・結果確認は作者操作待ち。下記は実測成功の報告ではない。** 既存の `probe.mjs --one-turn` は引き続き無効。

通常権限のWindows PowerShellで実行する。管理者端末・非TTY・CLI 0.169.0以外は拒否する。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
node .\probes\05-one-turn\observe-tui.mjs
```

1. スクリプトは `runs/observe-<時刻>` に専用server-homeとtui-homeを作る。既存ログインは使用しない。ローカルの無効モデル接続先、履歴保存無効、ログ無効、認証付き127.0.0.1のWebSocketを使う。認証トークンは生成し、TUIには環境変数で渡す。
2. TUI起動前に保存先を表示する。TUIの通常入力欄が表示されたら、次の一行だけを貼り付け、Enterを1回押す。ログイン・信頼設定変更・その他の承認が必要な画面なら入力せず終了する。

```text
これはOnecarat Agent Office CXの接続検証です。日本語で『CX接続テスト成功』とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。
```

3. 正常なゲート一致時も `Probe dry run: validated but not forwarded` というローカルエラーになる。一致しなければ `Probe gate rejected request; no model request forwarded`。TUIの表示形式そのものは未確認。モデル応答は出ない。再入力しない。
4. エラー確認後、Ctrl+CでTUIを終了する（終了しない場合はもう一度）。親は所有する検証プロセスだけを終了する。最大5分でも終了処理へ進む。最後の `allChildrenClosed: true`、`portClosed: true` を確認する。これらがfalseなら既存Codexを一括停止せず、その結果を報告する。
5. 表示された `runs/observe-<時刻>/input-shape-result.json` が結果。過去の `result.json` は上書きしない。生のTUI出力・本文・認証情報は保存しない。

結果の読み方：`requestObserved` がtrueなら実要求を取得した。`request_shape` に既知キーの構造・型（未知キーは件数のみ）とThread IDを保存する。`gate_allowed` または `gate_rejected` の `checks` で、準備状態・Thread一致・入力件数と型・本文完全一致・消費済み状態を確認する。不一致は `reasons` に列挙する。正常一致でも `DRY_RUN_FORWARDING_DISABLED` により遮断する。`turnForwardingAttempts` は0、`turnStartedObserved` はfalseが期待値。合成データではなく、この実結果の確認後に初めて一致・不一致を確定できる。

実行入口にライブモードはなく、TUIからapp-serverへのデータ経路は共有の遮断ゲートだけ。本文はゲートのメモリ上で完全一致比較し、上流へ送らない。拒否時は同じ要求IDへのエラー応答を返す。プロンプトやキーをログへ保存する汎用JSONダンプは行わない。

確認済み：既存モック19項目＋追加4項目成功。追加検査は構造診断の本文非保存、モデル／操作メソッド遮断、応答IDと接続維持、専用入口の経路の静的確認。構文検査も成功。結果は `observer-check-result.json` と `dry-run-check-result.json`。実TUIの挙動・一回目の実要求形式・実接続の維持は未確認。今回のテストではCodex起動・モデル転送・ネットワーク接続はいずれも0。

## 前回の停止点：ゲート修正・モデルなし（2026-11-15）

**以下の過去の `--one-turn` 手順は失効。再実行しない。** 現在は入口でモデルモードを拒否し、共有ゲートも正常入力を含めてすべての `turn/start` を遮断する。既存の失敗結果 `result.json` は保持した。

今回のモック確認コマンド：

```powershell
node .\probes\05-one-turn\check-dry-run.mjs
```

Node標準機能のみ。Codex・ネットワークを起動せず、メモリ内のソケット代替で共有ゲートを検査する。結果は `dry-run-check-result.json`、合成マーカーは `guard-checks` 配下。19項目成功、モデル要求転送0件。結果内のTurnイベントは合成入力であり、実モデルのイベントではない。

準備状態、Thread照合、入力配列・件数・型、文字列の完全一致、消費済み状態を別々に診断する。接続番号・要求ID・時刻付きで要求受信、ゲート許可／拒否、転送試行／遮断、上流応答、Turn開始／完了を分離する。本文・認証ヘッダーは診断記録に含めない。拒否は要求ID付きのローカルエラー（-32005）で返し、以後のTurn要求は接続をまたいでロックする。参照要求は引き続き通過できる。

親のREADY表示を削除し、TUI稼働中の案内出力をなくした。`tuiTurnStartObserved` は実際の `turn/started` 通知、要求受信は `tuiTurnRequestReceived` に分離した。現行入口からTUIモードは実行できない。

実TUIの要求形式は今回未確認。通常の実行経路はstdin/stdoutとも非TTYで、既存の対話経路は作者の操作を必要とする。隔離された転送遮断専用の実TUI観測起動経路は未整備。完全一致条件は緩めていない。次回は通常権限・隔離環境で転送不能の形式確認を行い、その後のモデル実行には失敗後の新たな明示承認と別途レビューした一回限りの実行経路が必要。消費済み印の削除や今回のコードの単純なフラグ変更で再送しない。

## 続報（2026-11-15、以下は過去の記録）

### 最新の到達点：非管理者で接続確認済み、手動1回送信の待ち

作者が通常PowerShellから実行した05:42:36〜05:42:37 UTCのresult.jsonを確認した。管理者拒否ガードを通過し、account.type=chatgpt、観測A/BのHTTP 101・initialize成功、connectionPreflightComplete=true、modelTurnRequestsSent=0、portClosed=true。時刻別の原本は`runs/2026-11-15T05-42-36-332Z/result.json`。

以下の過去の「モデルモード拒否」状態を更新し、`--one-turn`を明示した場合のみ手動送信を受け付ける。管理者拒否、既存ChatGPT認証の確認、TUI作成Threadと観測IDの照合、OpenAI providerの確認は維持する。現時点で依頼は0回で、モデル実行結果は未取得。

`one-turn-guard.mjs`で、指定文・Thread ID・入力1件・送信準備完了・未消費を検査し、転送前に消費済み印を排他的に作成する。`check-guard.mjs`のモデルなし・通信なしの5項目検査は成功（未準備、別Thread、別文面を拒否し、正しい1回を受理して次を拒否）。これはゲートの検査であり、実モデル／TUI送信の成功確認ではない。

通常権限の同じPowerShellで実行：

```powershell
node .\probes\05-one-turn\probe.mjs --one-turn
```

`PROBE05_READY_FOR_EXACTLY_ONE_AUTHORIZED_PROMPT`とTUI入力欄が出たら、次を一度だけ貼り付け、Enterを一度押す。

```text
これはOnecarat Agent Office CXの接続検証です。日本語で『CX接続テスト成功』とだけ回答してください。ツールの使用、ファイル操作、外部アクセスは行わないでください。
```

他の入力・再送はしない。ログインや承認を求める画面、エラー、READYが出ない場合は入力せず報告する。接続後の待機上限は約5分。Turn完了を観測するとコードが追加モデル依頼なしで参照・resume・TUI終了後の参照／resumeを行い、所有プロセスだけ終了する。失敗・タイムアウトでも手動で再実行せず、turn-consumed.jsonを消さない。モデル名・最終文面の一致は値または真偽だけ記録し、不要な会話本文は保存しない。

TUIのローカル設定から以前の検証用ダミーmodel_providerを除き、認証済みサーバーのモデルを使う構成にした。既存ユーザー設定は編集しない。実際のモデル名はTUIのThread開始応答から記録する。今回の作者への引き継ぎ時点ではTUI起動・モデル送信をこちらから行わず停止する。

作者の通常PowerShellでは`Logged in using ChatGPT`とv0.169.0が表示されたとの報告を受領。以下の初回停止記録に続けて、モデルなしの診断を行った。

- `diagnose.mjs`／`diagnosis.json`：当初の設定エラーは`Could not find home directory`。HOMEDRIVE/HOMEPATH追加やcwd変更では解消せず、子プロセスのCODEX_HOMEに既存の`C:/Users/oneca/.codex`を明示すると公式login statusが終了コード0、ChatGPTログイン済みになった。認証ファイルの読取・コピーをプローブは行わない。
- `features.mjs`／`feature-options.json`：公式CLIで利用可能な機能フラグを読み取り確認。
- `probe.mjs`：04を基にした接続・1回送信ガードの準備コード。現時点では管理者トークン／判定不能を起動前に拒否し、`--connection-only`以外も拒否する。モデル送信部分は未実行・未検証で、利用可能な完成手順として扱わない。
- app-server起動は、試験用の一時引数approval_policy=untrustedが当該CLIで非対応だったため失敗。on-requestに修正後、サンドボックス内ではos error 5で終了。既存config.tomlは変更していない。
- サンドボックス外で接続限定の確認を要求し、実行された際の端末タイトルに「管理者」と表示された。非管理者としての実行を意図したが、禁止条件に適合した実測とは扱えない。以後この経路で続行せず、管理者拒否ガードを追加した。
- その接続限定試行ではWebSocket認証・観測クライアント初期化・account/readが成功。type=chatgpt、planType=prolite（APIの生の列挙値。商品名や契約内容へ解釈しない）。config/readのmodelはgpt-6-astraだが、モデルを実行した結果ではない。
- `result.json`はこの接続限定試行。connectionPreflightComplete=true、modelTurnRequestsSent=0、app-server closed=true、portClosed=true。failure欄のCONNECTION_PREFLIGHT_COMPLETE_NO_MODELは接続限定で終了するための制御用コードで、接続失敗を意味しない。

認証済みホームを使うため、新規検証プロセスは既存CODEX_HOMEを正規経路で参照する。sqlite_home・log_dir・history.persistence等は子プロセスの一時引数のみ。外部ツール・hooks・plugins等も子プロセスのフラグで抑止する。既存セッションに操作を送らず、他のThreadのread/resumeは行わない。ただしこの試行ではTUI・Thread自体を起動していない。

### 次に必要な作者操作

**管理者として起動していない通常のPowerShell**で、接続限定の確認を行う。TUIやモデルは起動しない。新しいガードが管理者または権限判定不能を検出すると起動前に拒否する。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
node .\probes\05-one-turn\probe.mjs --connection-only
```

期待する結果はresult.jsonのconnectionPreflightComplete=true、auth.type=chatgpt、modelTurnRequestsSent=0、portClosed=true。実行結果の確認後に非管理者でのTUI実行方法を決める。設定変更・再ログイン・認証ファイルの共有は不要。指定依頼の最大1回という元の許可は維持するが、今回モデルモードは無効にして停止した。

最大1回の準備制御は、TUI送信内容・Thread IDの一致確認、送信前のturn-consumed.json排他的作成（wx）、その存在時の再実行拒否。今回そのファイルは作成されておらず、依頼は一度も送っていない。モデル実行後の成否は未実証のまま。

---

## 初回事前確認（履歴）

実施日：2026-11-15。指定されたテスト依頼は最大1回の許可だが、今回は0回。モデル実行前の認証ゲートを通過できず停止した。

## 保存物

- `preflight.mjs`：既存公式CLIの`--version`と`login status`を実行し、秘密情報を含まない判定結果だけ保存する。
- `preflight-result.json`：最後の診断結果。CLIのstdout/stderr原文、認証情報、設定内容は保存しない。

認証ファイルを開く・コピーする処理はない。既存ログインの読み取りは公式CLI自身に任せる。親のAPIキー等は引き継がず、Windowsの標準的な環境変数だけを許可リストで渡す。CODEX_HOMEが明示設定されている場合のみそのパスを継承し、今回は未設定だった。USERPROFILEは通常の利用者プロファイルを使用。既存設定にoverrideを加えず、永続的な環境変更も行わない。

## 結果

2026-11-15 05:22:03 UTCに初回確認し、05:22:20 UTCに秘密情報を出さないエラー分類を追加して再確認した（JSTは14:22）。どちらもモデル呼出しなし。

- `--version`：終了コード0、codex-cli 0.169.0。
- `login status`：終了コード1。先頭の診断分類は`Error loading configuration`。
- ChatGPTでログイン済み／APIキーでログイン済み／未ログインのいずれも判定できなかった。
- accessDeniedの既知パターンは検出しなかった。サンドボックス拒否と断定せず、権限昇格も行っていない。
- 設定エラーの具体的な項目・値は取得・記録していない。原因は未特定。

これは「既存ChatGPTログインが存在しない」という結果ではない。CLIが認証状態の報告より前に設定読み込みで失敗したため、正規経路による利用可能性を確認できていない。

ユーザーは正規の方法で既存ログインを利用できない場合の停止と、追加設定変更が必要な場合の作者判断を指定した。このため、設定の無視・置換、別CODEX_HOMEへの認証コピー、再ログイン、APIキーへの切替は行わない。

## 未実施

今回のapp-server・remote TUI起動、新規Thread作成、指定依頼の送信、モデル名・応答・Turn観測、resume、TUI終了後の参照はすべて未実施。検証04のモデルなし接続結果は既存資料として参照したが、05の実測には転用しない。

最大1回の制御として、今回作成したコードにはモデル送信・turn/start・TUI入力処理を一切含めない。指定依頼をまだ送っていないため、その実行結果も存在しない。今後送信コードを作る際は、送信前に永続的な消費済み印を確保し、失敗時・再起動時とも追加送信を禁止する必要がある。

## 作者による確認

普段Codexを使っているPowerShellで、まず以下の読取確認を行う。

```powershell
codex --version
codex login status
```

期待するのはv0.169.0とChatGPTログイン済みの表示。同じ設定読み込みエラーになる場合は、秘密情報を除いたエラーの種類・設定項目名だけを確認する。認証ファイル、トークン、設定ファイル全文の提示は不要。

作者の端末では成功する場合、実行ファイルや環境・起動方法の差を確認する必要がある。設定変更・再ログインは現時点で求めておらず、具体的な変更が必要と分かってから作者に提示する。今回は認証の確認待ちで停止し、再送・別経路への切替は行わない。

プロセスは同期実行したCLIの2種のみで、いずれも終了済み。検証用app-server・TUIは起動していない。既存セッション停止、CC版変更、製品実装、依存追加、外部サービス操作なし。

