# NORMAL_USER_REQUIRED再現調査

2026-11-15。今回の制限外診断について新たな実行承認を求め、許可後に実施。以前のE2E実行許可は流用していない。診断以外の処理、権限変更操作、app-server/Thread/モデル起動は行っていない。

## 結果

10:31:40 UTC、Node v24.19.0、PID 20376。前回E2Eと同じ実行ツールのrequire_escalated経路でNodeを起動し、製品と同じspawnSync('powershell.exe', ['-NoProfile','-Command', ...], {windowsHide:true,encoding:'utf8'})を実行した。製品は読み取りのみで変更していない。診断コードはprobes/privilege-diagnosis/probe.mjs。

| 項目 | 今回の制限外再現 | 前回調査の制限下 |
|---|---|---|
| 権限確認終了コード | 0 | 0 |
| stdout | True + CRLF | False + CRLF |
| stderr | 空 | 空 |
| Administrator判定 | true | false |
| 整合性SID | S-1-16-12288（High） | S-1-16-8192（Medium） |
| Administratorsグループ | あり | なし |
| PowerShell言語モード | FullLanguage | FullLanguage |
| 製品ゲート | 拒否 | 通過 |

今回再現した原因は**制限外の実行コンテキストがAdministratorロールを持つこと**。コマンド失敗、出力の空白差異、言語モード制限ではない。製品の条件「終了コード0かつstdout.trim()がFalse」を満たさず、NORMAL_USER_REQUIREDとなる。

前回終了済みE2Eのプロセストークンや権限確認stdoutは保存されていないため、その瞬間の判定値を遡及的に証明することはできない。ただし同じツール経路・同じNode→PowerShell判定で拒否条件を再現でき、前回失敗の説明として強い根拠になる。元のプロセスと同一トークンであることまでは主張しない。

## initialize診断との関係

initialize単独診断は製品の通常ユーザーゲートを経由せず、直接app-serverをspawnしていた。制限外でその診断が成功しても、通常ユーザーでの成功を意味しなかった。以前の記録で制限外を「通常ユーザー環境」と記述した箇所は、権限未確認の推定だった。本調査でその扱いを訂正する。

今回の実行許可はサンドボックス外で診断する許可であり、Windows通常ユーザートークンを保証するものではない。診断は既に与えられたトークンを観測しただけで、runas、UAC操作、トークン変更などの昇格/降格操作は行っていない。

## 推奨

- 製品ゲートは正しく拒否しているため、緩和しない。
- この制限外経路を実モデルE2Eに再利用しない。制限下へ戻すだけでは既知のホーム解決問題が残る。
- 次に必要なのは、作者の非管理者PowerShellなどでAdministrator=False・Mediumを確認できる実行環境。実行方法は別途作者の判断と許可を受け、今回は環境切替やE2Eを行わない。
- 将来の診断改善として、NORMAL_USER_REQUIREDを「管理者判定」「権限確認失敗」「出力不明」に区別し、終了コードと安全な診断だけを記録する。今回は製品コードを変更しない。

モデル送信0、Thread操作0、app-server起動0、認証情報収集0。診断Node/PowerShell/whoamiは終了済み。
