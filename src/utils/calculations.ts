import type { Member, Transaction, DuesStatus, Expense } from '../types'

export function getYearMonth(date: string): string {
  return date.slice(0, 7)
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

export function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${year}년 ${parseInt(month)}월`
}

export function getMonthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  const start = new Date(from + '-01')
  const end = new Date(to + '-01')
  const cur = new Date(start)
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 7))
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

export function matchTransactionToMember(
  tx: Transaction,
  members: Member[]
): string | undefined {
  const name = tx.depositorName.trim()
  for (const m of members) {
    if (m.name === name) return m.id
    if (m.aliases.some((a) => a.trim() === name)) return m.id
  }
  return undefined
}

export function computeDuesStatuses(
  members: Member[],
  transactions: Transaction[],
  months: string[],
  manualOverrides: Record<string, 'paid' | 'unpaid'>
): DuesStatus[] {
  const statuses: DuesStatus[] = []

  // enrich transactions with memberId if not set
  const enriched = transactions.map((tx) => ({
    ...tx,
    memberId: tx.memberId ?? matchTransactionToMember(tx, members),
  }))

  for (const member of members) {
    if (!member.active) continue
    for (const ym of months) {
      const memberSince = member.joinDate <= ym
      if (!memberSince) continue

      const monthTxs = enriched.filter(
        (tx) =>
          tx.type === '입금' &&
          tx.memberId === member.id &&
          getYearMonth(tx.date) === ym
      )

      const paid = monthTxs.reduce((sum, tx) => sum + tx.amount, 0)
      const required = member.monthlyDues

      const overrideKey = `${member.id}:${ym}`
      const override = manualOverrides[overrideKey]

      let status: DuesStatus['status']
      if (override === 'paid') {
        status = 'paid'
      } else if (override === 'unpaid') {
        status = 'unpaid'
      } else if (paid >= required) {
        status = 'paid'
      } else if (paid > 0) {
        status = 'partial'
      } else {
        status = 'unpaid'
      }

      statuses.push({
        memberId: member.id,
        yearMonth: ym,
        required,
        paid,
        status,
        manualOverride: override,
        transactions: monthTxs,
      })
    }
  }

  return statuses
}

export function computeCurrentBalance(transactions: Transaction[]): number {
  if (transactions.length === 0) return 0
  const sorted = [...transactions].sort((a, b) => (a.date > b.date ? -1 : 1))
  return sorted[0].balance
}

export function computeLeaguePlan(
  leagueFee: number,
  reserveFund: number,
  targetDate: string,
  payingMembers: number,
  currentBalance: number
): {
  totalNeeded: number
  shortfall: number
  monthsLeft: number
  monthlyPerMember: number
} {
  const totalNeeded = leagueFee + reserveFund
  const shortfall = Math.max(0, totalNeeded - currentBalance)
  const today = new Date()
  const target = new Date(targetDate)
  const monthsLeft = Math.max(
    1,
    (target.getFullYear() - today.getFullYear()) * 12 +
      (target.getMonth() - today.getMonth())
  )
  const monthlyTotal = shortfall / monthsLeft
  const monthlyPerMember =
    payingMembers > 0 ? Math.ceil(monthlyTotal / payingMembers) : 0

  return { totalNeeded, shortfall, monthsLeft, monthlyPerMember }
}

export function getCollectionRate(statuses: DuesStatus[]): number {
  if (statuses.length === 0) return 0
  const paid = statuses.filter((s) => s.status === 'paid').length
  return Math.round((paid / statuses.length) * 100)
}

export function getTotalExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}
