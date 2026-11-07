# Attendance（博多バレー 体育館割当・出欠）

毎週日曜の体育館割当と出欠を、スマホのブラウザから確認・入力できる Web アプリです。

- **画面**：このリポジトリの `docs/` を GitHub Pages で公開しています。
- **サーバー**：Google Apps Script（GAS）＋ スプレッドシート。権限の確認や保存はすべて GAS 側で行います。
- このリポジトリに公開しているのは画面（`docs/`）だけです。サーバーのソースや各種の認証情報は含みません。

## 構成

| ファイル | 役割 |
| --- | --- |
| `docs/index.html` | カレンダー・割振の画面本体 |
| `docs/assets/style.css` | スタイル |
| `docs/assets/app.js` | 画面の処理 |
| `docs/config.js` | GAS の公開 API（exec）URL |
| `docs/guide/user.html` | 使い方ガイド（メンバー向け） |
| `docs/guide/allocator.html` | 使い方ガイド（割当担当・チーム代表向け） |
