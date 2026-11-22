# 認証境界の安全対策

## 初期認証確認の追補（2026-11-15）

作者提示の10:46:08 UTC preflight traceで、initialize成功→account/read待機中のaccount/updated→CXのhalt→所有プロセス停止→exit 0を確認。サーバーの異常終了ではなく、CXの初期認証確認中の停止処理が今回の切断を起こした。通知が初回ロードか実アカウント変更かはtraceからは断定しない。

作者の追加承認によりsrc/runtime.mjsの初期確認を修正。connectingかつゲートblockedの間だけ、authMode=chatgptのaccount/updatedを照会無効化として扱う。通知を本人識別や認証成功の証拠にしない。config/read後に最大4回account/read(refreshToken=false)を行い、通知世代が変わらない2回の照会結果一致を必要とする。異なる結果、null/API/未知の通知、照会失敗、不安定な連続通知は停止。通常のlogin/completedや認証復旧通知も引き続き停止する。ゲートを開くまでThread操作・送信・承認/拒否は不可。

接続確立後はchatgpt同士の更新も含め即停止を維持。旧Threadのread/resume、再送・自動再開禁止も維持。連続照会は安定した本人/ワークスペースIDを証明するものではなく、未通知の切替や返答が同じ場合を識別する保証はない。

公式v0.169.0の[account_processor](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/account_processor.rs)で、ログアウト後にもAccountUpdatedを送ること、refreshTokenの有無を区別することを確認した。したがってaccount/updatedを常に無害と扱う修正はしない。

検証：tests/auth-initialization.test.mjsに初期通知・全操作遮断・不明通知・連続通知上限・アカウント不一致・失敗・遅延応答を追加。全49テスト成功、構文検査成功。既存Edge mock UI検証も成功。実モデル0回。非管理者PowerShellでの実preflight再確認は未実施で、作者の環境で必要。

2026-11-15。作者の「認証境界の安全対策実装」に基づく。B方式を維持し、モデル・実認証操作なしで修正した。

## 実装

- runtimeに接続世代・認証世代と共通ゲートを追加。認証変更、ログイン完了、公式v0.169.0保存スキーマのmodelProvider/authRecoveryStarted・Completed、通信切断で停止する。通知の認証方式がchatgptのままでも停止する。
- 新規Thread、一覧/read、Turn/追加指示、承認/拒否の前にaccount/read(refreshToken=false)で再照会。接続時のアカウント応答との差分・照会失敗で停止。この応答はメモリ内だけで比較し、ログ・永続化・UIへは出さない。
- 非同期応答と通知を世代照合。古いreadの拒否による新接続へのfallbackも禁止。承認は照会開始前にロックし、照会中の取消・認証変更・二重回答を遮断。
- HTTP操作にUIが観測したboundaryを付ける。旧画面から遅れて到着した入力・操作を409で拒否。自動再送はしない。
- 停止時に会話・承認・選択・イベントを公開状態から消去し、Thread IDだけ内部隔離。所有app-serverの終了処理を開始し、終了確認に失敗した場合は再接続を拒否する。サーバー側で既に発生した処理を取消済みとは報告しない。
- 保存済みIDは本人未確認として読み込む。現在のアカウントへ帰属させず、同一人物と思われる場合でもread/resumeしない。明示再接続でChatGPT認証を確認した後、新規セッションだけ作成可能。
- 未送信（認証照会待ち）・送信試行済み応答待ち・実行中Turnを別集計。停止時に結果不明を表示する。下書きはUIの境界変更時に消去し、自動継続しない。過去の応答待ち処理の局所メモリは解決/タイムアウトまで残り得るが、UIへ公開しない。
- モックのThread IDを接続間で一意にし、隔離済みIDを新規IDとして再利用しない。

## 検証

- `node --test tests/*.test.mjs`：39項目成功、失敗0。既存24項目は非同期承認と旧Thread隔離の新仕様に合わせて更新。安全条件を弱めていない。
- 追加15項目：ログアウト/API/ChatGPT同士の変更、通知なしの応答差分、照会失敗、未送信取消、遅延成功/拒否、別アカウント・再起動時のread/resume禁止、承認競合、HTTP旧世代、復旧通知、終了失敗をモックで確認。
- `node scripts/check.mjs`：構文検査成功。
- Edge headless UI：mock A→B切替、下書き・会話・承認消去、送信停止、旧セッション非表示、再接続後の新規作成、古い通知無視。既存の依頼・回答・承認/拒否・セッション切替、デスクトップ/モバイルも確認。
- UI生成物：artifacts/ui-result.json、office-desktop.png、office-mobile.png。既存playwright-coreを読み取り利用し、CCには書き込まない。新規依存なし。

## 保証の限界と再開条件

1. account/readのメール・プラン・ワークスペース表示名等は、安定した本人IDの証明ではない。同じ応答を返す切替を識別できない。このため旧Thread復元は全面的に閉じた。
2. 別CLIプロセスでのログアウト/切替が既存app-serverへ即通知される保証、再照会が常に最新資格情報を反映する保証は未確認。照会と送信は原子的ではなく、直後の変更も完全には防げない。
3. 停止は検出後の新規操作・再送を遮断するもの。既にモデル/ツールへ渡った要求や副作用の取消保証ではない。所有プロセス停止後も結果不明を成功・中断完了へ推定しない。
4. UI消去は次の状態取得時（通常700ms間隔）。既にブラウザへ配送した内容やスクリーンショットを回収する保証ではない。
5. 認証停止後に明示再接続し、新たなChatGPT状態を確認できれば新規Threadだけで再開可能。自動再開、旧Threadの安全なresume、SIWC採用は今回実装しない。

実モデル実行は今回0回。モック成功は実CLI認証変更検知の実証ではない。実モデル検証に進むには対象・回数・影響の別途承認が必要であり、上記限界を許容する隔離した新規Thread検証に限定する。一般利用の認証境界を完全保証できたとは扱わない。

変更対象：src/runtime.mjs、state.mjs、server.mjs、mock.mjs、ui/app.mjs、tests/runtime.test.mjs、tests/auth-boundary.test.mjs、scripts/ui-check.mjsと関連文書。既存probes/検証05マーカー、CC、認証・設定・履歴は変更していない。
