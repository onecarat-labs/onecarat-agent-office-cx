# 技術検証03-B：Windows疑似端末

2026-11-15実施。既存の検証03のコード・結果を保持し、`probe-b.mjs`と`result-b.json`を追加した。今回のユーザー指示に基づく検証限定の作業。

## 方法

実行ツールの`tty:true`でWindows上のPowerShellを起動し、そのNodeプロセスからremote TUIに`stdio:'inherit'`で端末を継承した。stdin/stdout/stderrの`isTTY`はすべてtrue。端末バックエンドの内部実装は調査しておらず、ConPTYを直接呼ぶコードは追加していない。既存のwt.exeとconhost.exeの所在も確認したが、使用していない。追加パッケージなし。

検証用app-serverと観測クライアントA・Bは前回と同様。remote TUIとapp-serverの間に127.0.0.1限定の透過TCP中継を置き、HTTP Upgradeのステータス、RPCメソッド名、応答ID・成功可否・結果キーだけを記録した。中継は認証を代行せず、remote TUI自身のBearerヘッダーをそのまま認証必須のapp-serverへ渡す。ヘッダー・トークン・本文は保存しない。

トークンはランダム生成し、remote TUI子の環境変数に渡す。app-serverへ渡すのはSHA-256ダイジェストのみ。検証03の`environment()`を用い、既存認証・設定・履歴を引き継がない。実際のモデル用エンドポイントは設定しない。管理者権限なし。

## 実測

- Windows、Codex CLI 0.169.0、Node v24.19.0。
- remote TUIが入力待ち画面を表示。キー入力は一切送っていない。
- remote TUIの中継接続は1回、HTTP 101。initialize応答成功とinitialized送信を記録。
- remote TUIが起動時にthread/startを送信し、成功応答とthread/started通知を受信。
- 観測クライアントA・Bもthread/startedを受信。起動前のthread/loaded/listは各0件、TUI稼働中は各1件。thread/listは各0件のまま。
- TUIのクライアントメソッド記録にturn/startなし。thread/startとturn/startを区別する。
- 10秒の無入力観察後、所有するTUI子だけをkill。app-serverと観測クライアントは継続し、一覧取得成功。最後に所有するapp-serverを終了しポート閉鎖を確認。

`result-b.json`および`runs/2026-11-15T05-07-56-139Z/result.json`が結果。過去の`result.json`は変更していない。

## 解釈上の限界

接続成立は透過中継でのHTTP/RPC実測から確認した。観測クライアント自身が取得したのはThread通知・一覧であり、「現在remote TUIが接続中か」を直接返すAPIは確認していない。thread/startedやloaded件数だけでTUI接続中と断定しない。

Thread ID・状態値・選択状態は集計結果に保存していない。TUI内でのThread選択、既存Threadへの再参加、複数クライアントによる同一Thread操作、正常終了、モデル処理中の通知配送は未検証。通常一覧が0件の理由を永続化条件等で説明するのは推測になる。

TUIは端末を直接継承したため、結果内のremote-TUIのstdoutBytes/stderrBytes=0は「計測していない」を意味する。rawOutputSaved=falseもプローブのJSON保存に関するもので、実行ツールには画面出力が表示された。分離環境の起動画面だけであり、実会話やトークンは含まない。

画面にPATH alias用helperをTEMP配下で作れないという警告が出た。TEMPと検証用ホームを同じ場所にした設定に関連する警告だが、今回の接続・起動は成功した。警告を除去するための追加試行はしない。

modelTurnRequestsSent=0は元コードのプローブ送信範囲の宣言値。今回は加えて、中継のclientMethodsにturn/startがないことを確認した。OSレベルで全通信を監査した結果ではない。

## 再現用コマンドと停止点

現在の検証目的は達成したため、作者の操作は不要。再現を希望する場合だけ、通常の対話型PowerShellで以下を実行できる（パイプや出力リダイレクトを付けない）。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
node .\probes\03-remote-tui\probe-b.mjs
```

トークンの手動入力・既存ログインのコピーは不要。期待する表示はOpenAI Codex v0.169.0、loadingの後に入力待ち画面。入力せず待つと約10秒の観察後に検証用プロセスが終了し、集計結果が出る。トップレベルのresult-b.jsonは再実行結果に更新され、各実行の結果は時刻別ディレクトリに残る。モデル名の表示はモデル実行の証拠ではない。

Thread選択や再参加の確認には別の操作範囲の合意が必要。今回のスクリプトでプロンプトやコマンドを入力しない。製品実装・モデル実行へは進まない。
