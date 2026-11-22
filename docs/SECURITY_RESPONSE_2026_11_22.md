# セキュリティレビュー対応（2026-11-22）

## 手動配置後の確認（追補）

その後、作者が保護先runtime/node.exeと保護先ランチャーを通常のPowerShellから指定Thread ID付きで実行し、「小窓開いた」と報告した。保護版の通常デスクトップでの起動を作者の実機確認として記録する。起動後の各活動の反映まで確認した報告ではない。

作者が通常のPowerShellでインストーラーを実行し、保護先への配置成功を報告した。続いて作者が実行した `icacls "$env:LOCALAPPDATA\Programs\OnecaratCX" /T` の全出力を確認した。ルート・EXE・observer・runtime/node.exe・ランチャー・manifestを含む15項目すべてが正常処理され、許可先は本人・SYSTEM・Administratorsだけだった。CodexSandboxUsersおよびAuthenticated Usersへの許可は表示されていない。Codex側からの同ディレクトリへの読取確認はAccess is deniedで拒否された。

これによりCX-001の保護先配置・ACL確認は、作者提供の実機出力とCodex側のアクセス拒否を根拠に確認済みとする。保護版の起動も、その後の作者の報告で確認済み。保護先の中身をCodexが直接読んで検証したものではない。以下の「未実施」「手動適用待ち」は手動配置前の記録であり、この追補が現在の状態に優先する。

対象：`C:\work\security_check\reports\onecarat-agent-office-cx\2026-11-22_review.md`。指定フォルダ内の最新版（更新時刻08:38:43）。元レポートは変更していない。

## 結論と未適用事項

CX-002〜004、006のコード修正、CX-005の除外設定、CX-007〜008の堅牢化を実施した。**CX-001は対応パッケージと手動配置スクリプトを準備した段階。保護先へのインストールと実ACL検証は未実施であり、解決済みとは判定しない。** 開発先のACLも変更していない。

作者の指示は開発先以外の変更を禁止しているため、LocalAppDataへの配置・アクセス権変更は実行していない。以下を利用者が通常のPowerShellで実施する必要がある。旧版の起動中プロセスも停止していないため、修正は再起動後に反映される。

## 指摘別対応

| ID | 状態 | 対応・残る点 |
|---|---|---|
| CX-001 中 | 手動適用待ち | 開発用とインストール用を分離。開発ランチャーの通常起動を拒否。インストーラーは本人・SYSTEM・AdministratorsのみのDACLで配置先を作成してからコピー。実配置・ACL確認は未実施 |
| CX-002 低 | 現行コード修正済み | 保護先runtime/node.exeを優先。指定はローカル絶対パス・名前・存在を検査。未指定時はPATHを自前走査し、相対パス・アプリ直下・現在ディレクトリを除外。失敗時は観測不可。パス検査はバイナリの真正性保証ではない |
| CX-003 低 | 現行コード修正済み | 小窓起動・言語取得・Node起動を環境変数許可リストへ変更。NODE_OPTIONS/NODE_PATH、任意のサービスキー・トークンを子へ渡さない |
| CX-004 低 | 修正済み | 対応表を型検査＋Object.hasOwnで参照。特殊キーで関数・オブジェクトを返さない。UIもactivity/status/approvalを固定集合へ正規化。未知の承認文字列はuncertain |
| CX-005 低 | 除外で対応 | probes/**/runs/、probes/**/run-*/、probes/**/*-home/を.gitignoreへ追加。資料・消費済みマーカーは保持。固定9ファイルの配置候補に検証ホームを含めない。除外は暗号化・アクセス制限ではない |
| CX-006 低 | 残す場合の2項目を修正 | 旧Cookie名にportを含め、PowerShellをSystemRoot配下の絶対パスで起動。CX_CODEX_EXEも絶対パスのcodex.exeに制限。旧コードと検証は保持するが製品に含めない。直接旧コードを実行すれば操作系機能がある点は残る |
| CX-007 情報 | 堅牢化済み | 開いたread-onlyハンドルのfstatと前後lstatのdev/inoを比較し、realpathのルート内確認を再実施。Windowsの全競合条件を完全に排除する保証ではない |
| CX-008 情報 | 動的実行廃止・成果物限定 | WindowProbe.csへ抽出しInvoke-Expressionを除去。旧EXEは履歴として保持し固定パッケージから除外。署名・公開は行わない |

