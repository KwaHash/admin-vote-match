/**
 * 【公開質問ボード 共通スキーマ】3アプリ同一（国民/運営/政治家）
 *
 * docs/データ構造_公開質問ボード_共通仕様.md の正準データ構造に準拠。
 * この1ファイルを3リポジトリで同一内容にして、質問ID・選挙ID・候補者ID・ステータスを揃える。
 *  - DB(snake_case) ⇄ プロトTS(camelCase) の対応は仕様書 §5。
 */

// 重視テーマ（theme_key ⇄ 表示名）
export interface Theme { key: string; name: string }
export const THEMES: Theme[] = [
  { key: 'kosodate', name: '子育て・教育' },
  { key: 'bosai', name: '防災・安全' },
  { key: 'zaisei', name: '財政・税金' },
  { key: 'dx', name: '行政改革・DX' },
  { key: 'fukushi', name: '福祉・高齢者' },
  { key: 'machi', name: 'まちづくり・交通' },
  { key: 'clean', name: '透明性・政治姿勢' },
]
export const themeName = (key: string) => THEMES.find((t) => t.key === key)?.name ?? key
export const themeKeyByName = (name: string) => THEMES.find((t) => t.name === name)?.key ?? name

// 質問ステータス（順序あり。is_top は status から導出）
export type QuestionStatus = '運営確認中' | '公開中' | '上位質問入り' | '候補者へ送付済み' | '回答受付中' | '回答公開中' | '非公開'
export const QUESTION_STATUS_FLOW: QuestionStatus[] = ['運営確認中', '公開中', '上位質問入り', '候補者へ送付済み', '回答受付中', '回答公開中']
export const QUESTION_STATUSES: QuestionStatus[] = [...QUESTION_STATUS_FLOW, '非公開']
export const isTop = (s: QuestionStatus) => s !== '非公開' && QUESTION_STATUS_FLOW.indexOf(s) >= QUESTION_STATUS_FLOW.indexOf('上位質問入り')
export const isPublicQ = (s: QuestionStatus) => s !== '運営確認中' && s !== '非公開'
export const Q_STATUS_COLOR: Record<QuestionStatus, string> = {
  運営確認中: 'bg-amber-50 text-amber-700',
  公開中: 'bg-emerald-50 text-emerald-700',
  上位質問入り: 'bg-blue-100 text-blue-700',
  候補者へ送付済み: 'bg-violet-50 text-violet-700',
  回答受付中: 'bg-indigo-50 text-indigo-700',
  回答公開中: 'bg-slate-800 text-white',
  非公開: 'bg-gray-200 text-gray-500',
}

// 回答ステータス（候補者編集 → 運営承認 → 公開）。国民側の表示は answerPublicLabel で解決
export type AnswerStatus = '未回答' | '下書き' | '提出済み（運営確認中）' | '回答済み（公開）' | '回答辞退' | '対象外'
export const answerPublicLabel = (s: AnswerStatus): '回答済み' | '未回答' | '回答辞退' | '対象外' =>
  s === '回答済み（公開）' ? '回答済み' : s === '回答辞退' ? '回答辞退' : s === '対象外' ? '対象外' : '未回答'
// 候補者が自分で設定できるステータス（運営承認の手前まで）
export const CANDIDATE_EDITABLE_STATUS: AnswerStatus[] = ['未回答', '下書き', '提出済み（運営確認中）', '回答辞退']
// 運営が回答管理でセットできるステータス（クリック巡回用）
export const ADMIN_ANSWER_CYCLE: AnswerStatus[] = ['未回答', '回答済み（公開）', '回答辞退', '対象外']

// ── 正準レコード ──
export interface CandidateAnswer {
  candidateId: string   // candidates.id（プロトは候補者名を代用可）
  candidateName: string // 表示名（本番は candidates.name を join）
  status: AnswerStatus
  answerText?: string
  sourceUrl?: string
  attachmentUrl?: string
  answeredAt?: string
  reviewedByAdmin?: boolean
}
export interface PublicQuestion {
  id: string            // public_questions.id（3アプリ同一値）
  electionId: string    // elections.id
  electionName: string  // 表示名（本番は elections.name を join）
  themeKey: string      // THEMES.key
  title: string
  body: string
  nickname?: string
  voteCount: number     // 実体は public_question_votes（プロトは集計値）
  status: QuestionStatus
  mergedIntoQuestionId?: string
  createdAt: string
  answers?: CandidateAnswer[] // プロトは内包。本番は candidate_question_answers に正規化
}
