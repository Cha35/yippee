import Papa from 'papaparse'
import type { Transaction } from '../types'

const DATE_KEYS = ['거래일시', '거래일', '날짜', '일시']
const TYPE_KEYS = ['거래구분', '구분', '입출금구분']
const AMOUNT_KEYS = ['거래금액', '금액', '입출금액']
const BALANCE_KEYS = ['잔액', '잔고']
const DESC_KEYS = ['내용', '적요', '거래내용']
const MEMO_KEYS = ['메모', '비고']
const DEPOSITOR_KEYS = ['보내는분', '입금자명', '입금자', '거래상대방', '상대방']

function findKey(row: Record<string, string>, candidates: string[]): string {
  for (const key of candidates) {
    if (key in row) return key
  }
  const rowKeys = Object.keys(row)
  for (const candidate of candidates) {
    const found = rowKeys.find((k) => k.includes(candidate) || candidate.includes(k))
    if (found) return found
  }
  return ''
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  return parseInt(raw.replace(/[^0-9-]/g, ''), 10) || 0
}

function parseDate(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.trim().replace(/\s.*$/, '')
  const normalized = cleaned.replace(/[./]/g, '-')
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`
  }
  return normalized
}

function detectType(raw: string, amount: number): '입금' | '출금' {
  if (!raw) return amount >= 0 ? '입금' : '출금'
  if (raw.includes('입금') || raw.includes('수신') || raw === '+') return '입금'
  if (raw.includes('출금') || raw.includes('지급') || raw === '-') return '출금'
  return amount >= 0 ? '입금' : '출금'
}

export interface ParseResult {
  transactions: Transaction[]
  errors: string[]
}

export function parseKakaoBankCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        const errors: string[] = []
        const transactions: Transaction[] = []

        if (!results.data || results.data.length === 0) {
          resolve({ transactions: [], errors: ['CSV 데이터가 없습니다.'] })
          return
        }

        const sample = results.data[0] as Record<string, string>
        const dateKey = findKey(sample, DATE_KEYS)
        const typeKey = findKey(sample, TYPE_KEYS)
        const amountKey = findKey(sample, AMOUNT_KEYS)
        const balanceKey = findKey(sample, BALANCE_KEYS)
        const descKey = findKey(sample, DESC_KEYS)
        const memoKey = findKey(sample, MEMO_KEYS)
        const depositorKey = findKey(sample, DEPOSITOR_KEYS)

        if (!dateKey || !amountKey) {
          errors.push(`CSV 형식을 인식하지 못했습니다. 컬럼: ${Object.keys(sample).join(', ')}`)
          resolve({ transactions: [], errors })
          return
        }

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i] as Record<string, string>
          const rawDate = row[dateKey] || ''
          const rawAmount = row[amountKey] || '0'
          const rawType = typeKey ? row[typeKey] || '' : ''
          const rawBalance = balanceKey ? row[balanceKey] || '0' : '0'
          const desc = descKey ? row[descKey] || '' : ''
          const memo = memoKey ? row[memoKey] || '' : ''
          const depositor = depositorKey ? row[depositorKey] || '' : ''

          const date = parseDate(rawDate)
          if (!date) {
            errors.push(`행 ${i + 2}: 날짜 파싱 실패 (${rawDate})`)
            continue
          }

          const amount = Math.abs(parseAmount(rawAmount))
          const balance = parseAmount(rawBalance)
          const type = detectType(rawType, parseAmount(rawAmount))

          transactions.push({
            id: `tx-${Date.now()}-${i}`,
            date,
            type,
            amount,
            balance,
            description: desc,
            memo: memo || undefined,
            depositorName: depositor || desc,
            isManualEntry: false,
          })
        }

        resolve({ transactions, errors })
      },
      error: (err) => {
        resolve({ transactions: [], errors: [`파싱 오류: ${err.message}`] })
      },
    })
  })
}
