# Office icon

2026-11-22、作者が承認した「ダイヤを差し出す棒人間のマネージャー」案を採用。

- `onecarat-office-source.png`: 会話中の組込みimage_genで生成し、作者が選択した原画像。緑のネクタイ、金色のダイヤ、淡いセージ色の角丸背景。既存ブランドとの重複調査は未実施。
- `onecarat-office.ico`: 原画像のデザインを変更せず、16/20/24/32/40/48/64/128/256pxのPNGフレームを格納したWindows用アイコン。
- `preview-*.png`: 各サイズの確認画像。

再生成：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-icon.ps1`。System.Drawingによるサイズ変換とICO形式への格納のみ。API呼出しや課金操作はない。

ビルド時に `/win32icon` でEXEへ格納し、マネージドリソース `Onecarat.Office.ico` も埋め込む。フォームは同リソースを読み込むため、実行時の外部ICOファイルは不要。

検証：ビルド成功、製品EXEを合成ログで起動し、タイトルバーの画像で確認。EXEから関連付けアイコンを抽出できることも確認。画像は `artifacts/icon/product-window.png` と `artifacts/icon/exe-associated-icon.png`。通常デスクトップ上のタスクバー表示は利用者の再起動後の確認対象。
