# admin-vote-match（admin.seijiselect.jp 運営管理）

seijiselect.jp プラットフォームの **運営管理画面のプロトタイプ**（新規リポジトリ）。
国民 / 政治家 / 支援者 の3サイトとは別に、運営側が審査・承認・コンプラ・管理を行います。

## 位置づけ
- これは「動く仕様書」（プロトタイプ）です。データはサンプル、操作は画面内state のみ。
- Next.js 14 / TypeScript / Tailwind（他リポジトリと同じ構成を流用）。
- 本番は管理API＋権限（admin / auditor / legal_reviewer）で実装し直してください。

## 構成（凝縮1画面）
構想の admin 14機能を 概要＋4タブ に凝縮（`app/page.tsx`）:
- **概要**: 審査待ち / 承認待ち支出 / コンプラ要確認 / 処理済み
- **審査キュー**: 候補者審査・クラウドファンディング審査
- **寄付・支出承認**: 証憑確認・関連当事者フラグ・承認/差戻し
- **コンプラチェック**: 法務チェック / 関連当事者取引チェック / 不正検知
- **管理**: 政策テーマ管理 / ユーザー管理 / 会計CSV出力 / 公開・非公開制御

## 開発
```bash
npm install
npx next dev -p 3004   # 他のプロトタイプ(3001-3003)と別ポート
```

## GitHub リモートについて
本リポジトリは新規です。GitHub 側のリポジトリ（例: `KwaHash/admin-vote-match`）を作成後、
リモート登録してプッシュしてください:
```bash
git remote add origin https://github.com/KwaHash/admin-vote-match.git
git push -u origin prototype
```
