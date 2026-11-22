# 過去の検証資料

移管日：2026-11-15。既存ファイルの保存のみで、今回の再実行・修正・新規コード作成は行っていません。

| 保存先 | 移管元 |
|---|---|
| 01-stdio/probe.mjs、result.json | C:/Users/oneca/AppData/Local/Temp/onecarat-cx-probe01-e654fba9fce34a84bcc448942a9cfcf6/ |
| 02-websocket/probe.mjs、result.json | C:/Users/oneca/AppData/Local/Temp/onecarat-cx-probe02-82a0c9131fde4c44964f85440979a422/ |

両スクリプトと結果JSONを読み取り確認し、原本のままコピーしました。実行時生成物のisolated-homeは移管していません。認証情報・キャッシュ・システムスキル等を含み得るホーム全体を製品資産にはしません。

コードには当時のWindows用Codex実行ファイルの絶対パスがあります。各コードは実行すると自身の場所にisolated-homeとresult.jsonを書きます。証拠を上書きしないよう、将来再検証が承認された場合は別の出力先を用意する必要があります。現状は保管用であり、実行を承認したものではありません。

検証02は手書きのWebSocketクライアントを含みます。製品用通信実装として採用したものではありません。両コードの環境変数・プロキシ設定は当時の検証条件であり、現在の開発規約や再実行手順ではありません。

実行日時・Codexバージョン・stderr本文・過去会話全文は引き継げていません。結果の範囲と限界は[VALIDATION_PLAN](../docs/VALIDATION_PLAN.md)に記録しています。
