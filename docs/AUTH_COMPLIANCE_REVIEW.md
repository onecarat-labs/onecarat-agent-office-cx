# CXフェーズ1 認証・利用規約適合性調査

調査日：2026-11-15。対象：現行CXソースと既存設計・検証記録。静的調査と公式資料の参照のみ。認証情報、実会話履歴は読んでいない。アプリ起動、OAuth、モデル実行、テストは実施していない。本書は技術・規約の照合結果であり、OpenAIによる個別承認や法律意見ではない。採用判断は作者に残す。

## 1. 結論

**B方式（CXが所有するapp-serverへstdioで接続）は維持できる。独立アプリへのapp-server統合自体に公式の案内がある。ただし、現行CXを「SIWCによるOSS向けChatGPT利用枠連携に適合済み」とは説明できない。**

- 個人利用：Codex管理のChatGPT認証と公式RPCを使う構成には根拠がある。CLIの認証ファイルをCXが抽出する構成ではない。今回確認した資料から、本人のローカル利用に独自OAuthへの移行が必須だとは断定できない。実アカウントでの製品動作、送信直前の認証・接続先保証は未確認。
- OSS公開：各利用者が自分のCodexにログインする「Codexクライアント」として公開する方式と、CX自身が同意を取得する「SIWC連携アプリ」は別。前者が一律禁止、後者がすべてのクライアントに必須という記載は確認できなかった。前者を広く正式サポートされたサブスクリプション連携として宣伝するには適用範囲の追加確認が必要。
- **推奨案**：独立OSSとして利用枠連携を明確にするなら、公開前にSIWCの公式app-server構成を採用候補とする。変更の中心は認証・利用枠UI・provider設定・更新処理であり、OfficeやThread/Turn/Item管理の全面変更は不要。ただし現行v0.169.0への互換性と安全な復元は未実測。