## レビューと手動配置

候補はrelease/onecarat-cx-secure。EXE、7つのobserverモジュール、ランチャーの9ファイルとmanifestだけを含む。SHA-256はコピー差異の検出用であり、電子署名ではない。開発コードとmanifestを同時に改変できる相手への真正性保証にはならない。配置前にソースと[インストーラー](../scripts/install-office.ps1)をレビューし、承認した版を手動配置する。

インストーラーは指定した信頼済みNode.exeを保護先runtimeへコピーする。開発フォルダ内のNode、相対パス、再解析ポイントは拒否する。Node更新は自動化しない。

旧Officeの小窓を閉じ、**Codexのツールではなく通常のPowerShell**で実行する。Codex本体を閉じる必要はない。

```powershell
# 内容とハッシュだけ検証。配置・ACL変更はしない
powershell -NoProfile -ExecutionPolicy Bypass -File C:/work/onecarat-agent-office-cx/scripts/install-office.ps1 -ValidateOnly

# レビュー済みコピーを本人専用の場所へ手動配置
powershell -NoProfile -ExecutionPolicy Bypass -File C:/work/onecarat-agent-office-cx/scripts/install-office.ps1 -ReviewedPackage -NodeExe "C:\Program Files\nodejs\node.exe"

# 本人・SYSTEM・Administratorsのみであることを確認
icacls "$env:LOCALAPPDATA\Programs\OnecaratCX" /T
```

配置先が存在する場合は上書きせず停止する。更新・旧コピー整理は別途レビューする。途中で失敗した場合は起動せずエラーを確認する。成功後もアプリやCodexを自動起動しない。

配置後の起動：

```powershell
& "$env:LOCALAPPDATA/Programs/OnecaratCX/runtime/node.exe" "$env:LOCALAPPDATA/Programs/OnecaratCX/scripts/launch-office.mjs" --thread <確認済みのThread-ID>
```

この会話のThread IDは01a1fdeb-9d1b-7321-b98e-c9b8482ca26d。他セッションには流用しない。AGENTS.mdとSkillも同じ保護先を案内する。サンドボックスからアクセス不能の場合に開発コピーへ戻したりACLを緩めたりしない。本人権限で動く悪意ある別プログラムによる改変は、この本人専用ACLだけでは防げない。

## 検証

- Node自動テスト98件成功。特殊キー、環境許可リスト、read-onlyハンドルとルート外・junction拒否、旧Cookieのport分離を追加。
- Windowsネイティブのセキュリティ検査7項目成功。Node指定拒否・検索先除外・絶対パス選択・環境値除去・列挙値正規化。
- Windowsフォーム合成試験：既存の窓分離・日英等に加え、Receive経由の未知の列挙値拒否を追加。
- 現行EXEをビルドし合成ログで起動・撮影・終了。隔離デスクトップ上で、通常画面への起動確認ではない。
- パッケージの内容・ハッシュ検証（ValidateOnly）成功。インストール・ACL検証の成功ではない。
- ステージング中のパッケージランチャーから合成ログの窓を起動・撮影・終了する検査も成功。保護ACLは付けていないのでCX-001の実適用確認には数えない。
- 消費済みマーカー2件のSHA-256が以前の確認値と一致。既存証拠を保持した。
- 新しいモデル呼出し、実承認操作、既存検証DBの再走査・削除、外部公開、署名は未実施。

結果：artifacts/security-review/unit-tests.txt、native-results.json、フォームのartifacts/v11/*.checks.json。古いEXEを直接起動した場合には修正は適用されない。
