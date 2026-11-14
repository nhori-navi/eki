# 鉄道のひろがり

新橋開業（1872年）から現在まで、首都圏の鉄道が広がっていく様子を地図で見るアプリです。

公開先：https://nhori-navi.github.io/eki/

## 使っているデータ
- 駅（開業日・廃止日・隣の駅・路線・事業者）：[Wikidata](https://www.wikidata.org/)（CC0）。開いたときにブラウザから取得し、端末に保存します
- 背景地図・年代別の空中写真：[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）
- 地図ライブラリ：[Leaflet](https://leafletjs.com/)

## ファイル
- index.html：画面
- app.js：動き
- manifest.json / sw.js / icon-*.png：ホーム画面に追加して使うためのファイル（受け持ち範囲は /eki/ のみ、キャッシュ名は "eki" で始まるもののみ）
