import type { Member, Transaction, DuesStatus, Expense } from '../types'

export function getYearMonth(date: string): string {
  return date.slice(0, 7)
}

export function getYear(date: string): string {
  return date.slice(0, 4)
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

export function getAnnualDues(member: Member): number {
  return member.annualDues ?? member.monthlyDues * 12
}

// 특정 월에 적용되는 월회비 (면제/감면/특정월부터 변경 규칙 반영)
// 0 = 면제
export function effectiveMonthlyDues(member: Member, ym: string): number {
  const applicable = (member.duesRules ?? [])
    .filter((r) => r.fromMonth <= ym)
    .sort((a, b) => (a.fromMonth > b.fromMonth ? -1 : 1))
  if (applicable.length > 0) return applicable[0].monthlyDues
  return member.exempt ? 0 : member.monthlyDues
}

// 거래가 특정 월에 회비로 기여하는 금액
// duesAllocations가 있으면 거래일 기준 자동집계 대신 배분만 사용
export function duesContribution(tx: Transaction, ym: string): number {
  if (tx.duesAllocations && tx.duesAllocations.length > 0) {
    return tx.duesAllocations
      .filter((a) => a.yearMonth === ym)
      .reduce((s, a) => s + a.amount, 0)
  }
  return getYearMonth(tx.date) === ym ? tx.amount : 0
}

export function computeDuesStatuses(
  members: Member[],
  transactions: Transaction[],
  months: string[],
  manualOverrides: Record<string, 'paid' | 'unpaid'>,
  leagueFeeStartMonth?: string,
  monthlyLeagueFee?: number,
  duesStartMonth?: string
): DuesStatus[] {
  const statuses: DuesStatus[] = []

  const enriched = transactions.map((tx) => ({
    ...tx,
    memberId: tx.memberId ?? matchTransactionToMember(tx, members),
  }))

  // 리그비 추가 징수 여부 판단
  const hasLeagueFee = !!(leagueFeeStartMonth && monthlyLeagueFee && monthlyLeagueFee > 0)
  const isLeagueFeeMonth = (ym: string) =>
    hasLeagueFee && leagueFeeStartMonth! <= ym

  for (const member of members) {
    if (!member.active) continue

    if (member.paymentType === 'annual') {
      // 일시납: 연도별 기본 납입 계산
      const years = [...new Set(months.map((m) => m.slice(0, 4)))]
      for (const year of years) {
        const memberSince = member.joinDate.slice(0, 4) <= year
        if (!memberSince) continue

        const yearMonths = months.filter((m) => m.startsWith(year))

        // 연간 기본 납입 거래 (일시납 금액 이상인 큰 입금 or 연초 납입)
        // 리그비 시작월 이전 거래만 연간 납입으로 집계
        const annualCutoff = hasLeagueFee && leagueFeeStartMonth!.startsWith(year)
          ? leagueFeeStartMonth!
          : null
        const yearTxs = enriched.filter(
          (tx) =>
            tx.type === '입금' &&
            tx.memberId === member.id &&
            tx.date.startsWith(year) &&
            (annualCutoff === null || getYearMonth(tx.date) < annualCutoff)
        )
        const paid = yearTxs.reduce((sum, tx) => sum + tx.amount, 0)
        const required = getAnnualDues(member)
        const overrideKey = `${member.id}:${year}`
        const override = manualOverrides[overrideKey]

        const annualStatus: DuesStatus['status'] =
          override === 'paid'
            ? 'annual_paid'
            : override === 'unpaid'
            ? 'annual_unpaid'
            : paid >= required
            ? 'annual_paid'
            : 'annual_unpaid'

        for (const ym of yearMonths) {
          // 리그비 추가 기간: 해당 월 별도 거래 확인
          let leagueFeeRequired: number | undefined
          let leagueFeePaid: number | undefined
          let leagueFeeStatus: DuesStatus['leagueFeeStatus']

          if (isLeagueFeeMonth(ym)) {
            const leagueTxs = enriched.filter(
              (tx) =>
                tx.type === '입금' &&
                tx.memberId === member.id &&
                getYearMonth(tx.date) === ym
            )
            leagueFeeRequired = monthlyLeagueFee!
            leagueFeePaid = leagueTxs.reduce((sum, tx) => sum + tx.amount, 0)
            const lfOverride = manualOverrides[`${member.id}:${ym}:league`]
            leagueFeeStatus =
              lfOverride === 'paid'
                ? 'paid'
                : lfOverride === 'unpaid'
                ? 'unpaid'
                : leagueFeePaid >= leagueFeeRequired
                ? 'paid'
                : 'unpaid'
          }

          statuses.push({
            memberId: member.id,
            yearMonth: ym,
            required,
            paid,
            status: annualStatus,
            manualOverride: override,
            transactions: yearTxs,
            leagueFeeRequired,
            leagueFeePaid,
            leagueFeeStatus,
          })
        }
      }
    } else {
      // 월납
      for (const ym of months) {
        const memberSince = member.joinDate <= ym
        if (!memberSince) continue

        // 회비 기여 거래 (이관/분할 반영)
        const monthTxs = enriched.filter(
          (tx) =>
            tx.type === '입금' &&
            tx.memberId === member.id &&
            duesContribution(tx, ym) > 0
        )

        const paid = monthTxs.reduce((sum, tx) => sum + duesContribution(tx, ym), 0)
        // 면제/감면 반영한 기본 월회비
        const baseDues = effectiveMonthlyDues(member, ym)
        const isExempt = baseDues === 0
        // 리그비 기간이면 required에 추가 (면제자는 리그비도 면제)
        const leagueExtra = isExempt ? 0 : isLeagueFeeMonth(ym) ? (monthlyLeagueFee ?? 0) : 0
        const required = baseDues + leagueExtra
        const overrideKey = `${member.id}:${ym}`
        const override = manualOverrides[overrideKey]

        // 회비 시작월 이전: 다른 통장 사용 → 미납 없음 (납입 처리)
        const beforeDuesStart = !!(duesStartMonth && ym < duesStartMonth)

        let status: DuesStatus['status']
        if (override === 'paid') {
          status = 'paid'
        } else if (override === 'unpaid') {
          status = 'unpaid'
        } else if (isExempt) {
          status = 'paid'
        } else if (beforeDuesStart) {
          status = 'paid'
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
          exempt: isExempt,
        })
      }
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
  const paid = statuses.filter(
    (s) => s.status === 'paid' || s.status === 'annual_paid'
  ).length
  return Math.round((paid / statuses.length) * 100)
}

export function getTotalExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}
