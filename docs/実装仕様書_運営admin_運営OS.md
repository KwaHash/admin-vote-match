# 実装仕様書（運営 admin.seijiselect.jp / 運営OS）

完成済みプロトタイプ（単一画面 `app/page.tsx`）を流用して本実装するための仕様書です。
**運営OS＝統合キュー型ダッシュボード**。AIとルールエンジンで通常処理を自動分類し、**人は例外・高リスク・要判断だけ**を確認する。

- 対象リポジトリ: `admin-vote-match`（**GitHubリポジトリ未作成。作成依頼は `docs/リポジトリ作成依頼.md`**）
- ベース: ブランチ `prototype`
- 関連: 公開質問ボードの正準データ構造=`docs/データ構造_公開質問ボード_共通仕様.md`

---

## 1. 最重要方針
- **AIは最終承認者ではない**。要約・リスク分類・対応案・差戻し/返還文の作成を担当。**最終承認は権限を持つ管理者または法務確認者**。
- 寄付/支出/候補者/クラファン/選挙公開/支援リソース/レポート/質問を**統合キュー**で管理。
- 低リスク=自動承認候補、中リスク=差戻し/要確認、高リスク=法務確認 へルールエンジンが振り分け。
- **すべての判断は監査ログ**に残す。公開データと内部データを分離し、公開前にPIIをマスキング。
- 政治資金・選挙・寄付に関わる判断をAIが自動確定しない。

## 2. 画面構成（12メニュー＋KPI＋AIアシスト）
KPI（9）: 緊急対応 / 高リスク / 法務確認待ち / 返還候補 / 公開待ち / 自動処理済み / 本日処理率 / 平均処理時間 / SLA超過。

| メニュー | 内容 |
|---|---|
| 今日の要対応 | 統合キュー（リスク・SLA順）。低リスク一括承認 |
| 候補者・政治団体審査 | 本人/実在確認・欠格事由 |
| 政策応援・クラファン審査 | 趣旨/使途/法令適合 |
| 寄付・決済管理 | 寄付審査（国籍確認）＋支出承認（証憑・関連当事者） |
| 支出・証憑管理 | 証憑OCR・関連当事者取引 |
| コンプライアンスセンター | 外国人寄付/上限/多重/関連当事者/PII を横断 |
| 選挙ページ生成管理 | 候補者CSV取込→審査→**AI比較文の事前生成**→公開 |
| 国・地域の課題管理 | 課題・政策提言の登録→**ファネル段階更新**→公開（国民側kpiへ） |
| 公開質問ボード管理 | 質問の公開/上位選定/類似統合/送付文/候補者回答管理（§5） |
| 支援リソース管理 | 支援者の本人/法人/国籍確認・公開範囲 |
| 透明化レポート管理 | レポート生成・**公開前プレビュー＋PIIマスキング** |
| 監査ログ / ルール設定 | 全操作の記録／ルールの有効無効＋変更履歴 |

## 3. リスクスコア＋ルールエンジン（7ルール）
外国人寄付検知（政資法22の5）／KYC・国籍確認／寄付上限／多重・同一カード/IP／支出証憑（OCR）／関連当事者取引／公開前PIIマスキング。
- ルールの有効/無効でスコア・推奨が即時変化（変更は履歴に記録）。
- tier: 低(<20)=自動承認候補 / 中(20-49)=差戻し・要確認 / 高(≥50)=法務確認・返還候補。

## 4. AIアシスト（補助・非承認）
- 各キュー項目に「要約・リスク分類・AI推奨・差戻し/返還文の生成」。**承認ボタンは人間のみ**。
- 本番はLLM要約＋異常検知＋（取込時の）AI比較文の事前生成。**公開ページではAPIを毎回呼ばない**。

## 5. 公開質問ボード管理（正準データ構造で3サイト共有）
- 詳細は `docs/データ構造_公開質問ボード_共通仕様.md`。`public_questions` / `public_question_votes` / `candidate_question_answers` を国民・政治家と共有。
- 機能: 公開/非公開・**上位質問選定（statusで導出・完全自動確定しない）**・類似統合（投票合算）・候補者送付文テンプレ・候補者回答管理（回答済み/未回答/辞退/対象外）・CSV出力。

## 6. Supabase テーブル（admin中心・MVP）
```sql
create table review_queue (              -- 統合キュー（候補者/団体/クラファン/寄付/支出/支援リソース/レポート）
  id bigint generated always as identity primary key,
  type text, title text, sub text, amount int,
  nationality text, kyc_done boolean, donation_ytd int, duplicate_signals text[],
  receipt boolean, related_party boolean, pii boolean,
  sla_hours_left int, status text, assigned_to uuid, updated_at timestamptz default now()
);
create table rules ( id text primary key, name text, description text, severity text, enabled boolean default true );
create table rule_changes ( id bigint generated always as identity primary key, rule_id text, change text, actor uuid, at timestamptz default now() );
create table audit_logs ( id bigint generated always as identity primary key, actor uuid, action text, target text, at timestamptz default now() );
create table issues (                    -- 国・地域の課題／政策提言（国民側 kpi）
  id bigint generated always as identity primary key,
  scope text, theme_key text, title text, proposal text, funnel_stage int,
  donation_goal int, youtube_id text, is_published boolean default false
);
-- 選挙・候補者ロスター、comparison_perspectives、public_questions 系は国民側仕様書と共有
```
- **権限ロール**: `admin`（全権）/ `auditor`（閲覧・監査）/ `legal_reviewer`（法務確認・高リスク承認）。RLS とロールで操作を制限。
- 監査ログは追記専用（改ざん防止）。

## 7. 連携（同一Supabase・運営adminが束ねる）
- 候補者ロスター取込・審査・公開／選挙ページ生成／AI比較文の事前生成 → 国民側「選挙で選ぶ」。
- 課題・政策提言の登録・段階更新・公開 → 国民側「国と地域の課題」。
- 質問の上位選定・送付・回答管理 → 国民側「公開質問ボード」＋政治家側「公開質問への回答」。
- 寄付・支出・候補者・支援リソースの審査 → 各サイトの公開可否。

## 8. 完了条件（MVP）
- [ ] 統合キューで今日の要対応が一目で分かる／9KPI表示
- [ ] リスクスコア＋ルールで低/中/高に自動分類、AIは承認しない
- [ ] 各操作（承認/差戻し/法務確認/返還/公開停止/保留/却下/AI文/メモ）が監査ログに残る
- [ ] 公開質問ボード（公開/上位/統合/送付/回答管理）が正準データで国民・政治家と一致
- [ ] 国・地域の課題のファネル段階更新・公開ができる
- [ ] 選挙ページ生成（取込→審査→事前生成→公開）ができる
- [ ] 公開前PIIマスキング・権限（admin/auditor/legal_reviewer）

## 9. 期間・前提
- 約1〜1.5ヶ月（プロト流用・Supabase・LLMはフェーズ2）。実AI・本人確認・決済・政府統計接続は別フェーズ＋リーガルレビュー。
