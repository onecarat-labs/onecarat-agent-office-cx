# Onecarat Agent Office CX

**Codexが働く姿を、小さなオフィスで楽しく眺める。** Windows向けの、1セッション1窓の読み取り専用ビューワーです。

## セキュリティ修正後の起動

2026-11-22のレビュー対応で、開発フォルダのプログラムを通常のWindows権限で直接起動する案内を廃止しました。**保護コピーの手動配置が必要です。今回、その配置とACL変更はまだ実行していません。**

先に[セキュリティ対応・手動配置手順](docs/SECURITY_RESPONSE_2026_11_22.md)を確認してください。配置済みの場合は、通常のPowerShellで次を実行します。

```powershell
& "$env:LOCALAPPDATA/Programs/OnecaratCX/runtime/node.exe" "$env:LOCALAPPDATA/Programs/OnecaratCX/scripts/launch-office.mjs" --thread <確認済みのThread-ID>
```

Codexからの「このセッションのOfficeを開いて」は[office-cx Skill](skills/office-cx/SKILL.md)が同じ保護先を参照します。CODEX_THREAD_IDと実ログのIDを照合し、最新ログやCODEX_SESSION_IDから推測しません。保護先にサンドボックスがアクセスできない場合は通常のPowerShellで起動します。開発コピーへのフォールバックやACL緩和は行いません。

同じセッションの再起動は既存窓を再利用します。旧窓が開いていれば閉じてから起動してください。小窓を閉じてもCodexは継続します。隔離デスクトップの窓は通常画面から見えない場合があります。

## 画面と制約

- 初期サイズ504×308。移動・サイズ変更・最小化に対応。
- 左のマネージャーと右の部下2席が向かい合います。実際の開始記録があれば委任の書類を渡します。
- 終了した子のターンは7秒後に人物を畳み、下部に最終記録を集約。無更新だけでは終了と判断しません。
- 承認未解決は表示を維持。表示枠に収まらない人数は「表示外の部下 N」です。
- Windows表示言語が日本語なら日本語、それ以外・判定失敗時は英語。最前面と動作停止は右クリックで切り替えます。

Codex 0.169.0の保存ログでは承認要求が非永続扱いのため、実際の承認待ちを確実には検出できません。承認はCodex本体で確認してください。取得できた場合の保持・解除表示は合成テストで検証しています。15秒無更新の通常活動は現在状態不明です。

会話本文・ファイル内容・コマンドをUIへ渡さず、観測結果を保存しません。製品にネットワーク通信やCodex操作機能はありません。ログ形式変更・保存無効・別PCのセッションは保証対象外です。

## 開発と検証

Windows 10/11、.NET Framework 4.8、Node.js 24以上。追加npmパッケージは不要です。

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-security.ps1
npm.cmd run check
node scripts/package-office.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-office.ps1 -ValidateOnly
```

開発ビルドはdist/v1.1-secure、手動配置候補はrelease/onecarat-cx-secure。開発用ランチャーは通常起動を拒否します。`--development`は開発者が意図して開発コピーを実行する場合だけの明示オプションで、保護配置の代替ではありません。旧ビルド・検証ホーム・操作系の旧コードは履歴として保持し、インストール候補には含めません。

表示テストは[動きのプレビュー](docs/MOTION_PREVIEW.md)を参照。開発用EXEであり、保護済み製品には含まれません。

[技術仕様](docs/TECHNICAL_SPECIFICATION.md) / [セキュリティ対応](docs/SECURITY_RESPONSE_2026_11_22.md) / [判断履歴](docs/DECISIONS.md)
