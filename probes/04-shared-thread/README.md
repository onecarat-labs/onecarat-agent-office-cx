# 技術検証04：同一Threadの参照・再参加

2026-11-15。Codex CLI 0.169.0／Node v24.19.0／Windows疑似端末。今回の作者指示による検証限定の許可。モデル実行・プロンプト・承認要求を伴う操作は行わない。

## 保存資料

- `probe.mjs`：03-Bを基に作成した、隔離app-server・remote TUI・観測クライアントA/Bの検証。
- `result.json`：最新試行の集計結果。検証用に新規生成されたThread ID、状態、API成否、通知名を保存。本文・トークン・認証情報は保存しない。
- `runs/2026-11-15T05-14-04-125Z/result.json`：初回。resumeのエラーコードを記録。
- `runs/2026-11-15T05-14-30-246Z/result.json`：再試行。エラー理由の記録を追加。
- `schema.mjs`、`schema-command.json`、`schema/`：既存CLIのgenerate-json-schemaでローカル生成したAPI定義。オンライン調査・依存追加なし。

隔離ホーム・内部SQLite等は.gitignoreで除外。過去の検証コード・結果は変更していない。環境分離には既存の`../03-remote-tui/inspect.mjs`の関数を利用する。

## 仕様根拠

`schema/v2/ThreadReadParams.json`：threadIdが必須。includeTurns=falseで本文の取得を避ける。

`schema/v2/ThreadResumeParams.json`：threadIdが必須。excludeTurns=trueはmetadataとlive-resume stateのみ返す指定。説明にはrunning threadのIDなら再参加するとある。ただし、今回のidleかつrolloutなしThreadでの成功を保証する記述として扱わない。

`schema/v2/ThreadReadResponse.json`のThread.statusはruntime statusと説明され、ThreadStatusにnotLoaded／idle／systemError／activeが定義される。TUIの選択状態という定義ではない。

## 実測手順と結果

1. 127.0.0.1限定、capability-token必須のapp-serverを新規起動。トークン無し／不正は401、A/BとTUIは101。
2. A/Bはinitialize後にthread/listとthread/loaded/listを取得。開始時は0件。
3. TUIを無入力起動。TUIのthread/startに対するthread/startedがTUI・A・Bへ届く。Aが受けたIDを対象に選ぶ。
4. A/Bのloaded一覧に同一IDが1件。thread/readは同じIDとstatus.type=idleを返す。通常thread/listは0件。
5. A単独、B単独、A/B並行のthread/resumeを実行。引数はthreadIdとexcludeTurns=trueのみ。設定・権限のoverrideなし。すべて-32600。
6. TUIのみ終了後も、A/Bは同じIDをloaded一覧・thread/readで参照でき、idleのまま。
7. Aを切断し、新規接続でinitialize→resume→read。resumeは同じエラー、readは同じIDで成功。
8. 所有する子プロセスと中継を終了。子のclosed=true、サーバーポート閉鎖を確認。

再試行の全5件のresumeエラーは `no rollout found for thread id [THREAD]`。初回も全5件が-32600だったが、エラー本文は保存していない。Thread IDは各試行で異なる。

TUI／A／Bにはstartupフェーズのthread/startedが各1件。同じIDとidleが一致。resume試行中の追加通知は記録されず、再接続AにはremoteControl/status/changedだけが届いた。これは数秒の観測範囲であり、全通知の配送規則や再送の保証ではない。

## 安全範囲と限界

観測クライアントの許可メソッドはinitialize、thread/list、thread/loaded/list、thread/read、thread/resumeのみ。既存認証・設定・履歴をコピーせず、03-Bと同じ隔離環境を使用。モデルURLとプロキシは無効なループバック先。秘密トークンはメモリとTUI子の環境変数にのみ置く。中継は秘密ヘッダー・本文を保存しない。

TUIは標準端末を継承し、キー入力を送らない。通信記録にturn/startはなく、承認要求も観測していない。modelTurnRequestsSentはプローブ送信範囲の宣言値であり、全通信の監査値ではない。TUI stdout/stderrの0 bytesは未計測を意味する。画面のPATH alias helper警告は03-B同様で、接続は成功した。

includeTurns=false／excludeTurns=trueなのでturnsArrayLength=0は「履歴が存在しない」証明として使わない。Thread IDとruntime statusだけを状態比較に使う。TUIが同じThreadを起動して入力待ちになったことは確認したが、選択を変更するUI操作や選択中IDの専用APIは調べていない。

並行resumeがともに失敗したため、成功した同時操作の排他性・順序・承認競合について結論は出せない。loaded、readable、resumable、TUIでselected、Turnがactiveは別概念として扱う。

## 再現

対話型PowerShellで以下を実行すると、毎回新しい隔離環境を作る。TUIへは入力しない。今回の作業では追加実行しない。

```powershell
Set-Location C:\work\onecarat-agent-office-cx
node .\probes\04-shared-thread\probe.mjs
```

参照・再参加の確認範囲で終了。rolloutがない理由やモデルなしの永続化手段は未確認。turn/start、実行中の通知、承認配送の検証は別の許可が必要。
