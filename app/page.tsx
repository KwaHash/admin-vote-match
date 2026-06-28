'use client'

/**
 * 【プロトタイプ】admin.seijiselect.jp 運営OS（統合キュー型ダッシュボード）
 *
 * 方針（ChatGPT再設計指示）:
 *  - AIは最終承認者ではない。要約・リスク分類・対応案・差戻し文/返還依頼文の作成を担当。
 *  - 寄付/支出/候補者/クラファン/選挙公開/支援リソース/レポートを「統合キュー」で管理。
 *  - 低リスク=自動承認候補、中リスク=差戻し/要確認、高リスク=法務確認 へルールエンジンが振り分け。
 *  - 最終承認は権限を持つ管理者または法務確認者。すべての判断は監査ログに残す。
 *  - 公開データと内部データを分離し、公開前にPIIをマスキング。
 *
 * 注意: 動く仕様書。データはサンプル、判定はルールベース（本番はLLM要約＋異常検知＋ルールエンジン＋権限/監査API）。
 */

import { useMemo, useState } from 'react'

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const DONOR_LIMIT = 1_500_000 // 個人寄付の年間上限（プロト用の目安値。本番は宛先種別ごとに設定）

type ItemType = 'candidate' | 'org' | 'crowdfunding' | 'donation' | 'expense' | 'resource' | 'report'
type Status = '自動承認可' | '要確認' | '法務確認' | '承認不可候補' | '返還候補' | '差戻し' | '保留' | '承認済み' | '却下済み'
type Nationality = '確認済' | '未確認' | '外国籍疑い'

interface QueueItem {
  id: number
  type: ItemType
  title: string
  sub: string
  amount?: number
  // ルール判定に使う属性
  nationality?: Nationality
  kycDone?: boolean
  donationYTD?: number
  duplicateSignals?: string[]
  receipt?: boolean
  relatedParty?: boolean
  pii?: boolean
  slaHoursLeft: number // 負=SLA超過
  status: Status
}
interface RosterItem { id: number; name: string; region: string; candidates: number; status: 'imported' | 'reviewed' | 'generated' | 'published' }
interface AuditEntry { id: number; time: string; actor: string; action: string; target: string }
interface Rule { id: string; name: string; desc: string; severity: '高' | '中'; enabled: boolean }

const TYPE_LABEL: Record<ItemType, string> = {
  candidate: '候補者審査', org: '政治団体審査', crowdfunding: 'クラファン審査',
  donation: '寄付・決済', expense: '支出・証憑', resource: '支援リソース', report: '透明化レポート',
}

const STATUS_COLOR: Record<Status, string> = {
  自動承認可: 'bg-emerald-50 text-emerald-700', 要確認: 'bg-amber-50 text-amber-700', 法務確認: 'bg-violet-50 text-violet-700',
  承認不可候補: 'bg-rose-50 text-rose-700', 返還候補: 'bg-rose-100 text-rose-700', 差戻し: 'bg-orange-50 text-orange-700',
  保留: 'bg-gray-100 text-gray-600', 承認済み: 'bg-slate-800 text-white', 却下済み: 'bg-gray-200 text-gray-600',
}

const INITIAL_RULES: Rule[] = [
  { id: 'R1', name: '外国人寄付検知', desc: '外国籍・外国法人等からの寄付を検知（政治資金規正法22条の5：受領禁止）', severity: '高', enabled: true },
  { id: 'R2', name: 'KYC・国籍確認', desc: '本人確認/国籍確認が未完了の寄付を要確認に振り分け', severity: '中', enabled: true },
  { id: 'R3', name: '寄付上限チェック', desc: `年間寄付額が上限（目安 ${yen(DONOR_LIMIT)}）を超える懸念を検知`, severity: '高', enabled: true },
  { id: 'R4', name: '多重寄付・同一カード/IP検知', desc: '短時間の多重寄付、同一カード・同一IPからの寄付を検知', severity: '中', enabled: true },
  { id: 'R5', name: '支出証憑チェック（OCR）', desc: '証憑（領収書）未添付の支出を差戻し候補に', severity: '中', enabled: true },
  { id: 'R6', name: '関連当事者取引チェック', desc: '支出先が親族・関係会社等の利益相反の可能性を検知', severity: '高', enabled: true },
  { id: 'R7', name: '公開前PIIマスキング', desc: '選挙ページ・レポート・支援リソースの公開前に個人情報のマスキングを要求', severity: '中', enabled: true },
]

