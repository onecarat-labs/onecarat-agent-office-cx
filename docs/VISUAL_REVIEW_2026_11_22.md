# 画面改善と反復確認（2026-11-22）

## 追補：高さを10％短縮

追加依頼により標準クライアントの高さを380から342へ短縮した。幅と人物サイズを保ち、人物・机を16論理px上へ移動。状態と部下の終了記録を1行に統合した。最新成果物はdist/v1.1-compact、ランチャーも同版を参照する。

ビルド、ネイティブフォーム検査、構文検査に成功。今回の変更に合わせた新規テストは追加していない。日英・終了状態・承認・人数超過・小/大サイズ・実ログの画像を再取得し、縮小による重なりを確認した。初回画像でフッター文言を調整し再撮影。[委任中](../artifacts/visual-review/compact/delegating.png)、[英語](../artifacts/visual-review/compact/english.png)、[実ログ](../artifacts/visual-review/compact/live.png)。通常デスクトップでの表示確認とは区別する。以下は圧縮前の反復確認の記録。

作者から提示された画像と、改善・起動・画像確認・再修正を繰り返す依頼に基づく。参照元CC版やCodexの設定・認証には変更を加えていない。

## 変更

- 横一列の配置を、左のマネージャーと右の前後2席へ変更。部下はマネージャーを向き、ラグでチームのまとまりを表現する。
- 子のターン終了・明示完了の記録から7秒後に人物表示を畳む。セッションを終了したと判断したり、Codexを操作したりはしない。新しい作業が記録されれば人物表示へ戻す。
- 畳んだ子は「部下の最終記録：ターン終了 N」等で残す。単なる無更新・状態不明は畳む根拠にしない。
- 未解決の承認は畳まず、表示枠でも優先する。表示外の子は「表示外の部下 N」と明記する。
- 新しい子を優先しつつ、表示中の2人はID順で位置を安定させる。観測時刻の更新だけで左右の席を交換しない。
- 論理ステージ620×420を縦横比を保って拡縮。標準クライアント560×380。状態・役割・人数の文字は小窓でも一定以上の大きさで描く。
- 委任の書類は観測したstartedイベントから6秒だけ。古い子や親子関係だけから委任を再現しない。
- 終了演出後に入力動作へ戻らないよう修正。終了演出の経過時間にはイベント時刻も使い、古い終了記録を読み込むたびに手振りを再生しない。

## 画像を使った改善の反復

| 段階 | 確認・発見 | 対応 |
|---|---|---|
| pass1 | 委任中・終了後の整理・実ログの子4つの折畳みを画像で確認。小窓の文字が細かすぎた | 状態・役割・人数のフォントに下限を設ける |
| pass2 | 小窓の状態文字が読みやすくなったが、看板のOnecarat Labsが省略された | 看板だけは元の拡縮を維持し、全文が収まるよう修正 |
| final | 日英、委任中、終了後、承認不明、人数超過、小サイズ、大サイズ、実ログの画面を再撮影 | 配布用EXEそのものも別途起動・撮影して確認 |

画像： [1回目](../artifacts/visual-review/pass1/delegating.png)、[1回目の小窓](../artifacts/visual-review/pass1/small.png)、[2回目の小窓](../artifacts/visual-review/pass2/small.png)、[最終の小窓](../artifacts/visual-review/final/small.png)、[最終の英語](../artifacts/visual-review/final/english.png)、[終了後](../artifacts/visual-review/final/done.png)、[実ログ](../artifacts/visual-review/final/live.png)、[製品EXE](../artifacts/visual-review/final/product-exe.png)。

## 検証の区別

- 自動テスト：全94件成功。ログ分離・委任根拠等を含む。出力は[unit-tests.txt](../artifacts/visual-review/unit-tests.txt)。
- 合成ログ＋ネイティブフォーム：既存の窓分離・重複防止・日英の検査に加え、終了した子の折畳み、承認の保持、無更新だけでは畳まないこと、再活動時の復帰、最近の終了演出を確認する検査を追加。
- 画像の意味：live以外は合成状態・合成ログ。報告された承認表示が、現行Codex実ログから取得できたという証拠ではない。
- 実ログ：現在セッションのworkerを起動し、そのsnapshotを同じ描画クラスで表示・撮影。実在する子の過去の終了記録が畳まれることを確認。
- 製品EXE：テスト専用entrypointとは別に、ビルドしたOnecarat-CX.exeを合成ログへ紐付け、窓を撮影して正常に閉じた。
- これらの画像確認はCodexの隔離デスクトップ上。利用者の通常デスクトップへの表示は、この検証から成功と扱わない。OSのDPI設定変更による網羅試験は未実施。

再現手順：`npm.cmd run build`、`npm.cmd test`、`npm.cmd run test:desktop`、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/review-stage.ps1 -Pass final`、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/review-product.ps1`、`node scripts/check-visual-review.mjs`。

## 起動

更新前の窓を上書きせず、成果物は `dist/v1.1-review/Onecarat-CX.exe`。ランチャーも更新版へ切替済み。同じセッションの旧窓が開いている間は再利用されるので、利用者が小窓を閉じてから通常のPowerShellでランチャーを実行する。Codex本体を閉じる必要はない。

```powershell
node C:/work/onecarat-agent-office-cx/scripts/launch-office.mjs --thread <確認済みのThread-ID>
```

部下のターン終了とセッション終了を引き続き区別する。畳んだ表示は最終記録の要約であり、現在の実行状態の保証ではない。表示外の人数も、実際に作業中の人数とは限らない。
