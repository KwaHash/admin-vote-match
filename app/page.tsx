'use client'

/**
 * 【プロトタイプ】admin.seijiselect.jp 運営管理ダッシュボード（凝縮1画面）
 *
 * 構想の admin 14機能を、5タブ＋概要に凝縮:
 *   概要 / 審査キュー（候補者・クラファン審査）/ 選挙・候補者（CSV取込→審査→事前生成→公開）/
 *   寄付・支出承認（国籍確認・証憑・関連当事者）/ コンプラチェック（外国人寄付検知・法務・関連当事者・不正検知）/
 *   管理（政策テーマ・ユーザー・会計CSV・公開制御）
 *
 * 注意: 動く仕様書（プロトタイプ）。データはサンプル、操作は画面内state。本番は管理API＋権限(admin/auditor/legal_reviewer)。
 */

import { useState } from 'react'

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

type Tab = 'review' | 'elections' | 'finance' | 'compliance' | 'manage'
type RosterStatus = 'imported' | 'reviewed' | 'generated' | 'published'
type Nationality = '確認済' | '未確認' | '外国籍疑い'

interface CandidateReview { id: number; name: string; party: string; type: string }
interface CampaignReview { id: number; title: string; candidate: string; goal: number }
interface ExpenseApproval { id: number; candidate: string; category: string; amount: number; receipt: boolean; related: boolean }
interface Flag { id: number; kind: string; subject: string; note: string; severity: '高' | '中' | '低' }
interface ElectionRoster { id: number; name: string; region: string; candidates: number; status: RosterStatus }
interface Donation { id: number; donor: string; amount: number; nationality: Nationality; method: string }

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('review')
  const [processed, setProcessed] = useState(0)

  const [candidates, setCandidates] = useState<CandidateReview[]>([
    { id: 1, name: '鈴木 美咲', party: '中道改革', type: '衆議院議員 / 新人' },
    { id: 2, name: '木村 彩', party: '中道改革', type: '都道府県議会議員 / 新人' },
    { id: 3, name: '加藤 真理', party: '無所属', type: '市区町村長 / 新人' },
  ])
  const [campaigns, setCampaigns] = useState<CampaignReview[]>([
    { id: 1, title: '東京都の避難所に蓄電池を整備', candidate: '田中 一郎', goal: 3000000 },
    { id: 2, title: '入札透明化の調査レポート作成', candidate: '木村 彩', goal: 800000 },
  ])
  const [expenses, setExpenses] = useState<ExpenseApproval[]>([
    { id: 1, candidate: '田中 一郎', category: '動画制作', amount: 220000, receipt: true, related: false },
    { id: 2, candidate: '佐藤 健太', category: '会場費', amount: 80000, receipt: true, related: true },
    { id: 3, candidate: '小林 誠', category: '広報費', amount: 150000, receipt: false, related: false },
  ])
  const [flags, setFlags] = useState<Flag[]>([
    { id: 1, kind: '外国人寄付検知', subject: '寄付 DON-2026-000051 / John Smith', note: '外国籍の可能性。政治資金規正法22条の5により受領禁止。承認せず返還を推奨。', severity: '高' },
    { id: 2, kind: '関連当事者取引', subject: '佐藤 健太 / 会場費', note: '支出先が親族の経営する会社の可能性', severity: '高' },
    { id: 3, kind: '法務チェック', subject: 'クラファン: 避難所蓄電池', note: '政治資金規正法の確認待ち', severity: '中' },
    { id: 4, kind: '不正検知', subject: '寄付 DON-2026-000042', note: '短時間に同一カードで多重寄付', severity: '中' },
  ])
  // 選挙・候補者ロスター（CSV取込→審査→比較文の事前生成→公開）。本番は elections / election_candidates / comparison_perspectives に対応
  const [rosters, setRosters] = useState<ElectionRoster[]>([
    { id: 1, name: '杉並区長選挙', region: '東京都杉並区', candidates: 4, status: 'imported' },
    { id: 2, name: '大阪府知事選挙', region: '大阪府', candidates: 3, status: 'generated' },
    { id: 3, name: '横浜市議会議員選挙', region: '神奈川県横浜市', candidates: 12, status: 'published' },
  ])
  const [importSeq, setImportSeq] = useState(0)
  // 寄付審査（国籍確認）。承認は「確認済」のみ。外国籍疑い＝受領禁止、未確認＝確認待ち
  const [donations, setDonations] = useState<Donation[]>([
    { id: 1, donor: '山田 太郎', amount: 30000, nationality: '確認済', method: 'クレジット' },
    { id: 2, donor: 'John Smith', amount: 50000, nationality: '外国籍疑い', method: '海外発行カード' },
    { id: 3, donor: '（匿名希望）', amount: 5000, nationality: '未確認', method: 'クレジット' },
  ])
  const [csvMsg, setCsvMsg] = useState('')
  const [aiOpen, setAiOpen] = useState(false)

  const POLICY_THEMES = ['防災・災害死ゼロ', '高齢者熱中症対策', '交通事故削減', '子育て・教育', '入札透明化', 'AI行政改革', '人権外交', 'エネルギー・蓄電池', '地方財政改革', '観光・温泉振興']

  const STATUS_FLOW: Record<RosterStatus, { label: string; color: string; next?: RosterStatus; nextLabel?: string }> = {
    imported: { label: '取込済', color: 'bg-gray-100 text-gray-600', next: 'reviewed', nextLabel: '内容を審査する' },
    reviewed: { label: '審査済', color: 'bg-blue-100 text-blue-700', next: 'generated', nextLabel: '比較文を事前生成' },
    generated: { label: '事前生成済', color: 'bg-violet-100 text-violet-700', next: 'published', nextLabel: '公開する' },
    published: { label: '公開中', color: 'bg-emerald-100 text-emerald-700' },
  }
  const advanceRoster = (id: number) => setRosters((p) => p.map((r) => (r.id === id && STATUS_FLOW[r.status].next ? { ...r, status: STATUS_FLOW[r.status].next! } : r)))
  const importCsv = () => { const n = importSeq + 1; setImportSeq(n); setRosters((p) => [{ id: 1000 + n, name: `新規取込 選挙 #${n}`, region: '（要設定）', candidates: 5, status: 'imported' }, ...p]); setCsvMsg(`（プロト）候補者CSVを取込みました（選挙 #${n}）`) }

  const tick = () => setProcessed((n) => n + 1)
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0)
  const natCls = (n: Nationality) => n === '確認済' ? 'bg-emerald-50 text-emerald-600' : n === '外国籍疑い' ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700'

  // AIアシスト: 現在の状態から優先対応・リスクを助言（プロトはルールベース。本番はLLM/異常検知）
  const aiAdvice = (() => {
    const tips: { icon: string; text: string; tone: 'risk' | 'info' }[] = []
    const foreignDon = donations.filter((d) => d.nationality === '外国籍疑い')
    if (foreignDon.length) tips.push({ icon: '🛑', text: `外国籍の疑いがある寄付が${foreignDon.length}件。政治資金規正法22条の5により受領禁止です。承認せず返還してください。`, tone: 'risk' })
    const unverified = donations.filter((d) => d.nationality === '未確認')
    if (unverified.length) tips.push({ icon: '🪪', text: `国籍未確認の寄付が${unverified.length}件。本人確認・国籍確認の完了まで承認できません。`, tone: 'risk' })
    const highFlags = flags.filter((f) => f.severity === '高')
    if (highFlags.length) tips.push({ icon: '⚠️', text: `重要度「高」のコンプラ項目が${highFlags.length}件。${highFlags[0].subject} を最優先で確認してください。`, tone: 'risk' })
    const readyToPublish = rosters.filter((r) => r.status === 'generated')
    if (readyToPublish.length) tips.push({ icon: '🗳️', text: `事前生成が完了し公開待ちの選挙が${readyToPublish.length}件。内容確認のうえ公開できます。`, tone: 'info' })
    const noReceipt = expenses.filter((e) => !e.receipt)
    if (noReceipt.length) tips.push({ icon: '🧾', text: `証憑なしの支出が${noReceipt.length}件。承認不可のため差戻しを推奨します。`, tone: 'risk' })
    const related = expenses.filter((e) => e.related)
    if (related.length) tips.push({ icon: '🔗', text: `関連当事者取引の支出が${related.length}件。コンプラ確認後に承認してください。`, tone: 'risk' })
    if (candidates.length + campaigns.length) tips.push({ icon: '📋', text: `審査待ちが${candidates.length + campaigns.length}件。候補者審査→クラファン審査の順での処理が効率的です。`, tone: 'info' })
    if (!tips.length) tips.push({ icon: '✅', text: '緊急の対応事項はありません。', tone: 'info' })
    return tips
  })()

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'review', label: '審査キュー', count: candidates.length + campaigns.length },
    { key: 'elections', label: '選挙・候補者', count: rosters.filter((r) => r.status !== 'published').length },
    { key: 'finance', label: '寄付・支出承認', count: expenses.length + donations.length },
    { key: 'compliance', label: 'コンプラチェック', count: flags.length },
    { key: 'manage', label: '管理', count: 0 },
  ]

  const sevCls = (s: string) => s === '高' ? 'bg-rose-100 text-rose-700' : s === '中' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
  const btnApprove = 'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700'
  const btnReject = 'rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50'
  const card = 'rounded-xl border border-gray-200 bg-white p-4'

  return (
    <div className='mx-auto w-full max-w-4xl px-4 py-8'>
      <h1 className='text-2xl font-bold text-gray-900'>運営ダッシュボード</h1>
      <p className='mt-1 text-sm text-gray-500'>候補者・クラファン審査、寄付・支出承認、コンプラチェック、各種管理を行います。</p>

      {/* 概要 */}
      <div className='mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <div className={card}><p className='text-xs text-gray-500'>審査待ち</p><p className='mt-1 text-lg font-bold text-gray-900'>{candidates.length + campaigns.length}件</p></div>
        <div className={card}><p className='text-xs text-gray-500'>承認待ち支出</p><p className='mt-1 text-lg font-bold text-amber-600'>{yen(expenseTotal)}</p></div>
        <div className={card}><p className='text-xs text-gray-500'>コンプラ要確認</p><p className='mt-1 text-lg font-bold text-rose-600'>{flags.length}件</p></div>
        <div className={card}><p className='text-xs text-gray-500'>処理済み（本日）</p><p className='mt-1 text-lg font-bold text-emerald-600'>{processed}件</p></div>
      </div>

      {/* AIアシスト */}
      <div className='mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <span className='text-lg'>🤖</span>
            <span className='text-sm font-bold text-indigo-900'>AIアシスト</span>
            <span className='rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700'>運営サポート</span>
          </div>
          <button onClick={() => setAiOpen((v) => !v)} className='text-xs font-medium text-indigo-600 hover:text-indigo-800'>
            {aiOpen ? '閉じる' : '今日の優先対応を見る'}
          </button>
        </div>
        {aiOpen && (
          <div className='mt-3 space-y-2'>
            {aiAdvice.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-lg p-2.5 text-sm ${a.tone === 'risk' ? 'bg-rose-50 text-rose-800' : 'bg-white text-gray-700'}`}>
                <span className='shrink-0'>{a.icon}</span>
                <span>{a.text}</span>
              </div>
            ))}
            <p className='text-[11px] text-indigo-400'>※ プロトはルールベースの助言。本番はLLM＋異常検知で要約・対応提案・下書き生成を行う。</p>
          </div>
        )}
      </div>

      {/* タブ */}
      <div className='mt-6 flex flex-wrap gap-2 border-b border-gray-200'>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`relative px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}{t.count > 0 && <span className='ml-1 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700'>{t.count}</span>}
            {tab === t.key && <span className='absolute inset-x-0 -bottom-px h-0.5 bg-slate-900' />}
          </button>
        ))}
      </div>

      <div className='mt-5 space-y-3'>
        {/* 審査キュー */}
        {tab === 'review' && (
          <>
            <h2 className='text-xs font-bold uppercase tracking-wide text-gray-400'>候補者審査</h2>
            {candidates.map((c) => (
              <div key={c.id} className={`${card} flex items-center gap-3`}>
                <div className='min-w-0 flex-1'><p className='text-sm font-semibold text-gray-900'>{c.name}<span className='ml-2 text-xs text-gray-400'>{c.party}</span></p><p className='text-xs text-gray-400'>{c.type}</p></div>
                <button className={btnApprove} onClick={() => { setCandidates((p) => p.filter((x) => x.id !== c.id)); tick() }}>承認</button>
                <button className={btnReject} onClick={() => { setCandidates((p) => p.filter((x) => x.id !== c.id)); tick() }}>却下</button>
              </div>
            ))}
            {candidates.length === 0 && <p className='text-sm text-gray-400'>候補者審査の待ちはありません。</p>}
            <h2 className='mt-4 text-xs font-bold uppercase tracking-wide text-gray-400'>クラウドファンディング審査</h2>
            {campaigns.map((c) => (
              <div key={c.id} className={`${card} flex items-center gap-3`}>
                <div className='min-w-0 flex-1'><p className='text-sm font-semibold text-gray-900'>{c.title}</p><p className='text-xs text-gray-400'>{c.candidate} · 目標 {yen(c.goal)}</p></div>
                <button className={btnApprove} onClick={() => { setCampaigns((p) => p.filter((x) => x.id !== c.id)); tick() }}>承認</button>
                <button className={btnReject} onClick={() => { setCampaigns((p) => p.filter((x) => x.id !== c.id)); tick() }}>却下</button>
              </div>
            ))}
            {campaigns.length === 0 && <p className='text-sm text-gray-400'>クラファン審査の待ちはありません。</p>}
          </>
        )}

        {/* 選挙・候補者（CSV取込→審査→事前生成→公開） */}
        {tab === 'elections' && (
          <>
            <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <h3 className='text-sm font-bold text-gray-900'>候補者ロスターの取込</h3>
                <p className='text-xs text-gray-400'>選挙ごとの候補者CSVを取込み、審査→比較文の事前生成→公開まで運営側で管理します。</p>
              </div>
              <button className='rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700' onClick={importCsv}>候補者CSVを取込む</button>
            </div>
            {csvMsg && <p className='text-xs text-emerald-600'>{csvMsg}</p>}

            {/* 進行状況の凡例 */}
            <div className='flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400'>
              <span>取込済</span><span>→</span><span>審査済</span><span>→</span><span>事前生成済</span><span>→</span><span>公開中</span>
            </div>

            {rosters.map((r) => {
              const flow = STATUS_FLOW[r.status]
              return (
                <div key={r.id} className={`${card} flex flex-wrap items-center gap-3`}>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-semibold text-gray-900'>{r.name}<span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${flow.color}`}>{flow.label}</span></p>
                    <p className='text-xs text-gray-400'>{r.region} · 候補者 {r.candidates}名</p>
                  </div>
                  {flow.next
                    ? <button className={btnApprove} onClick={() => { advanceRoster(r.id); tick() }}>{flow.nextLabel}</button>
                    : <span className='text-xs font-medium text-emerald-600'>公開中（国民側に表示）</span>}
                </div>
              )
            })}
            <p className='text-[11px] text-gray-400'>※「比較文を事前生成」は、観点別の比較文を<strong>取込時に一度だけ生成して保存</strong>する工程（本番は comparison_perspectives）。国民側の表示はこの保存データを読むだけで、毎回AI APIを呼びません。公開後は国民側「選挙で選ぶ」に反映されます。</p>
          </>
        )}

        {/* 寄付・支出承認 */}
        {tab === 'finance' && (
          <>
            <h2 className='text-xs font-bold uppercase tracking-wide text-gray-400'>寄付審査（国籍確認）</h2>
            {donations.map((d) => (
              <div key={d.id} className={`${card} flex flex-wrap items-center gap-3`}>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold text-gray-900'>{d.donor}<span className='ml-2 text-sm text-gray-700'>{yen(d.amount)}</span></p>
                  <p className='mt-0.5 flex flex-wrap gap-1.5 text-xs text-gray-400'>
                    {d.method}
                    <span className={`rounded px-1.5 ${natCls(d.nationality)}`}>国籍：{d.nationality}</span>
                    {d.nationality === '外国籍疑い' && <span className='rounded bg-rose-100 px-1.5 font-medium text-rose-700'>受領禁止（政資法22の5）</span>}
                  </p>
                </div>
                {d.nationality === '確認済'
                  ? <button className={btnApprove} onClick={() => { setDonations((p) => p.filter((x) => x.id !== d.id)); tick() }}>受領承認</button>
                  : <button className={btnReject} onClick={() => { setDonations((p) => p.filter((x) => x.id !== d.id)); tick() }}>{d.nationality === '外国籍疑い' ? '返還' : '国籍確認を要求'}</button>}
              </div>
            ))}
            {donations.length === 0 && <p className='text-sm text-gray-400'>審査待ちの寄付はありません。</p>}
            <p className='text-[11px] text-gray-400'>※ 受領承認は<strong>国籍「確認済」のみ</strong>。外国籍・外国法人からの寄付は受領禁止（返還）。匿名・国籍未確認は本人確認完了まで承認不可。</p>

            <h2 className='mt-4 text-xs font-bold uppercase tracking-wide text-gray-400'>支出承認</h2>
            {expenses.map((e) => (
              <div key={e.id} className={`${card} flex items-center gap-3`}>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold text-gray-900'>{e.category}<span className='ml-2 text-sm text-gray-700'>{yen(e.amount)}</span></p>
                  <p className='mt-0.5 flex flex-wrap gap-1.5 text-xs text-gray-400'>
                    {e.candidate}
                    <span className={`rounded px-1.5 ${e.receipt ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{e.receipt ? '証憑あり' : '証憑なし'}</span>
                    {e.related && <span className='rounded bg-amber-100 px-1.5 text-amber-700'>関連当事者</span>}
                  </p>
                </div>
                <button className={btnApprove} onClick={() => { setExpenses((p) => p.filter((x) => x.id !== e.id)); tick() }} disabled={!e.receipt}>承認</button>
                <button className={btnReject} onClick={() => { setExpenses((p) => p.filter((x) => x.id !== e.id)); tick() }}>差戻し</button>
              </div>
            ))}
            {expenses.length === 0 && <p className='text-sm text-gray-400'>承認待ちの支出はありません。</p>}
            <p className='text-[11px] text-gray-400'>※ 証憑なしは承認不可（差戻しのみ）。関連当事者取引はコンプラ確認が必要。</p>
          </>
        )}

        {/* コンプラチェック */}
        {tab === 'compliance' && (
          <>
            {flags.map((f) => (
              <div key={f.id} className={`${card} flex items-start gap-3`}>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevCls(f.severity)}`}>{f.severity}</span>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm font-semibold text-gray-900'>{f.kind}</p>
                  <p className='text-xs text-gray-500'>{f.subject}</p>
                  <p className='mt-0.5 text-xs text-gray-400'>{f.note}</p>
                </div>
                <button className={btnReject} onClick={() => { setFlags((p) => p.filter((x) => x.id !== f.id)); tick() }}>確認済み</button>
              </div>
            ))}
            {flags.length === 0 && <p className='text-sm text-gray-400'>要確認のコンプラ項目はありません。</p>}
            <p className='text-[11px] text-gray-400'>※ 法務チェック / 関連当事者取引チェック / 不正検知。本番は legal_reviewer 権限で対応。</p>
          </>
        )}

        {/* 管理 */}
        {tab === 'manage' && (
          <>
            <div className={card}>
              <h3 className='mb-2 text-sm font-bold text-gray-900'>政策テーマ管理</h3>
              <div className='flex flex-wrap gap-1.5'>
                {POLICY_THEMES.map((t) => (<span key={t} className='rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700'>{t}</span>))}
              </div>
              <p className='mt-2 text-[11px] text-gray-400'>公開中 {POLICY_THEMES.length} テーマ（公開/非公開の制御は本番で）。</p>
            </div>
            <div className={`${card} flex items-center justify-between`}>
              <div><h3 className='text-sm font-bold text-gray-900'>ユーザー管理</h3><p className='text-xs text-gray-400'>国民 / 支援者 / 候補者 / スタッフ / 監査 / 法務</p></div>
              <span className='text-sm font-bold text-gray-900'>1,284名</span>
            </div>
            <div className={`${card} flex items-center justify-between`}>
              <div><h3 className='text-sm font-bold text-gray-900'>会計CSV出力</h3><p className='text-xs text-gray-400'>収支報告用データを書き出し</p></div>
              <button className='rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700' onClick={() => setCsvMsg('（プロト）会計CSVを書き出しました')}>CSV出力</button>
            </div>
            {csvMsg && <p className='text-center text-xs text-emerald-600'>{csvMsg}</p>}
          </>
        )}
      </div>

      <p className='mt-6 text-center text-xs text-gray-400'>
        ※ サンプルデータ・操作は画面内のみ。本番は管理API＋権限（admin / auditor / legal_reviewer）で実装。
      </p>
    </div>
  )
}