export default function AdminOS() {
  const [tab, setTab] = useState<string>('today')
  const [selected, setSelected] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [memoDraft, setMemoDraft] = useState('')
  const [processedAuto, setProcessedAuto] = useState(0)
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES)
  const [ruleHistory, setRuleHistory] = useState<{ id: number; time: string; text: string }[]>([])
  const [maskPreview, setMaskPreview] = useState(true)
  const [audit, setAudit] = useState<AuditEntry[]>([])

  const [items, setItems] = useState<QueueItem[]>([
    { id: 1, type: 'donation', title: 'John Smith', sub: '海外発行カード', amount: 50000, nationality: '外国籍疑い', kycDone: false, slaHoursLeft: -3, status: '返還候補' },
    { id: 2, type: 'donation', title: '大口 太郎', sub: 'クレジット', amount: 1800000, nationality: '確認済', kycDone: true, donationYTD: 1800000, slaHoursLeft: 4, status: '法務確認' },
    { id: 3, type: 'donation', title: '（匿名希望）', sub: 'クレジット', amount: 5000, nationality: '未確認', kycDone: false, slaHoursLeft: 10, status: '要確認' },
    { id: 4, type: 'donation', title: '田村 花子', sub: '同一カードで連続', amount: 20000, nationality: '確認済', kycDone: true, duplicateSignals: ['同一カード', '同一IP'], slaHoursLeft: 8, status: '要確認' },
    { id: 5, type: 'donation', title: '山田 太郎', sub: 'クレジット', amount: 30000, nationality: '確認済', kycDone: true, slaHoursLeft: 20, status: '自動承認可' },
    { id: 6, type: 'expense', title: '広報費（チラシ印刷）', sub: '田中 一郎 事務所', amount: 150000, receipt: false, slaHoursLeft: -1, status: '差戻し' },
    { id: 7, type: 'expense', title: '会場費', sub: '佐藤 健太 事務所', amount: 80000, receipt: true, relatedParty: true, slaHoursLeft: 5, status: '法務確認' },
    { id: 8, type: 'expense', title: '動画制作費', sub: '田中 一郎 事務所', amount: 220000, receipt: true, slaHoursLeft: 30, status: '自動承認可' },
    { id: 9, type: 'candidate', title: '鈴木 美咲', sub: '中道改革 / 衆議院議員 新人', kycDone: true, slaHoursLeft: 12, status: '要確認' },
    { id: 10, type: 'crowdfunding', title: '東京都の避難所に蓄電池を整備', sub: '田中 一郎 · 目標 ¥3,000,000', amount: 3000000, slaHoursLeft: 6, status: '法務確認' },
    { id: 11, type: 'resource', title: '会場提供（杉並・100名）', sub: '法人 / 国籍・属性 未確認', pii: true, slaHoursLeft: 18, status: '要確認' },
    { id: 12, type: 'report', title: '2026年6月 政策応援 収支レポート', sub: '寄付者名の公開前マスキング待ち', pii: true, slaHoursLeft: 2, status: '要確認' },
  ])

  const [rosters, setRosters] = useState<RosterItem[]>([
    { id: 1, name: '杉並区長選挙', region: '東京都杉並区', candidates: 4, status: 'imported' },
    { id: 2, name: '大阪府知事選挙', region: '大阪府', candidates: 3, status: 'generated' },
    { id: 3, name: '横浜市議会議員選挙', region: '神奈川県横浜市', candidates: 12, status: 'published' },
  ])
  const [importSeq, setImportSeq] = useState(0)

  const enabled = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.enabled])), [rules])

  // ── ルールエンジン（AIは承認しない。リスク分類と推奨のみ）──
  const evaluate = (it: QueueItem) => {
    const flags: { label: string; sev: '高' | '中'; note: string }[] = []
    let score = 0
    const add = (id: string, label: string, sev: '高' | '中', pts: number, note: string) => { if (enabled[id]) { flags.push({ label, sev, note }); score += pts } }
    if (it.type === 'donation') {
      if (it.nationality === '外国籍疑い') add('R1', '外国籍の疑い', '高', 60, '政治資金規正法22条の5により受領禁止。返還を推奨。')
      if (it.nationality === '未確認' || it.kycDone === false) add('R2', 'KYC/国籍 未確認', '中', 30, '本人確認・国籍確認の完了まで承認不可。')
      if ((it.donationYTD ?? 0) > DONOR_LIMIT) add('R3', '寄付上限の超過懸念', '高', 50, `年間上限（目安 ${yen(DONOR_LIMIT)}）の確認が必要。`)
      if (it.duplicateSignals?.length) add('R4', `重複検知（${it.duplicateSignals.join('・')}）`, '中', 25, '多重寄付・不正利用の可能性。')
    }
    if (it.type === 'expense') {
      if (it.receipt === false) add('R5', '証憑なし', '中', 30, '証憑（領収書）が未添付の支出。')
      if (it.relatedParty) add('R6', '関連当事者取引', '高', 40, '利益相反の確認が必要。')
    }
    if ((it.type === 'report' || it.type === 'resource') && it.pii) add('R7', 'PII未マスキング', '中', 20, '公開前に個人情報のマスキングが必要。')
    const tier: '高' | '中' | '低' = score >= 50 ? '高' : score >= 20 ? '中' : '低'
    let suggested: Status = '自動承認可'
    if (flags.some((f) => f.label.includes('外国籍'))) suggested = '返還候補'
    else if (flags.some((f) => f.sev === '高')) suggested = '法務確認'
    else if (it.type === 'expense' && it.receipt === false) suggested = '差戻し'
    else if (flags.length) suggested = '要確認'
    return { flags, score, tier, suggested }
  }

  const pending = (s: Status) => s !== '承認済み' && s !== '却下済み'
  const now = () => { try { return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) } catch { return '--:--' } }
  const log = (action: string, target: string) => setAudit((p) => [{ id: p.length + 1, time: now(), actor: '管理者（あなた）', action, target }, ...p])

  const setStatus = (id: number, status: Status, action: string) => {
    const it = items.find((x) => x.id === id)
    setItems((p) => p.map((x) => (x.id === id ? { ...x, status } : x)))
    if (it) log(action, `${TYPE_LABEL[it.type]}：${it.title}`)
  }

  const genDraft = (it: QueueItem) => {
    const ev = evaluate(it)
    let body: string
    if (ev.suggested === '返還候補' || it.nationality === '外国籍疑い') {
      body = `${it.title} 様\n\nこのたびはご寄付のお申し出をいただき、誠にありがとうございます。\n大変恐縮ですが、政治資金規正法第22条の5により、外国籍の方・外国法人等からのご寄付はお受けすることができません。\nいただいたご寄付（${it.amount ? yen(it.amount) : ''}）は返還の手続きをとらせていただきます。\n何卒ご理解賜りますようお願い申し上げます。\n\n— わたしの政治 運営事務局`
    } else if (it.type === 'expense' && it.receipt === false) {
      body = `${it.title} の支出申請について\n\n申請いただいた支出は、証憑（領収書等）の添付が確認できないため、差戻しとさせていただきます。\nお手数ですが、証憑を添付のうえ再申請をお願いいたします。\n\n— わたしの政治 運営事務局`
    } else if ((it.donationYTD ?? 0) > DONOR_LIMIT) {
      body = `${it.title} 様\n\nご寄付の累計額が年間上限の目安を超える可能性があるため、確認のうえご連絡いたします。\n上限超過分の取扱いについて、別途ご案内させていただく場合がございます。\n\n— わたしの政治 運営事務局`
    } else {
      body = `${it.title} について\n\n確認が必要な事項があるため、内容を保留・差戻しとさせていただきます。\n詳細は担当よりご連絡いたします。\n\n— わたしの政治 運営事務局`
    }
    setDrafts((p) => ({ ...p, [it.id]: body }))
    log('AI差戻し/返還文を作成', `${TYPE_LABEL[it.type]}：${it.title}`)
  }

  const addMemo = (it: QueueItem) => {
    if (!memoDraft.trim()) return
    log(`監査メモ：「${memoDraft.trim()}」`, `${TYPE_LABEL[it.type]}：${it.title}`)
    setMemoDraft('')
  }

  const bulkAutoApprove = () => {
    const targets = items.filter((i) => i.status === '自動承認可')
    if (!targets.length) return
    setItems((p) => p.map((x) => (x.status === '自動承認可' ? { ...x, status: '承認済み' } : x)))
    setProcessedAuto((n) => n + targets.length)
    log(`低リスク${targets.length}件を一括承認（人間確認）`, '自動承認候補')
  }

  const importCsv = () => { const n = importSeq + 1; setImportSeq(n); setRosters((p) => [{ id: 1000 + n, name: `新規取込 選挙 #${n}`, region: '（要設定）', candidates: 5, status: 'imported' }, ...p]); log('候補者CSVを取込', `選挙 #${n}`) }
  const ROSTER_FLOW: Record<RosterItem['status'], { label: string; color: string; next?: RosterItem['status']; nextLabel?: string }> = {
    imported: { label: '取込済', color: 'bg-gray-100 text-gray-600', next: 'reviewed', nextLabel: '内容を審査する' },
    reviewed: { label: '審査済', color: 'bg-blue-100 text-blue-700', next: 'generated', nextLabel: 'AI比較文を事前生成' },
    generated: { label: '事前生成済', color: 'bg-violet-100 text-violet-700', next: 'published', nextLabel: '公開する' },
    published: { label: '公開中', color: 'bg-emerald-100 text-emerald-700' },
  }
  const advanceRoster = (id: number) => { const r = rosters.find((x) => x.id === id); if (r && ROSTER_FLOW[r.status].next) { setRosters((p) => p.map((x) => (x.id === id ? { ...x, status: ROSTER_FLOW[x.status].next! } : x))); log(ROSTER_FLOW[r.status].nextLabel!, `選挙：${r.name}`) } }

  const toggleRule = (id: string) => setRules((p) => p.map((r) => { if (r.id === id) { const nx = !r.enabled; setRuleHistory((h) => [{ id: h.length + 1, time: now(), text: `ルール「${r.name}」を${nx ? '有効化' : '無効化'}` }, ...h]); return { ...r, enabled: nx } } return r }))

  // ── KPI ──
  const total = items.length
  const handled = items.filter((i) => ['承認済み', '却下済み', '法務確認', '返還候補', '差戻し', '保留'].includes(i.status)).length
  const kpis = [
    { label: '緊急対応', value: items.filter((i) => pending(i.status) && (evaluate(i).tier === '高' || i.slaHoursLeft < 0)).length, tone: 'rose' },
    { label: '高リスク', value: items.filter((i) => pending(i.status) && evaluate(i).tier === '高').length, tone: 'rose' },
    { label: '法務確認待ち', value: items.filter((i) => i.status === '法務確認').length, tone: 'violet' },
    { label: '返還候補', value: items.filter((i) => i.status === '返還候補').length, tone: 'rose' },
    { label: '公開待ち', value: rosters.filter((r) => r.status === 'generated').length + items.filter((i) => i.type === 'report' && pending(i.status)).length, tone: 'amber' },
    { label: '自動処理済み', value: processedAuto, tone: 'emerald' },
    { label: '本日処理率', value: `${total ? Math.round((handled / total) * 100) : 0}%`, tone: 'slate' },
    { label: '平均処理時間', value: '3.2分', tone: 'slate' },
    { label: 'SLA超過', value: items.filter((i) => pending(i.status) && i.slaHoursLeft < 0).length, tone: 'rose' },
  ]
  const toneCls: Record<string, string> = { rose: 'text-rose-600', violet: 'text-violet-600', amber: 'text-amber-600', emerald: 'text-emerald-600', slate: 'text-gray-900' }

  const MENU = [
    { key: 'today', label: '今日の要対応' },
    { key: 'candidates', label: '候補者・政治団体審査' },
    { key: 'crowdfunding', label: '政策応援・クラファン審査' },
    { key: 'donations', label: '寄付・決済管理' },
    { key: 'expenses', label: '支出・証憑管理' },
    { key: 'compliance', label: 'コンプライアンスセンター' },
    { key: 'elections', label: '選挙ページ生成管理' },
    { key: 'resources', label: '支援リソース管理' },
    { key: 'reports', label: '透明化レポート管理' },
    { key: 'audit', label: '監査ログ' },
    { key: 'rules', label: 'ルール設定' },
  ]

  const card = 'rounded-xl border border-gray-200 bg-white p-4'
  const tierCls = (t: string) => t === '高' ? 'bg-rose-100 text-rose-700' : t === '中' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  const actBtn = 'rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50'
  const actPrimary = 'rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700'

  // ── 1件のキューカード（共通） ──
  const ItemCard = ({ it }: { it: QueueItem }) => {
    const ev = evaluate(it)
    const open = selected === it.id
    return (
      <div className={card}>
        <button className='flex w-full items-start gap-3 text-left' onClick={() => setSelected(open ? null : it.id)}>
          <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tierCls(ev.tier)}`}>{ev.tier}</span>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold text-gray-900'>
              {it.title}{it.amount != null && <span className='ml-2 text-sm text-gray-700'>{yen(it.amount)}</span>}
              <span className='ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500'>{TYPE_LABEL[it.type]}</span>
            </p>
            <p className='mt-0.5 text-xs text-gray-400'>{it.sub}</p>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[it.status]}`}>{it.status}</span>
              {it.slaHoursLeft < 0 ? <span className='rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600'>SLA超過</span> : <span className='text-[10px] text-gray-400'>残り{it.slaHoursLeft}h</span>}
              {ev.flags.map((f) => <span key={f.label} className={`rounded px-1.5 py-0.5 text-[10px] ${f.sev === '高' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{f.label}</span>)}
            </div>
          </div>
          <span className='shrink-0 text-xs text-gray-300'>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className='mt-3 border-t border-gray-100 pt-3'>
            {/* AIアシスト（補助・承認しない） */}
            <div className='rounded-lg bg-indigo-50/60 p-3 text-xs text-indigo-900'>
              <p className='font-semibold'>🤖 AI要約・対応案<span className='ml-2 font-normal text-indigo-400'>※AIは承認しません。最終承認は管理者／法務確認者。</span></p>
              <p className='mt-1 text-indigo-800'>リスク {ev.tier}（スコア {ev.score}）。{ev.flags.map((f) => f.note).join(' ') || '特段のリスク検知はありません。'}</p>
              <p className='mt-1 text-indigo-800'><span className='font-medium'>AI推奨：</span>{ev.suggested}</p>
            </div>

            {/* 操作 */}
            <div className='mt-3 flex flex-wrap gap-1.5'>
              <button className={actPrimary} onClick={() => setStatus(it.id, '承認済み', '承認')}>承認</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '差戻し', '差戻し')}>差戻し</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '法務確認', '法務確認へ送る')}>法務確認へ送る</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '返還候補', '返還候補にする')}>返還候補にする</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '保留', '公開停止')}>公開停止</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '保留', '保留')}>保留</button>
              <button className={actBtn} onClick={() => setStatus(it.id, '却下済み', '却下')}>却下</button>
              <button className='rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700' onClick={() => genDraft(it)}>AI差戻し文を作成</button>
            </div>

            {drafts[it.id] && (
              <div className='mt-3'>
                <p className='mb-1 text-[11px] font-semibold text-gray-500'>AI生成 差戻し/返還文（送信前に必ず人が確認）</p>
                <textarea className='h-32 w-full rounded-lg border border-gray-300 p-2 text-xs' value={drafts[it.id]} onChange={(e) => setDrafts((p) => ({ ...p, [it.id]: e.target.value }))} />
              </div>
            )}

            <div className='mt-3 flex gap-2'>
              <input className='flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs' placeholder='監査メモを追加…' value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} />
              <button className={actBtn} onClick={() => addMemo(it)}>メモを追加</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const byTypes = (...ts: ItemType[]) => items.filter((i) => ts.includes(i.type))
  const todayQueue = [...items].filter((i) => pending(i.status)).sort((a, b) => (evaluate(b).score - evaluate(a).score) || (a.slaHoursLeft - b.slaHoursLeft))
  const autoCandidates = items.filter((i) => i.status === '自動承認可').length

  return (
    <div className='mx-auto w-full max-w-5xl px-4 py-8'>
      <h1 className='text-2xl font-bold text-gray-900'>運営OS — 統合キュー</h1>
      <p className='mt-1 text-sm text-gray-500'>AIとルールエンジンが通常処理を自動分類し、人は例外・高リスク・要判断だけを確認します。</p>

      {/* 方針バナー */}
      <div className='mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs leading-relaxed text-indigo-900'>
        <span className='font-semibold'>AIは最終承認しません。</span>{' '}
        AIは「要約・リスク分類・対応案・差戻し/返還文の作成」を担当し、<span className='font-semibold'>最終承認は権限を持つ管理者または法務確認者</span>が行います。政治資金・選挙・寄付に関わる判断をAIが自動確定することはありません。すべての操作は監査ログに記録されます。
      </div>

      {/* KPI（9指標） */}
      <div className='mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9'>
        {kpis.map((k) => (
          <div key={k.label} className='rounded-xl border border-gray-200 bg-white p-3 text-center'>
            <p className='text-[10px] leading-tight text-gray-500'>{k.label}</p>
            <p className={`mt-1 text-lg font-bold ${toneCls[k.tone]}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* メインメニュー（タブ） */}
      <div className='mt-6 flex flex-wrap gap-1.5 border-b border-gray-200 pb-2'>
        {MENU.map((m) => (
          <button key={m.key} onClick={() => { setTab(m.key); setSelected(null) }} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === m.key ? 'bg-slate-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{m.label}</button>
        ))}
      </div>

      <div className='mt-5 space-y-3'>
        {/* 今日の要対応 */}
        {tab === 'today' && (
          <>
            <div className='flex items-center justify-between'>
              <h2 className='text-sm font-bold text-gray-900'>今日の要対応（リスク・SLA順） <span className='text-xs font-normal text-gray-400'>{todayQueue.length}件</span></h2>
              <button className={actPrimary} onClick={bulkAutoApprove} disabled={!autoCandidates}>低リスク{autoCandidates}件を一括承認</button>
            </div>
            <p className='text-[11px] text-gray-400'>低リスク＝自動承認候補（人が一括確認）／中リスク＝差戻し・要確認／高リスク＝法務確認・返還候補。</p>
            {todayQueue.map((it) => <ItemCard key={it.id} it={it} />)}
            {todayQueue.length === 0 && <p className='text-sm text-gray-400'>未処理の対応はありません。</p>}
          </>
        )}

        {tab === 'candidates' && (<>{byTypes('candidate', 'org').map((it) => <ItemCard key={it.id} it={it} />)}<p className='text-[11px] text-gray-400'>※ 候補者・政治団体の本人/実在確認、被推薦要件、欠格事由の確認。最終承認は管理者。</p></>)}
        {tab === 'crowdfunding' && (<>{byTypes('crowdfunding').map((it) => <ItemCard key={it.id} it={it} />)}<p className='text-[11px] text-gray-400'>※ 政策応援・クラファンの趣旨/資金使途/法令適合の審査。寄付規制に関わるものは法務確認へ。</p></>)}
        {tab === 'donations' && (<>{byTypes('donation').map((it) => <ItemCard key={it.id} it={it} />)}<p className='text-[11px] text-gray-400'>※ 受領承認は国籍「確認済」かつ上限・重複の問題がないもののみ。外国籍疑い＝返還候補、未確認＝要確認。</p></>)}
        {tab === 'expenses' && (<>{byTypes('expense').map((it) => <ItemCard key={it.id} it={it} />)}<p className='text-[11px] text-gray-400'>※ 証憑なしは承認不可（差戻し）。関連当事者取引は法務確認へ。本番は証憑OCRで自動照合。</p></>)}

        {/* コンプライアンスセンター */}
        {tab === 'compliance' && (
          <>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              {[
                { l: 'KYC/国籍 未確認', v: items.filter((i) => i.type === 'donation' && (i.nationality === '未確認' || i.kycDone === false)).length },
                { l: '外国籍疑い', v: items.filter((i) => i.nationality === '外国籍疑い').length },
                { l: '上限超過懸念', v: items.filter((i) => (i.donationYTD ?? 0) > DONOR_LIMIT).length },
                { l: '関連当事者取引', v: items.filter((i) => i.relatedParty).length },
              ].map((s) => <div key={s.l} className='rounded-xl border border-gray-200 bg-white p-3 text-center'><p className='text-[10px] text-gray-500'>{s.l}</p><p className='mt-1 text-lg font-bold text-rose-600'>{s.v}</p></div>)}
            </div>
            <p className='mt-1 text-xs font-bold text-gray-500'>検知された要確認項目（リスク高い順）</p>
            {[...items].filter((i) => pending(i.status) && evaluate(i).flags.length).sort((a, b) => evaluate(b).score - evaluate(a).score).map((it) => <ItemCard key={it.id} it={it} />)}
            <p className='text-[11px] text-gray-400'>※ 外国人寄付（政資法22の5）・寄付上限・多重/同一カード/IP・関連当事者・公開前PIIを横断確認。高リスクは法務確認者（legal_reviewer）対応。</p>
          </>
        )}

        {/* 選挙ページ生成管理 */}
        {tab === 'elections' && (
          <>
            <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div><h3 className='text-sm font-bold text-gray-900'>候補者ロスターの取込 → 公開</h3><p className='text-xs text-gray-400'>取込 → 審査 → AI比較文の事前生成 → 公開。事前生成は取込時1回だけ保存し、国民側はAPIなしで表示。</p></div>
              <button className='rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700' onClick={importCsv}>候補者CSVを取込む</button>
            </div>
            <div className='flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400'><span>取込済</span><span>→</span><span>審査済</span><span>→</span><span>事前生成済</span><span>→</span><span>公開中</span></div>
            {rosters.map((r) => { const f = ROSTER_FLOW[r.status]; return (
              <div key={r.id} className={`${card} flex flex-wrap items-center gap-3`}>
                <div className='min-w-0 flex-1'><p className='text-sm font-semibold text-gray-900'>{r.name}<span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${f.color}`}>{f.label}</span></p><p className='text-xs text-gray-400'>{r.region} · 候補者 {r.candidates}名</p></div>
                {f.next ? <button className={actPrimary} onClick={() => advanceRoster(r.id)}>{f.nextLabel}</button> : <span className='text-xs font-medium text-emerald-600'>公開中（国民側に表示）</span>}
              </div>) })}
            <p className='text-[11px] text-gray-400'>※「AI比較文を事前生成」は観点別の比較文を取込時に一度だけ生成して保存（本番 comparison_perspectives）。公開後は国民側「選挙で選ぶ」に反映。</p>
          </>
        )}

        {tab === 'resources' && (<>{byTypes('resource').map((it) => <ItemCard key={it.id} it={it} />)}<p className='text-[11px] text-gray-400'>※ 支援リソースの本人/法人確認、国籍・属性、有償/無償区分、公開範囲を審査。公開前にPIIをマスキング。</p></>)}

        {/* 透明化レポート管理（公開前プレビュー＋マスキング） */}
        {tab === 'reports' && (
          <>
            <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div><h3 className='text-sm font-bold text-gray-900'>透明化レポート生成・公開前プレビュー</h3><p className='text-xs text-gray-400'>収支・活動報告を自動生成。公開前に個人情報をマスキングしてプレビュー。</p></div>
              <label className='flex items-center gap-2 text-xs text-gray-600'><input type='checkbox' checked={maskPreview} onChange={(e) => setMaskPreview(e.target.checked)} />個人情報をマスキング</label>
            </div>
            <div className={card}>
              <p className='mb-2 text-xs font-bold text-gray-500'>公開プレビュー（{maskPreview ? '内部データを分離・マスキング済み' : '⚠ 生データ表示中'}）</p>
              <table className='w-full text-xs'>
                <thead><tr className='text-left text-gray-400'><th className='py-1'>寄付者</th><th>金額</th><th>国籍確認</th></tr></thead>
                <tbody>
                  {items.filter((i) => i.type === 'donation').map((d) => (
                    <tr key={d.id} className='border-t border-gray-100'>
                      <td className='py-1'>{maskPreview ? `${(d.title[0] ?? '匿')}＊＊＊（${d.title.length}字）` : d.title}</td>
                      <td>{d.amount ? yen(d.amount) : '—'}</td>
                      <td>{d.nationality ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {byTypes('report').map((it) => <ItemCard key={it.id} it={it} />)}
            <p className='text-[11px] text-gray-400'>※ 公開データと内部データを分離。寄付者名等のPIIはマスキングしてから公開。少額・匿名希望の扱いは法令に従う。</p>
          </>
        )}

        {/* 監査ログ */}
        {tab === 'audit' && (
          <div className={card}>
            <h3 className='mb-2 text-sm font-bold text-gray-900'>監査ログ</h3>
            {audit.length === 0 && <p className='text-sm text-gray-400'>まだ操作履歴はありません。キューで操作するとここに記録されます。</p>}
            <ul className='space-y-1.5'>
              {audit.map((a) => (
                <li key={a.id} className='flex items-start gap-2 border-b border-gray-100 pb-1.5 text-xs'>
                  <span className='shrink-0 text-gray-400'>{a.time}</span>
                  <span className='shrink-0 font-medium text-gray-700'>{a.actor}</span>
                  <span className='text-gray-600'>{a.action}</span>
                  <span className='ml-auto shrink-0 text-gray-400'>{a.target}</span>
                </li>
              ))}
            </ul>
            <p className='mt-2 text-[11px] text-gray-400'>※ 本番は改ざん防止（追記専用）・権限（admin/auditor/legal_reviewer）・エクスポートに対応。</p>
          </div>
        )}

        {/* ルール設定 */}
        {tab === 'rules' && (
          <>
            {rules.map((r) => (
              <div key={r.id} className={`${card} flex items-start gap-3`}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tierCls(r.severity)}`}>{r.severity}</span>
                <div className='min-w-0 flex-1'><p className='text-sm font-semibold text-gray-900'>{r.name}</p><p className='text-xs text-gray-400'>{r.desc}</p></div>
                <button onClick={() => toggleRule(r.id)} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${r.enabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{r.enabled ? '有効' : '無効'}</button>
              </div>
            ))}
            <div className={card}>
              <h3 className='mb-2 text-xs font-bold text-gray-500'>ルール変更履歴</h3>
              {ruleHistory.length === 0 ? <p className='text-xs text-gray-400'>変更履歴はありません。</p> : (
                <ul className='space-y-1'>{ruleHistory.map((h) => <li key={h.id} className='flex gap-2 text-xs text-gray-600'><span className='text-gray-400'>{h.time}</span>{h.text}</li>)}</ul>
              )}
            </div>
            <p className='text-[11px] text-gray-400'>※ ルールの有効/無効はリスクスコアと推奨に即時反映。変更は履歴に記録（本番は承認フロー付き）。</p>
          </>
        )}
      </div>

      <p className='mt-6 text-center text-xs text-gray-400'>※ サンプルデータ・操作は画面内のみ。本番は管理API＋ルールエンジン＋LLM要約＋権限（admin / auditor / legal_reviewer）＋監査ログで実装。</p>
    </div>
  )
}
