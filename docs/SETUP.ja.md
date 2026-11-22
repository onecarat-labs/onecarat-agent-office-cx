# セットアップ・更新・削除

[READMEへ戻る](../README.md) | [English](SETUP.en.md)

## 初回セットアップ

必要な環境はWindows 10/11、.NET Framework 4.8、Node.js 24以上、および同じPCにセッションログを保存するCodexです。

**このリポジトリはソースコードです。GitHubから取得しただけでは起動用EXEはありません。** ビルドして、普段使うWindowsユーザー専用の場所へ配置します。すでに配置済みなら、この節を繰り返す必要はありません。

### 1. ビルドと配置候補の作成

ソースを `C:\work\onecarat-agent-office-cx` に置いた例です。別の場所なら最初のパスを変更してください。以下は1行ずつ実行し、エラーになったら以後の操作を止めてください。追加のnpmパッケージのインストールは不要です。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
npm.cmd run build
node scripts/package-office.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-office.ps1 -ValidateOnly
```

最後に `Package contents and hashes verified` が表示されれば、配置候補のファイルとハッシュの確認は完了です。これはソフトウェアの署名や安全性全般の保証ではありません。

### 2. 内容を確認し、保護された場所に配置

[セキュリティ対応・手動配置手順](SECURITY_RESPONSE_2026_11_22.md#レビューと手動配置)とスクリプト・配置候補の内容を確認してから、**通常のPowerShellで本人が**実行します。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-office.ps1 -ReviewedPackage
icacls "$env:LOCALAPPDATA\Programs\OnecaratCX" /T
```

Node.jsの既定の参照先は `C:\Program Files\nodejs\node.exe` です。別の場所にインストールした場合は、インストールコマンドに `-NodeExe '信頼できるnode.exeの絶対パス'` を追加します。

配置先は `%LOCALAPPDATA%\Programs\OnecaratCX` です。`Installed reviewed copy with private ACL` が表示され、アクセス許可が本人・SYSTEM・Administratorsだけであることを確認してください。インストール処理はOfficeやCodexを自動起動しません。完了後は[普段の起動方法](../README.md#普段の起動方法)へ進みます。

**配置先がすでに存在する場合は上書きせず停止します。** 自動更新機能はありません。更新時は変更内容と配置手順を別途確認してください。開発フォルダのEXEを通常利用の代替として起動したり、保護先のアクセス権を緩めたりしないでください。

## 更新

以下は利用者が通常のWindows環境で行う手順です。アプリ内の自動更新機能ではありません。

1. 更新対象のソースと変更内容を確認します。Gitで取得した場合は作業フォルダで `git status` を確認し、未保存の変更がない状態で `git pull --ff-only` を実行します。競合や失敗があれば、その時点で止めてください。
2. 上の初回セットアップの手順でビルド・パッケージ作成・`-ValidateOnly` を実行します。新しいスクリプトと配置候補を確認してから次へ進みます。
3. Officeの小窓をすべて閉じます。Codexを終了する必要はありません。
4. エクスプローラーのアドレス欄へ `%LOCALAPPDATA%\Programs` を入力します。実際のインストール先であることを確認し、その中の `OnecaratCX` を、未使用の名前（例：`OnecaratCX-backup-20261122`）へ変更して退避します。別の場所へ移したり、アクセス権を変更したりしないでください。使用中などのエラーがあれば止めます。
5. 初回と同じ `-ReviewedPackage` のコマンドで新規配置し、`icacls` の結果を確認します。
6. 確認済みのThread IDで起動し、対象セッションの小窓が開くことを確認します。旧版の退避フォルダは、動作確認が終わるまで残してください。

更新に失敗した場合は新しい小窓を閉じ、エクスプローラーで新しい `OnecaratCX` を別の未使用名へ退避し、旧版のフォルダ名を `OnecaratCX` に戻します。初回配置自体が失敗し、新しいフォルダが存在しない場合は旧版の名前を戻すだけです。旧版を戻した後もアクセス権と起動を確認してください。

ソースを更新しただけでは、保護先のアプリは更新されません。

## アンインストール

1. Officeの小窓をすべて閉じます。
2. エクスプローラーで `%LOCALAPPDATA%\Programs` を開き、インストールしたアプリのフォルダであることを確認します。
3. `OnecaratCX` フォルダだけを削除します。更新時に作った退避フォルダも不要なら、それぞれ内容を確認して削除します。親の `Programs` フォルダは削除しないでください。

このインストーラーは自動起動登録やCodex設定の書き換えを行いません。Codex本体、`.codex`、セッションログ、プロジェクトのソースは削除不要です。ソースも不要なら、独自の変更や検証記録を残す必要がないことを別途確認してください。

## この手順の確認範囲

インストール先・既存フォルダの拒否・コピー内容は現行スクリプトと照合済みです。初回の保護配置・アクセス権・起動は過去に作者が確認しています。今回のREADME改善では、更新・退避・復元・削除を実機で実行していません。

