import { blocks, prefectures } from '@/constants/areas'
import { IPolitician } from '@/types/politician'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const selectedDistrictDescription = (district: string) => {
  for (const prefecture of prefectures) {
    if (Array.isArray(prefecture.districts)) {
      const districtObj = prefecture.districts.find(d => d.label === district)
      if (districtObj) {
        return districtObj.value
      }
    }
  }
  return undefined
}

export const selectedProportionalDescription = (proportional: string) => {
  for (const block of blocks) {
    if (block.value === proportional) {
      return `定員${block.counts}人`
    }
  }
}

export function getAgeFromBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return '—'
  const [y, m, d] = birthDate.split('/').map(Number)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return '—'

  const birth = new Date(y, m - 1, d)
  if (Number.isNaN(birth.getTime()) || birth.getFullYear() !== y || birth.getMonth() !== m - 1 || birth.getDate() !== d) {
    return '—'
  }

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 ? `満${age}歳` : '—'
}

export function getWebsiteLinks(website: IPolitician['website']) {
  if (!website) return []
  if (Array.isArray(website)) return website
  try {
    const parsed = JSON.parse(website)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getQuestionAnswers(answers: IPolitician['questions_answers']) {
  if (!answers) return []
  if (Array.isArray(answers)) return answers
  try {
    const parsed = JSON.parse(answers)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const WEBSITE_LINK_LABELS = ['homepage', 'facebook', 'twitter', 'youtube', 'line', 'instagram', 'tiktok', 'linkedin'] as const

export function getWebsiteLinksByLabel(website: IPolitician['website']): Record<string, string> {
  const links = getWebsiteLinks(website)
  const byLabel: Record<string, string> = {}
  for (const key of WEBSITE_LINK_LABELS) {
    byLabel[key] = ''
  }
  for (const item of links) {
    const label = (item?.label ?? '').toString().toLowerCase().trim()
    const url = (item?.url ?? '').toString().trim()
    if (label && url && WEBSITE_LINK_LABELS.includes(label as (typeof WEBSITE_LINK_LABELS)[number])) {
      byLabel[label] = url
    }
  }
  return byLabel
}

const escapeCsvCell = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const LINK_HEADERS_JA: Record<string, string> = {
  homepage: 'ホームページ',
  facebook: 'Facebook',
  twitter: 'Twitter',
  youtube: 'YouTube',
  line: 'LINE',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

export const districtCandidatesToCsv = (politicians: IPolitician[]): string => {
  const linkHeaders = WEBSITE_LINK_LABELS.map((k) => LINK_HEADERS_JA[k] ?? k)
  const headers = ['結果', '氏名', 'ふりがな', '生年月日', '年齢', '政党', '選挙区', '獲得票', '前元新', '当選数', '比例', ...linkHeaders]
  const rows = politicians.map((p) => {
    const byLabel = getWebsiteLinksByLabel(p.website)
    const linkCells = WEBSITE_LINK_LABELS.map((key) => byLabel[key] ?? '')
    return [
      p.vote_result === 1 ? '当' : p.vote_result === 2 ? '比' : '',
      p.kanji_name,
      p.hiragana_name ?? '',
      p.birth_date ?? '',
      getAgeFromBirthDate(p.birth_date) ?? '',
      p.party ?? '',
      p.district ?? '',
      p.vote_count,
      p.shin ?? '',
      p.shu_count ?? '',
      p.proportional ?? '',
      ...linkCells
    ].map(escapeCsvCell).join(',')
  })
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
}

export const politiciansListToCsv = (politicians: IPolitician[]): string => {
  const linkHeaders = WEBSITE_LINK_LABELS.map((k) => LINK_HEADERS_JA[k] ?? k)
  const headers = ['氏名', 'ふりがな', '生年月日', '年齢', '政党', '前元新', '当選数', '比例', ...linkHeaders]
  const rows = politicians.map((p) => {
    const byLabel = getWebsiteLinksByLabel(p.website)
    const linkCells = WEBSITE_LINK_LABELS.map((key) => byLabel[key] ?? '')
    return [
      p.kanji_name,
      p.hiragana_name ?? '',
      p.birth_date ?? '',
      getAgeFromBirthDate(p.birth_date) ?? '',
      p.party ?? '',
      p.shin ?? '',
      `衆：${p.shu_count ?? ''}回、 参：${p.san_count ?? ''}回`,
      p.proportional ?? '',
      ...linkCells
    ].map(escapeCsvCell).join(',')
  })
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
}

export const proportionCandidatesToCsv = (politicians: IPolitician[]): string => {
  const linkHeaders = WEBSITE_LINK_LABELS.map((k) => LINK_HEADERS_JA[k] ?? k)
  const headers = ['結果', '名簿順位', '氏名', 'ふりがな', '生年月日', '年齢', '政党', '獲得票', '前元新', '当選数', '小選挙区', ...linkHeaders]
  const rows = politicians.map((p) => {
    const byLabel = getWebsiteLinksByLabel(p.website)
    const linkCells = WEBSITE_LINK_LABELS.map((key) => byLabel[key] ?? '')
    return [
      p.vote_result === 2 ? '当' : p.vote_result === 1 ? '小' : '',
      p.rank ?? '',
      p.kanji_name,
      p.hiragana_name ?? '',
      p.birth_date ?? '',
      getAgeFromBirthDate(p.birth_date) ?? '',
      p.party ?? '',
      p.vote_count ? p.vote_count.toLocaleString() : '',
      p.shin ?? '',
      p.shu_count ?? '',
      p.district ?? '',
      ...linkCells
    ].map(escapeCsvCell).join(',')
  })
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
}