根拠：[Codex app-serverの製品統合案内](https://learn.chatgpt.com/docs/app-server#authentication-modes)、[OSS向けSIWC導入例](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)、[SIWCのapp-server構成](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)。

## 2. 現行実装の事実

| 対象 | 静的に確認した動作・限界 |
|---|---|
| 起動 | `src/codex.mjs`：通常ユーザー確認、CLI 0.169.0に固定。所有子プロセスを`app-server --listen stdio://`で起動し、その子だけ停止。CX UIは127.0.0.1のHTTP。app-serverのネットワーク待受はない |
| 認証 | `cleanEnvironment()`はUSERPROFILE等を渡し、CODEX_HOMEやAPIキー環境変数は引き継がない。通常Codexホームの認証・設定をCodex自身が扱う。CXはauth.jsonを読まず、コピーもログインAPIも実装していない |
| 利用方式確認 | `src/runtime.mjs`のconnectで`account/read {refreshToken:false}`。typeがchatgptかだけ保存。メール・プラン・登録主体はUIへ保持しない。`config/read`でproviderが未指定/openaiか、有効MCPがないか確認 |
| 認証判定の限界 | 判定は接続時のスナップショット。`account/updated`を状態へ反映せず、送信前の再照会もない。provider名だけを検査し、実効base URLやprovider定義、別認証源の全体は検証しない。したがって「全設定でAPI課金や別接続先が絶対にない」とは証明できない。実際に別課金が発生した証拠もない |
| RPC | `initialize`→`initialized`。clientInfoはname=`onecarat_cx`、version=`0.1.0`、titleなし。CX所有Threadに限定したstart/list/read、turn/start/steer、承認応答。任意RPCをブラウザから渡すAPIはない |
| 復元 | `thread/resume`は呼ばない。既知Threadをreadし、再接続後は参照専用。結果不明の送信を自動再試行しない。安全な購読復旧は未対応 |
| 保存 | `src/state.mjs`のdurableはThread ID・選択・イベントメタデータのみ。入力・回答・承認内容は表示用メモリ。Codex側のrollout保存は別であり、`history.persistence=none`を全履歴非保存の保証にはしない |
| ログ・秘密 | RPCエラー本文や生stderrを保存しない。起動端末にはCXローカル操作用URLの秘密値を出力する。これはOpenAIアクセストークンではないが、共有・端末ログ収集には注意が必要。OpenAIトークンの安全性を、利用者の保存先ACLまで今回監査したわけではない |
| UI境界 | `src/server.mjs`：ランダムなローカル認証値、HttpOnly/SameSite Cookie、Host/Origin検査、CSP。`ui/app.mjs`はURL fragmentを除去。SIWC同意・アカウント選択・失効・利用枠管理UIはない |
| 実行制御 | モデルは既定で無効。read-only sandbox、on-request、追加権限等の無条件承認なし。multi_agent等は無効。定期実行、Research Lab、秘書は未実装 |
| 配布 | package.jsonはprivate。今回のファイル検索ではCX自身のLICENSEを確認できなかった。CCのライセンスを自動継承しない。公開物から認証情報等を除外できるかの全量監査は未実施 |

参照ファイル：[codex](../src/codex.mjs)、[runtime](../src/runtime.mjs)、[rpc](../src/rpc.mjs)、[state](../src/state.mjs)、[server](../src/server.mjs)、[UI](../ui/app.mjs)、[Phase1記録](PHASE1.md)。既存記録のモック成功・隔離接続成功を、ChatGPT認証での実Turn成功や規約適合の証明に置き換えない。

## 3. 公式資料と適用範囲

以下は調査時点のオンライン資料。現在の資料をv0.169.0の実装保証とは扱わない。

| ID | 公式資料・該当箇所 | 確認内容 |
|---|---|---|
| S1 | [SIWC Overview / Introduction、A client vs. an agent host](https://developers.openai.com/siwc/token-sharing-open-source) | OSS・ローカルアプリのplan利用。登録clientと実行hostは別。host IDは安定した不透明な値。再起動ごとに再生成しない。UUIDは対応形式、公開鍵由来IDは推奨であって必須ではない |
| S2 | [SIWC Codex app-server / Using Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) | アプリ自身のOAuth access tokenを子環境へ渡し、Responses providerを設定。stdio RPCを継続使用できる。clientInfoにname/title/version。更新トークンで再起動する構成が案内される |
| S3 | [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) | この経路はHTTP/SSE、store=false・stream=true。Responsesのbackgroundやmulti_agentパラメータは非対応。一方Codexのローカルツール・子エージェントは別で利用可能。hosted MCP等は非対応。ローカル履歴・resumeは別概念 |
| S4 | [Cookbook / Introduction、Before you start](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) | 対象となるPlus/ProでAPIキーなしの利用枠連携を説明。identityとplan使用許可は別。研究ツールやデスクトップアプリも例示。ChatGPT会話全体へのアクセス許可ではない |
| S5 | [Codex Authentication / OpenAI authentication、Login caching](https://learn.chatgpt.com/docs/auth) | CodexのChatGPTサブスク認証、APIキー認証を区別。Codexが認証を保存・更新。通常のCLI自動化にはAPIキーを案内し、Enterprise自動化には別機能の案内もある。これをProの常駐ジョブ許可へ転用しない |
| S6 | [Codex App Server / Protocol、Authentication modes](https://learn.chatgpt.com/docs/app-server) | 独自製品との統合を案内。stdio JSONL、managed ChatGPT認証、account/readを公開。experimentalなchatgptAuthTokensとS2のprovider env_key方式は同一ではない |
| S7 | [Registration and sign-in / 1–5](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) | 初回動的登録、PKCE/state/nonce、loopback callback、IDトークン検証、付与scope確認が必要。本人識別は検証済みsubと登録clientに基づき、メールだけでは不十分。登録単位で保護した資格情報を保存 |
| S8 | [Accounts and sessions / Managing accounts、Credential security、Tracking usage](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) | 登録を分離し、更新を直列化。トークンをブラウザストレージ・ログ・ソース管理へ出さない。失効と利用枠設定への導線。アプリ追加は独立した利用枠を新設しない |
| S9 | [UI/UX guidelines / Confirm、Show、Offer options](https://developers.openai.com/siwc/ui-ux-guidelines) | 初回利用枠利用の説明、利用中表示、Manage usage、制限到達時の案内。CXの単なるChatGPT表示とは異なる |
| S10 | [Terms of Use / Registration and access、Using our Services](https://openai.com/policies/row-terms-of-use/) | 資格情報の共有、他人へのアカウント提供、利用制限・保護策回避を禁止。一般的な自動抽出禁止文言だけで、別途公式に案内するapp-server/SIWCを一括禁止とは解釈しない |
| S11 | [Service Terms §15](https://openai.com/policies/service-terms/#15-sign-in-with-chatgpt) → [SIWC Terms §§1–5](https://openai.com/policies/sign-in-with-chatgpt-terms/) | SIWC専用規約が追加適用される。下記参照 |

指定された[terms-of-use](https://openai.com/policies/terms-of-use/)は取得時にEurope版を表示したため、そこからリンクされたEEA・英国・スイス以外向けS10も確認した。利用者の居住地・契約によって適用規約が異なる。SIWC Termsは2026-11-04発効、Service Termsは2026-11-13更新と表示されていた。

### SIWC専用規約で明記される条件

S11では、実アプリ名と正規認証フロー、適切な安全対策、事前のプライバシー通知・必要な同意と取消手段を要求する。永続トークンは利用者管理下のローカル保存。本人が管理するruntimeから本人のために要求し、バックグラウンド実行には明示同意が必要。利用枠・トークンの共有、再販、他人の依頼処理、アカウント分散による上限回避は不可。接続したアプリ用途に限定し、汎用API中継にしない。SIWC利用枠を使うために作者への支払い・有料版移行を必須にしない。侵害等の通知義務、必要な権利・ライセンス確保、OpenAI公認と誤認させない表示も必要。[SIWC Terms §§1–5](https://openai.com/policies/sign-in-with-chatgpt-terms/)

**自動実行は一律禁止ではない。** 上記の明示同意条件と、S3の非対応APIフィールドを区別する。ローカルスケジューラが通常の要求を送ることとResponsesのbackground指定は別。Research Lab・秘書にはこの条件を設計へ反映できるが、現在のCLI認証経路にSIWC専用許可をそのまま読み替えない。頻度・同時人数の普遍的な数値上限、v0.169.0での全組合せ保証は確認できなかった。

## 4. 適合性評価

適合確認＝記載した狭い範囲に公式根拠と実装確認あり。要対応＝指定公式方式の要件と現行実装に差分あり。要追加確認＝根拠・実装・実測不足。対象外＝現フェーズに未適用。SIWC未実装の差分を、現行Codexクライアントの規約違反認定と混同しない。

| 評価項目 | A：本人PC・本人契約 | B：第三者が各自の契約でOSS利用 | 根拠・判断 |
|---|---|---|---|
| B主接続・stdio RPC | 適合確認 | 適合確認 | S2/S6と起動・RPC構造が一致。モデル完了の実測保証は別 |
| Codex管理の認証を正規RPCで確認 | 適合確認 | 適合確認 | S5/S6。認証ファイル抽出なし。これはCX独自SIWC同意の証明ではない |
| 現行方式の利用全体を公式サブスク連携と保証 | 要追加確認 | 要追加確認 | OSS向けS1/S2経路と異なる。CLIラッパーを全て禁止・移行必須とする根拠も未発見 |
| SIWCとしての登録・本人検証・plan同意 | 対象外 | 要対応（SIWCとして公開する場合） | S7。現行は未実装。個人でもSIWC採用時は同じ対応が必要 |
| SIWC provider・clientInfo・token更新 | 対象外 | 要対応（SIWC採用時） | S2。現行provider判定は提案providerを拒否する。titleも未設定 |
| OpenAI秘密情報の非抽出・診断非保存 | 適合確認 | 適合確認 | CXのコード経路の範囲。OS/Codex側の保存ACLと配布物監査は未確認 |
| 本人認証・接続先・課金経路の継続保証 | 要追加確認 | 要追加確認 | 接続時のみ判定。auth変更・実効provider検証不足。誤課金が実測されたわけではない |
| アカウント・利用枠共有をしない構成 | 適合確認 | 要追加確認 | Aは単独ローカル、共有機能なし。Bの配布物や運用で他者の資格情報を混入しない確認が必要 |
| 同意、取消、プライバシー、利用枠UI | 要追加確認 | 要対応（SIWC公開要件） | S8/S9/S11の導線・事前通知がない。CLI利用を継続する場合の説明範囲も整理が必要 |
| resumeを無害と扱わない | 適合確認 | 適合確認 | 現行は呼ばず再送しない。これは復元機能完成の意味ではない |
| 認証更新後の安全な会話継続 | 要追加確認 | 要追加確認 | SIWC更新時の再起動/resume案内と、既存キュー副作用対策を両立する必要 |
| 定期実行・複数エージェント | 対象外 | 対象外 | Phase1未実装/無効。次フェーズはS3/S11条件と実機確認が必要 |
| OSSライセンス・公開物の安全性 | 対象外 | 要追加確認 | LICENSE未確認。公開前に作者がライセンスと配布対象を決定する |

## 5. リスクと必要な対応

### 公開方式に依存する必須対応

SIWCを採用するなら、S7の登録・検証、S2のprovider、S8の資格情報ライフサイクル、S9の利用表示、S11の通知・同意・制限を実装する。`account/read.type=chatgpt`をSIWC権限の代用品にはしない。APIドメインを使うこと自体はAPIキー課金への切替ではないが、OAuthの付与scopeと利用枠条件を検証する必要がある。

現行Codex管理方式を維持して公開する場合は、「SIWC適合済み」「無制限」「OpenAI公認」と説明しない。OpenAIへ、独立した無料ローカルOSSが各利用者のCLI管理認証を使う方式のサポート範囲、SIWCへの移行義務の有無、将来の本人同意付き定期処理の扱いを具体的に確認することを推奨する。問い合わせを今回送信した事実はない。

### CXの安全性を高める推奨対応

| 重要度 | 問題 | 最小の改善案 |
|---|---|---|
| 高 | 認証状態の陳腐化、provider名のみの検査 | account変更で送信停止。送信直前の認証確認、実効provider/URL/認証源を承認済み構成へ限定。既存の通常設定を黙って変更しない |
| 高 | アカウント切替後に同じCX状態を利用 | Threadメタデータを検証済みアカウント/登録別に分離。切替時に停止・明示的再接続。別アカウントで旧Threadをreadしない |
| 高 | OAuth更新時のresumeが自動入力につながる可能性 | 更新とTurnを直列化し、新要求を止める。安全な復元条件を証明するまでは現状の参照専用を維持。自動resumeを追加しない |
| 中 | 制限・失効理由が一般エラーへ潰れる | 本文を保存せず安全な分類コードだけ保持。利用枠到達・失効・接続失敗を分け、無断再送や別アカウント切替をしない |
| 中 | ローカル操作URLの端末出力 | 収集対象から除外、表示する秘密値の寿命を限定。OpenAI OAuth tokenをこのURLへ流用しない |
| 高（公開時） | 配布物に検証生成物等が混入 | 認証値を表示しない秘密検査と配布allowlist。`.gitignore`だけで安全と判定しない。probes/runs、artifacts、`.cx`を配布対象から除外する方針を検討 |
| 中（公開時） | 利用枠・保存・権限が利用者に伝わらない | 接続主体、保存先、送信内容、停止方法、通常の認証更新、利用枠消費を説明。プライバシー文書と問題報告窓口を整備 |

これらの「推奨」は、新たに発見した規約違反の断定ではない。SIWC採用時に同意・本人分離等の公式要件を満たすために必要となる部分は、必須として扱う。

## 6. B方式を保つ移行案（未採用・未実装）

1. runtimeに認証adapterを設ける。既存のCodex管理経路とSIWC経路を混ぜず、利用者へ選択経路を明示する。作者承認までは切り替えない。
2. SIWCはCX自身の登録とhost ID、検証済み本人ID、付与scopeを管理する。Windows利用者専用領域とACL/OS保護を使い、UIには表示用情報だけ渡す。既存Codex auth.jsonは移行材料にしない。
3. SIWC access tokenだけを所有app-serverの子環境へ渡す。公式例の`openai_chatgpt_plan` provider、Responses endpoint、`requires_openai_auth=false`、`supports_websockets=false`を採用候補にする。refresh tokenを子へ不要に渡さない。APIキーにフォールバックしない。
4. currentの`providerSafe`とchatgpt型判定を、経路ごとの認証・scope・接続先検証へ置き換える。許可条件を単に外す修正はしない。name/title/versionと登録名を整合させる。
5. 更新・失効処理を所有runtimeに閉じ、停止と再開をユーザー制御下に置く。既存Turn/Item・承認UI・localhost認証は維持する。新しいOAuth保存責任がCXへ増える点を移行コストとして扱う。
6. モックで期限切れ、取消、scope不足、アカウント混同、再送防止、ログ非漏洩を検証。v0.169.0の対応を確認してから、作者が別途承認した最小実機認証・モデル検証を行う。最新版資料に合わせてCLI固定を無断解除しない。

公式のtoken更新例がresumeを案内していても、CXの既存安全条件を緩める理由にはならない。SIWCのResponses store=falseも、Codexローカル履歴を消す指定ではない。

## 7. 作者が判断すべき事項・残る確認

- 個人用のCodexクライアントとして現行経路を保つか、独立アプリ向けSIWCを正式採用候補として追加設計するか。B方式そのものの変更は不要。
- OSS公開前に公式窓口で現行方式の適用範囲を確認するか。公開は今回未承認。
- SIWC採用に伴うローカル資格情報管理、プライバシー通知、アカウント別保存、利用枠UIの追加を承認するか。
- 無料のplan利用経路、OSSライセンス、将来の有料機能の境界。認証機能の利用を課金必須にしない条件との整合。
- 後続フェーズの自動実行同意：対象・頻度・上限・停止・失効をどこで明示するか。メール等の最終承認は別に維持する。
- 対象プラン/地域/ワークスペースの提供状況、CLI 0.169.0と現在のSIWC providerの互換性、安全なトークン更新・resume、実効課金経路は未実測。

変更は本報告書の新規作成だけ。DECISIONS、製品/検証コード、既存CC版、認証・履歴・設定、検証05マーカーは変更していない。次の実装・認証・モデル検証には進まない。
