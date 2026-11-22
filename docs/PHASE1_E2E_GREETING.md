# 実モデル最小接続検証（2026-11-15）

## 最終結果：1 Turn E2E成功（作者環境で実測、20:15 JST）

2026-11-15T11:15:13.880Z〜11:15:22.542Z。作者が通常ユーザーPowerShellでprobe.mjsを実行。保存結果[run-1yNyRR/result.json](../probes/phase1-e2e-greeting/run-1yNyRR/result.json)と提示ログを照合し、[office.png](../probes/phase1-e2e-greeting/run-1yNyRR/office.png)も目視確認した。

- CLI 0.169.0、モデルgpt-6-astra、認証方式chatgpt。initializeと認証安全ゲートを通過して新規Threadを1件生成。
- Thread ID：01a1deeb-27e7-7931-ab97-87591f621d52。Turn ID：01a1deeb-2837-77f3-bba5-208ec374a874。
- 指定依頼「こんにちは。短く挨拶してください。」の転送は1回（11:15:15.637Z）、app-server成功応答accepted=true。
- 同じThread/Turnでturn/started（11:15:15.679Z）、userMessage/agentMessageのItem開始・完了、回答delta、turn/completed（11:15:21.608Z、completed）を観測。
- 回答：「こんにちは！よろしくお願いします。」。uiAnswerMatches=true。UIは待機中→作業中→実行完了。保存画像でも回答・メイン人物・実行完了・活動イベントを確認。
- errors=[]。記録されたItem型はuserMessageとagentMessageのみ。予期しないツールItem・承認要求による停止はなし。
- 検証用PID27284は終了コード0、ownedProcessStopped=true。終了は保存済みプロセス終了イベントを根拠とし、既存プロセスへの操作は行っていない。
- consumed.jsonの存在を確認。変更・削除せず保持し、追加送信・再試行は行わない。

今回の完了範囲はB方式での新規Thread・指定挨拶1回・回答/Turn完了・UI反映。既存Threadのread/resume、実承認・拒否、認証切替時の実挙動、サブエージェント、A方式連携は今回未検証。製品全機能の実証や公開準備完了を意味しない。追加モデル検証は別途承認が必要。以下は調査・修正経緯として保持する。

## 標準ChatGPT URLの誤拒否修正（作者承認後）

作者提示の11:13:13 UTC診断（CLI0.169.0、PID13324）でchatgptBaseUrlMatchesOfficialDefault=true、他の拒否条件falseを確認。モデル0回・Thread操作0回・プロセス正常終了。E2E専用ゲートが公式標準URL自体を拒否していたと特定した。設定がどの層に由来するかまでは確認していない。

作者の「進めてください」により限定修正を実施。provider-gate.mjsへゲートを抽出し、https://chatgpt.com/backend-api/との完全一致だけを従来のURL存在拒否から除外した。URL正規化、部分一致、末尾スラッシュの補完は行わない。他プロバイダー、プロバイダー定義、openai_base_urlの拒否は維持。probe.mjsとprovider-diagnosis.mjsは同じ判定関数を使用する。診断のchatgptBaseUrlPresentは引き続き存在を表し、wouldBlockは修正後の判定を表す。

モデルなしの検証：追加21テストと既存49テスト、合計70件成功。HTTP、類似ドメイン、userinfo、クエリ、フラグメント、空白、パス追加、ポート変更、非文字列、および標準URLによる他拒否条件の迂回を拒否することを確認。診断セルフテスト11件成功、変更した実行モジュール3件の構文検査成功。モデル送信、app-server起動、実認証操作は今回行っていない。

製品src、認証ゲート、通常ユーザー検査、送信プロンプト、転送前の永続マーカー(flag wx)、再送防止処理は変更なし。消費済みマーカーは確認時点で存在しない。モデルE2Eと実UIへの応答反映は引き続き未実測。同じ通常ユーザーPowerShellで既存のprobe.mjsを実行するのが次の手順（以前承認された挨拶最大1回）。この修正作業では実送信していない。

