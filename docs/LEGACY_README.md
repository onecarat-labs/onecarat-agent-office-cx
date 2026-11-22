# Onecarat Agent Office CX

Codexの作業を人物・会話・活動一覧で観測し、依頼と承認を行うローカルOffice。フェーズ1の最小動作版です。初回正式公開版ではありません。Research Lab・秘書・PowerShell remote TUI連携は後続フェーズです。

## 起動

フェーズ2の画面レビューモック（Office / Research Lab、実Codex接続なし）：

```powershell
npm run demo:phase2
```

表示された`http://127.0.0.1:...`をブラウザで開いてください。Research Labでテーマを追加し、「モック調査を開始」→「成果受領イベントを進める」→「完了イベントを進める」で操作できます。データはブラウザのメモリだけに保持し、ページ再読込で消えます。日時は表示のみで自動実行しません。終了は起動端末でCtrl+C。詳細は[フェーズ2モック実装結果](docs/PHASE2_MOCK_IMPLEMENTATION.md)。

以下は既存フェーズ1の起動方法です。

Windows通常ユーザー、Node.js 24以上。実行時依存パッケージのインストールやビルドは不要です。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
npm run demo
```

表示された一時URLをブラウザで開き、「接続」→「新しいセッション」→依頼入力→承認または拒否を確認できます。**demoは架空のfixtureです。モデル・シェル・外部サービスは実行しません。** URLはローカル操作権限を持つため共有しないでください。終了は起動端末でCtrl+C。

実Codexへの接続（モデル送信は既定で無効）：

```powershell
npm start
```

Codex CLI **0.169.0のみ**を受け入れます。通常npm版を自動検出し、別配置なら`CX_CODEX_EXE`でcodex.exeの絶対パスを指定してください。接続はUIから明示的に行います。正規の既存ログインをCLI経由で確認し、認証ファイルは読み出し・コピーしません。APIキー環境変数は引き継ぎません。実行先はCX内の`.cx/live/workspace`に限定しています。

`--enable-model`はモデル送信を有効にする入口です。**作者が対象・回数・影響を承認した実機テスト以外で有効化しないこと。** 専用E2Eで挨拶1回の実モデル応答・Turn完了・UI反映を確認済みです（[結果](docs/PHASE1_E2E_GREETING.md)）。実承認は未実測です。新規Thread/通常CLI補助ファイルの保存はCodex側で起こり得ます。

## 現在の制限

- CXが作成したセッションだけを管理。管理外Threadを自動取込みしません。
- `thread/resume`は使いません。認証変更・切断・再起動後は旧Threadを隔離し、readも行いません。再接続後は新規セッションから開始します。安定した本人・ワークスペース一致は未確認のため、同じChatGPT表示でも旧Threadを復元しません。
- 送信結果不明時は入力をロック。プロセス再起動後の旧Threadは隔離され、read/resumeしません。
- コマンド/ファイル変更の基本承認は対応。判断材料が不足する承認、追加権限/ネットワーク要求は承認不可。未知要求は未対応として表示します。
- サブエージェントは実際のcollabAgentToolCall受信時だけ構造に追加します。詳細状態は未実測で、無入力時に架空の人物を増やしません。実接続ではフェーズ1の初期設定でmulti_agentを無効にしています。
- 永続化するのはThread ID・選択・直近イベントのメタデータ。回答・依頼・承認内容はCX診断ログに保存しません。この接続内の既知Threadに限り状態照合を行えます。過去の接続の会話は自動再表示しません。
- 作業完了は成果の正しさの保証ではありません。サーバー停止・通信断は不明状態にします。

## 構成

画面更新に失敗すると操作を停止し、「画面を再確認」から状態取得だけを再試行できます。依頼の自動再送やCodexへの自動再接続は行いません。下書きは同じ接続のセッションごとにメモリ内で保持し、認証・接続境界の変更やページ再読込で破棄します。今回の仕上げとモック検証の詳細は[PHASE1_POLISH](docs/PHASE1_POLISH.md)を参照してください。

`Office UI → 認証付きローカルHTTP → CX Runtime → 所有stdio → Codex app-server`

B方式。UIは任意のRPCを発行できません。localhostのHost/Origin検査、HttpOnly/SameSite Cookie、CSPを使用します。サーバーは127.0.0.1だけで待ち受け、所有する子プロセスだけを終了します。stdioのためapp-server用WebSocket待受はありません。A方式はtransport境界の拡張対象、C方式は保留です。

## 検証

```powershell
npm test
npm run check
npm run test:connection
```

接続テストは新規隔離ホーム・無効なモデル接続先を使用し、initialize/account/read/config/read以外を遮断します。Thread作成・Turn・resumeは送りません。テスト生成物は`.cx/`と`artifacts/`。単体テストの一時領域はOSのTemp配下です。

ブラウザテストは別途インストール済みの`playwright-core`とEdgeを使います。ランタイムはこれらに依存しません。

```powershell
$env:CX_PLAYWRIGHT = '＜playwright-coreのindex.mjs絶対パス＞'
npm run test:ui
```

今回の結果は[フェーズ1記録](docs/PHASE1.md)、画像は`artifacts/office-desktop.png`、`artifacts/office-mobile.png`に保存しています。

## 文書

- [フェーズ2詳細設計案（設計のみ・未実装）](docs/PHASE2_DESIGN.md)

- [フェーズ1最終受け入れレビュー：条件付きPASS](docs/PHASE1_ACCEPTANCE_REVIEW.md)

- [開発ルール](AGENTS.md)
- [製品仕様](docs/PRODUCT_SPEC.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [設計判断](docs/DECISIONS.md)
- [検証履歴](docs/VALIDATION_PLAN.md)

CC版は読み取り専用の参考資料です。本アプリはCC版のソース・node_modulesを実行時に参照しません。SVG/CSSはCX用に新規作成しました。CC版のMITライセンスは確認済みですが、コードやブランド素材をコピーしていません。
