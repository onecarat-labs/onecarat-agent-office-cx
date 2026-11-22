# GitHub連携の準備

2026-11-22、作者の「Claude Code側と同じように、依頼すればGitHub操作をしてもらえる状況にしたい」という依頼に基づく。

## 確認できた状態

- 参照元CCのremoteは `https://github.com/onecarat-labs/onecarat-agent-office-dev.git`。設定を読み取っただけで変更していない。
- CXは未初期化だったため `git init -b main` を実行した。remote設定・コミット・pushは未実施。GitHubリポジトリ作成は下記の作者実行結果で確認。
- GitとGitHub CLIは導入済み。コミット名はonecarat、メールはGitHubのnoreplyアドレスに設定済み。
- このCodex環境の `gh auth status` はonecarat-labsの認証失敗。通常Windowsユーザーの認証まで失効したとは断定しない。ログアウト、再ログイン、認証情報コピーは行っていない。
- `git add` は `.git/index.lock: Permission denied`。ACLやサンドボックス設定を変更せず停止。別のGitディレクトリを使って制限を回避していない。
- GitHubプラグインが利用可能な候補として見つかったが、この時点では未導入・未接続。導入だけでCLIや.gitへのアクセス制約が解除されるとは断定しない。

## 接続先の承認（2026-11-22）

作者の「新規作成してください」により、`onecarat-labs/onecarat-agent-office-cx-dev` を非公開で新規作成する方針が承認された。参考として `https://github.com/onecarat-labs/onecarat-agent-office/` が指定された。Web取得は失敗し、参考ページの内容は未確認。公開リポジトリの作成・公開設定変更は許可範囲に含めない。

作者が提示した通常PowerShellの `gh auth status` ではonecarat-labsの認証成功（keyring、HTTPS）を確認。一方、このCodex環境で再実行すると引き続き認証失敗。認証情報の移動やアクセス制約の回避は行わない。

作者が通常PowerShellで `gh repo create onecarat-labs/onecarat-agent-office-cx-dev --private`（説明文付き）を実行し、作成成功とURLを提示した。これは作者の実行結果による確認で、Codexからのリモート照合ではない。ソースのcommit・pushと、Codexから依頼のみでGitHubを操作できる接続は未完了。

## 送信前の準備

検証用ホーム、runs、preflight等の保存結果、DB、認証ファイル、環境ファイル、ビルド、配布候補をGit対象から除外。元のローカル証拠や消費済みマーカーは削除していない。モデル検証の消費済みマーカー2件は追跡候補に残す。過去文書からリンクされた結果ファイルの一部はローカル専用で、GitHub上には含まれない。

`node scripts/check-git-content.mjs --worktree` で候補を確認した。特殊キー・トークン・秘密鍵・JWTのパターン検査はファイル名と分類だけを出力し、値を表示しない。これは全種の秘密情報の不在を保証する検査ではない。ステージングが可能になったら、引数なしで実際のindexの内容を再確認する。

## 完了までの流れ

1. リポジトリの所有者・名前・公開範囲を確定する。
2. Codexから利用できる認証経路と、Git操作可能な実行環境を確認する。現在の制約を回避するためのトークンコピー・ACL緩和はしない。
3. 対象ファイルをステージし、index内容の検査・差分確認後にコミットする。
4. 確定した送信先と作者の明示指示に基づき、リポジトリ作成・pushを実施する。
5. 以後も「コミットして」「pushして」「PRを作って」という依頼を、その対象範囲で実施する。force push、公開範囲変更、削除までを包括許可と解釈しない。

現時点では準備段階であり、「お願いだけでpushできる状態になった」とは報告しない。
