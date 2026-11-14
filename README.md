# 鉄道のひろがり

新橋開業（1872年）から現在まで、首都圏の鉄道が広がっていく様子を地図で見るアプリです。

公開先：https://nhori-navi.github.io/eki/

## 使っているデータ
- 線路・駅：「[国土数値情報（鉄道時系列データ）](https://nlftp.mlit.go.jp/ksj/)」（国土交通省）を加工して作成（rails.json）。1950年より前に廃止された路線は含まれません。初代新橋駅（1872〜1914年）と新橋〜品川間の開業年は手で補っています
- 背景地図・年代別の空中写真：[地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（国土地理院）
- 地図ライブラリ：[Leaflet](https://leafletjs.com/)、地図の回転：[leaflet-rotate](https://github.com/Raruto/leaflet-rotate)、3D表示：[MapLibre GL JS](https://maplibre.org/)（乗車中の3Dのときだけ読み込み）
- 標高（3Dの地形）：地理院タイルの標高タイル（dem_png）

## ファイル
- index.html：画面
- app.js：動き
- rails.json：線路と駅のデータ（首都圏）
- tools/build_rails.py：国土数値情報のzipから rails.json を作るスクリプト（`python build_rails.py <UTF-8フォルダ>/ rails.json`、shapely が必要）
- manifest.json / sw.js / icon-*.png：ホーム画面に追加して使うためのファイル（受け持ち範囲は /eki/ のみ、キャッシュ名は "eki" で始まるもののみ）

## 版
いまは第9版。版ごとの変更点は、アプリの「⚙ 表示」→「この版について」で見られます。更新するときは app.js の APP_VER と HISTORY、index.html と app.js の `?v=番号`、sw.js の CACHE（eki-v番号）をそろえて上げます。