## 接続先ゲートの拒否条件特定（作者実測、11:09 UTC）

provider-diagnosisの作者提示結果：CLI0.169.0、PID17692。chatgptBaseUrlPresentのみtrueで他3条件はfalse。initialize/config/read成功、モデル0回・Thread操作0回・終了コード0。今回の拒否理由はchatgpt_base_urlがtruthyであることと特定した。URL値は収集・保存していないため独自設定かどうかは未確定。

公式rust-v0.169.0の[config/mod.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/core/src/config/mod.rs#L3217)では、packaged defaultsが上書きなしでもURLを供給することを明記。[chatgpt_base_url.rs](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/model-provider/src/chatgpt_base_url.rs#L6)の標準値はhttps://chatgpt.com/backend-api/。したがって値の存在だけでは独自接続先の証拠にならない。標準値を誤拒否している可能性はあるが、作者環境との一致はまだ未実測。

診断のみを拡張し、標準値との完全一致を真偽値chatgptBaseUrlMatchesOfficialDefaultで出力する。URLの正規化・部分一致はせず、URL自体は出力しない。既存のwouldBlock計算とE2Eゲートは変更なし。モック11ケース・構文検査成功、追加の実プロセス起動なし。次は同じ通常ユーザーPowerShellで診断を実施する。完全一致でも設定由来は証明しない。ゲート変更を採用する場合は作者確認が必要。

## E2Eの設定ゲート停止（作者実測、11:07 UTC）

作者提示ログおよびrun-AMbmBg/result.json：CLI 0.169.0、PID33768、lastMethod=config/read、runtimeError=CUSTOM_PROVIDER_REQUIRES_REVIEW。モデル転送0回、イベントなし、authGate=blocked。所有プロセスは終了コード0で停止。消費済みマーカーは調査時点で存在しない。Thread作成段階にも到達していない。

コード上の直接原因はprobe.mjsのconfig/read応答に対する専用ゲート。非openaiプロバイダー、選択プロバイダー定義のtruthy値、chatgpt_base_urlのtruthy値、openai_base_urlのtruthy値のいずれかで拒否する。通常preflightにはこの追加ゲートがないため、接続・認証の成功はE2E専用ゲート通過を保証しない。UI_OR_STARTUP_FAILUREはUI待機失敗の包括分類であり、今回の根本的なUI障害を示す証拠ではない。

どの設定条件に該当したか、明示的な上書きか標準値か、実際に独自接続先があるかは未確認。設定値や認証ファイルは読み出していない。安全ゲートの条件は変更していない。

新規provider-diagnosis.mjsは既存spawnCodexの権限・起動制約を使用し、initializeとconfig/readのみ実施。4条件を真偽値で出力し、URL・プロバイダー定義・認証内容は保存しない。モデル/Thread要求経路なし。--self-testで5ケース成功、構文検査成功、実機診断は未実施。同じ通常ユーザーPowerShellでの診断結果を待つ。E2Eの再実行はまだ行わない。診断後も、設定や安全ゲートの変更が必要なら作者の確認を得る。

## 非管理者PowerShellでの事前確認成功（作者実測、10:49 UTC）

作者提示ログ：2026-11-15T10:49:23.286Z、PID2656、CLI0.169.0。initialize/config/read成功。初回account/read中にaccount/updatedを受信したため、その照会を初期安定判定に使わず、追加2回のaccount/readを実施。connection=connected、auth=chatgpt、authGate=readyとなった。最後のruntime-halt/owned-stop-requested/RPC_DISCONNECTEDはpreflightのfinallyで行う終了処理。終了コード0、stopped=true。モデル0回、Thread作成なし。

通常ユーザー環境での接続・認証事前確認は作者の実測で成功。モデルのTurn/回答/完了とOffice UIは未検証のまま。次は同じ非管理者PowerShellで既存の1回限りprobeを実行する。消費済みマーカーは解除せず、失敗時も再送しない。

追補：作者の10:46 UTC traceで、初期account/updatedをCXが変更と扱い停止させていたことを確認。追加承認に基づき初期確認中の通知無効化・連続照会を実装し、49件のモックとUI検証成功。接続確立後の変更停止は維持。詳細は[認証境界実装記録](AUTH_BOUNDARY_IMPLEMENTATION.md)。修正後の実preflight・モデルE2Eはまだ未確認。

追補（10:40 UTC）：アクセス拒否はarg0補助領域作成とSQLite状態DBのオープンで確認。診断用DB配置変更だけでも別のos error 5が残った。詳細は[アクセス拒否調査](ACCESS_DENIED_INVESTIGATION.md)。追加モデル送信0、製品への状態DB移設は未採用。

## 最新：Codexホーム明示の承認後（10:35〜10:36 UTC）

作者の「許可します！」に基づきsrc/codex.mjsを修正。子環境にCODEX_HOMEを明示する。既存のCODEX_HOME指定があれば保持し、なければUSERPROFILE/.codexを使う。絶対パス・既存ディレクトリを確認し、不正なら停止する。資格情報のコピー、新規ホーム作成、APIキー継承はしない。通常ユーザー判定、read-only sandbox、認証ゲートは維持した。

新規preflight.mjsは既存Runtime/spawnCodexを使用し、initialize/account/read/config/readだけを許可。通常ユーザー検査を通過し、CLI 0.169.0を確認したが、initialize中にRPC_DISCONNECTED。診断分類を追加した10:36:18 UTCの試験ではstderrからACCESS_DENIEDを検出、所有プロセスPID19564は終了コード1で終了。account/read未到達、Thread作成0、モデル送信0。既存のE2E送信マーカーなし。所有プロセスは終了済み。

今回の直接の阻害要因はアクセス拒否。拒否された対象パス・処理の特定までは行っていない。ホーム明示だけでは通常権限の制限下での接続を完成できない。権限変更、資格情報の移動、安全ゲート緩和、別環境への切替は行わず停止した。

補足：既存initialize-diagnosis経路では10:36:02 UTCにinitialize成功も記録したが、その経路は以前承認された制限外実行で権限ゲートを通らない。通常ユーザーE2E成功の証拠から除外する。その結果のisolated=trueは旧診断コードがCODEX_HOMEの有無だけで付けた誤分類であり、今回のホーム明示後は隔離を意味しない。診断コードは--isolated指定で判定するよう修正した。

変更検証：環境変数の秘密除外、指定ホーム優先、不正ホームでの停止を含め41テスト成功、構文検査成功。新規診断コード・テスト以外の製品変更はsrc/codex.mjsのみ。起動診断には固定エラーカテゴリと終了コードを追加し、生stderrや認証情報は記録しない。実モデルE2Eは未達成。追加の権限・環境対応には作者の判断が必要。

作者は本人のChatGPTログインで「こんにちは。短く挨拶してください。」を最大1回送信することを許可した。既存Threadのread/resume、追加指示、再送、ツール操作、認証操作は禁止。認証不明時は停止する条件。

## 実測

- 実行時間：2026-11-15 10:10:03〜10:10:20 UTC（19:10 JST）。
- Codex CLI：0.169.0。CXの通常権限・バージョン検査を通過し、所有app-server PID 26556を起動。
- Office UIの接続操作からCX Runtime.connectを実行したが、RPC_DISCONNECTEDで認証ゲートがblockedとなった。
- ChatGPT認証：確認できず。認証情報そのものは取得・表示・保存していない。
- Thread作成：未実施。対象Thread IDなし。
- モデル転送試行：0回。永続消費マーカーなし。再実行しない。
- Turn開始・回答・Turn完了イベント：いずれも未観測。回答内容なし。
- UI：接続後の新規セッション操作が可能になるのを待つ段階でタイムアウト。人物/回答/完了までの遷移は未検証。
- runtimeError=RPC_DISCONNECTED、authGate=blocked。app-serverが終了した根本原因は今回の記録では特定できない。認証失敗・モデル拒否・環境制限のいずれかと断定しない。
- finallyで所有app-server・検証ブラウザ・ローカルHTTPを終了。終了後に所有PID 26556が存在しないことを確認。既存プロセスは操作していない。

## 検証経路

probes/phase1-e2e-greeting/probe.mjsから現行Runtime・spawnCodex・Office UIを利用。新規の専用runtime/workspace、正規の既存Codex認証経路、stdio接続。指定プロンプト完全一致、1 Thread、転送前の排他的消費マーカー、RPC allowlistでread/resume/steerを禁止。テスト用Threadでシェル等を無効化し、ツール禁止のdeveloperInstructionsを加える準備をしたが、Thread作成段階には到達していない。実際に安全設定がモデル側へ適用されたとは報告しない。

結果JSONは同probes配下のrun-* / result.json。製品コードは変更していない。保存した結果は診断メタデータのみ。UIの成功画像は生成していない。

認証不明時の停止条件に従い終了。追加の接続試行・モデル送信・認証操作は実施しない。エンドツーエンド成功は未確認。

## 作者の再開指示後の再試行

### 通常ユーザー環境を指定した再開（10:26 UTC）

作者の「実モデルE2E検証の再開」に従い、実行許可を得て制限外で既存probeを起動した。2026-11-15 10:26:17〜10:26:33 UTC（19:26 JST）。結果は`NORMAL_USER_REQUIRED`。src/codex.mjsの通常ユーザー検査で停止し、app-serverのspawn、バージョン照会、initialize、account/readには到達していない。このエラーは権限検査コマンドの失敗またはAdministrator判定がFalseでない場合に発生するため、保存結果だけで管理者権限だったと断定しない。

- CLIバージョン：今回未取得。対象は0.169.0だが、その検査より前に停止。
- 接続・認証確認：未実施。authGate=blocked。
- Thread作成数：0。モデル送信回数：0。消費マーカーなし。
- Turn開始・回答・完了：未観測。回答なし。
- UI：接続操作後、新規セッション作成が有効になるのを待つ段階でタイムアウト。内部原因はNORMAL_USER_REQUIRED。UI_OR_STARTUP_FAILUREはprobe側の包括的エラー表記。
- app-server：起動されていない。検証用ブラウザとローカルHTTPはfinallyで終了。ownedProcessStopped=true。
- 安全ゲート、sandbox、製品コードは変更していない。通常ユーザー環境で実行できない場合の停止条件に従い、別環境への切替・再試行・追加モデル送信を行わず終了。

残る課題：実行許可された制限外プロセスが通常ユーザー検査を通らなかった理由は未特定。前回のinitialize単独診断はこの権限検査を経由していなかったため、その成功だけでE2Eの通常ユーザー要件充足を証明できなかった。次回は通常ユーザー検査の終了状態と判定値を秘密情報なしで切り分ける必要がある。今回の実行環境を通常ユーザーと確認済みとは扱わない。

2026-11-15 10:12:28〜10:12:44 UTC。消費マーカーがないことと前回転送0回を確認して再試行した。検証コードに最後のRPCメソッドと既存の安全な起動診断カテゴリの記録を追加。CLI 0.169.0、所有PID 26100。最後の要求はinitializeで、RPC_DISCONNECTEDにより終了した。account/readには到達せず、Thread作成・モデル転送とも0回。diagnosticsは空。認証内容が不正だったという証拠はなく、認証照会より前の初期化/起動段階の問題に絞られるが、終了原因は未特定。所有プロセス終了、PID不存在を確認。認証未確認のため停止し、更なる再試行・モデル送信は行っていない。
