import { Users, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import type { Member, Transaction, Expense, LeaguePlan, DuesStatus } from '../types'
import {
  formatKRW,
  computeCurrentBalance,
  computeLeaguePlan,
  getCollectionRate,
  getTotalExpenses,
  computeDuesStatuses,
} from '../utils/calculations'

interface Props {
  members: Member[]
  transactions: Transaction[]
  expenses: Expense[]
  leaguePlan: LeaguePlan
  manualOverrides: Record<string, 'paid' | 'unpaid'>
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className={`bg-white rounded-xl shadow p-5 border-l-4 ${color}`}>
      <div className="flex items-center gap-3">
        <div className="text-gray-500">{icon}</div>
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-xl font-bold text-gray-800">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({
  members,
  transactions,
  expenses,
  leaguePlan,
  manualOverrides,
}: Props) {
  const currentBalance = leaguePlan.useCurrentBalance
    ? leaguePlan.manualBalance
    : computeCurrentBalance(transactions)

  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const activeMembers = members.filter((m) => m.active)

  const thisMonthStatuses: DuesStatus[] = computeDuesStatuses(
    activeMembers,
    transactions,
    [thisMonth],
    manualOverrides
  )

  const collectionRate = getCollectionRate(thisMonthStatuses)
  const totalExpenses = getTotalExpenses(expenses)

  const leagueCalc =
    leaguePlan.targetDate
      ? computeLeaguePlan(
          leaguePlan.leagueFee,
          leaguePlan.reserveFund,
          leaguePlan.targetDate,
          leaguePlan.payingMembers,
          currentBalance
        )
      : null

  const recentTxs = [...transactions]
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 5)

  const recentExpenses = [...expenses]
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<TrendingUp size={22} />}
          label="현재 잔액"
          value={formatKRW(currentBalance)}
          sub={leaguePlan.useCurrentBalance ? '수동 입력' : '최근 거래 기준'}
          color="border-blue-500"
        />
        <StatCard
          icon={<Users size={22} />}
          label="이번 달 납입률"
          value={`${collectionRate}%`}
          sub={`${thisMonthStatuses.filter((s) => s.status === 'paid').length} / ${activeMembers.length}명 납입`}
          color={collectionRate === 100 ? 'border-green-500' : 'border-yellow-400'}
        />
        <StatCard
          icon={<TrendingDown size={22} />}
          label="총 지출"
          value={formatKRW(totalExpenses)}
          sub={`${expenses.length}건`}
          color="border-red-400"
        />
        <StatCard
          icon={<AlertCircle size={22} />}
          label="다음 리그 부족액"
          value={leagueCalc ? formatKRW(leagueCalc.shortfall) : '-'}
          sub={leagueCalc ? `월 ${formatKRW(leagueCalc.monthlyPerMember)}/인` : '리그 계획 미설정'}
          color={leagueCalc && leagueCalc.shortfall > 0 ? 'border-orange-400' : 'border-green-500'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">최근 입금 내역</h3>
          {recentTxs.length === 0 ? (
            <p className="text-xs text-gray-400">거래 내역이 없습니다. CSV를 업로드하세요.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentTxs.map((tx) => {
                const member = members.find((m) => m.id === tx.memberId)
                return (
                  <li key={tx.id} className="flex justify-between items-center py-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">
                        {tx.depositorName || tx.description}
                      </span>
                      {member && (
                        <span className="ml-1 text-xs text-blue-500">({member.name})</span>
                      )}
                      <span className="block text-xs text-gray-400">{tx.date}</span>
                    </div>
                    <span
                      className={
                        tx.type === '입금' ? 'text-blue-600 font-bold' : 'text-red-500 font-bold'
                      }
                    >
                      {tx.type === '입금' ? '+' : '-'}
                      {formatKRW(tx.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">최근 지출 내역</h3>
          {recentExpenses.length === 0 ? (
            <p className="text-xs text-gray-400">지출 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentExpenses.map((exp) => (
                <li key={exp.id} className="flex justify-between items-center py-2 text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{exp.description}</span>
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {exp.category}
                    </span>
                    <span className="block text-xs text-gray-400">{exp.date}</span>
                  </div>
                  <span className="text-red-500 font-bold">{formatKRW(exp.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {thisMonthStatuses.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            이번 달 ({thisMonth}) 납입 현황
          </h3>
          <div className="flex flex-wrap gap-2">
            {thisMonthStatuses.map((s) => {
              const member = activeMembers.find((m) => m.id === s.memberId)
              if (!member) return null
              return (
                <span
                  key={s.memberId}
                  className={`text-xs px-3 py-1 rounded-full font-medium ${
                    s.status === 'paid'
                      ? 'bg-green-100 text-green-700'
                      : s.status === 'partial'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-600'
                  }`}
                >
                  {member.name} {s.status === 'paid' ? '✓' : s.status === 'partial' ? '△' : '✗'}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
