import type { LeaguePlan, Transaction } from '../types'
import {
  formatKRW,
  computeLeaguePlan,
  computeCurrentBalance,
} from '../utils/calculations'
import { Target, TrendingUp, Calendar, Users, DollarSign } from 'lucide-react'
import { useAdmin } from '../auth'

interface Props {
  leaguePlan: LeaguePlan
  setLeaguePlan: (p: LeaguePlan) => void
  transactions: Transaction[]
}

function InfoCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl p-5 shadow ${
        highlight ? 'bg-orange-50 border border-orange-200' : 'bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-1 text-gray-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${highlight ? 'text-orange-600' : 'text-gray-800'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function LeaguePlanner({ leaguePlan, setLeaguePlan, transactions }: Props) {
  const { isAdmin } = useAdmin()
  const autoBalance = computeCurrentBalance(transactions)
  const currentBalance = leaguePlan.useCurrentBalance ? leaguePlan.manualBalance : autoBalance

  const calc =
    leaguePlan.targetDate && leaguePlan.payingMembers > 0
      ? computeLeaguePlan(
          leaguePlan.leagueFee,
          leaguePlan.reserveFund,
          leaguePlan.targetDate,
          leaguePlan.payingMembers,
          currentBalance
        )
      : null

  function update(patch: Partial<LeaguePlan>) {
    setLeaguePlan({ ...leaguePlan, ...patch })
  }

  const today = new Date()
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}`

  return (
    <div className="space-y-6">
      {isAdmin && (
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-4">다음 리그 계획 설정</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">리그 참가비 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="500000"
              value={leaguePlan.leagueFee || ''}
              onChange={(e) =>
                update({ leagueFee: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0 })
              }
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">기타 예비비 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="100000"
              value={leaguePlan.reserveFund || ''}
              onChange={(e) =>
                update({ reserveFund: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0 })
              }
            />
            <p className="text-xs text-gray-400 mt-1">추가 일정, 예상치 못한 지출 등</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">목표 날짜 (리그 시작일)</label>
            <input
              type="month"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={leaguePlan.targetDate}
              min={minDate}
              onChange={(e) => update({ targetDate: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">납입 참여 인원</label>
            <input
              type="number"
              min={1}
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={leaguePlan.payingMembers || ''}
              onChange={(e) => update({ payingMembers: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs text-gray-500">현재 잔액</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaguePlan.useCurrentBalance}
                  onChange={(e) => update({ useCurrentBalance: e.target.checked })}
                />
                수동 입력
              </label>
            </div>
            {leaguePlan.useCurrentBalance ? (
              <input
                type="text"
                inputMode="numeric"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={leaguePlan.manualBalance || ''}
                onChange={(e) =>
                  update({ manualBalance: parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0 })
                }
              />
            ) : (
              <div className="border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">
                {formatKRW(autoBalance)}
                <span className="text-xs text-gray-400 ml-2">
                  (거래내역 최근 잔액 자동 반영)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {calc ? (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-600 px-1">계산 결과</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoCard
              icon={<Target size={15} />}
              label="총 필요 금액"
              value={formatKRW(calc.totalNeeded)}
              sub={`참가비 ${formatKRW(leaguePlan.leagueFee)} + 예비비 ${formatKRW(leaguePlan.reserveFund)}`}
            />
            <InfoCard
              icon={<TrendingUp size={15} />}
              label="현재 잔액"
              value={formatKRW(currentBalance)}
            />
            <InfoCard
              icon={<Calendar size={15} />}
              label="남은 기간"
              value={`${calc.monthsLeft}개월`}
              sub={`~ ${leaguePlan.targetDate}`}
            />
            <InfoCard
              icon={<DollarSign size={15} />}
              label="부족 금액"
              value={formatKRW(calc.shortfall)}
              highlight={calc.shortfall > 0}
              sub={calc.shortfall === 0 ? '충분히 모였습니다! 🎉' : '추가 납입 필요'}
            />
          </div>

          {calc.shortfall > 0 && (
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow">
              <div className="flex items-center gap-2 mb-2">
                <Users size={18} />
                <p className="text-sm font-medium opacity-80">
                  {leaguePlan.payingMembers}명 × {calc.monthsLeft}개월 납입 시
                </p>
              </div>
              <p className="text-3xl font-bold">
                1인당 월 {formatKRW(calc.monthlyPerMember)}
              </p>
              <p className="text-sm opacity-70 mt-1">
                총 {formatKRW(calc.monthlyPerMember * leaguePlan.payingMembers)}원/월 ×{' '}
                {calc.monthsLeft}개월 = {formatKRW(calc.shortfall)} 충당
              </p>
            </div>
          )}

          {calc.shortfall === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
              <p className="text-2xl mb-1">🎉</p>
              <p className="text-green-700 font-semibold">
                현재 잔액으로 충분합니다!
              </p>
              <p className="text-sm text-green-600 mt-1">
                {formatKRW(currentBalance - calc.totalNeeded)} 여유
              </p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">상세 내역</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-2 text-gray-500">리그 참가비</td>
                  <td className="py-2 text-right font-medium">{formatKRW(leaguePlan.leagueFee)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">기타 예비비</td>
                  <td className="py-2 text-right font-medium">{formatKRW(leaguePlan.reserveFund)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2">총 필요 금액</td>
                  <td className="py-2 text-right">{formatKRW(calc.totalNeeded)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500">현재 잔액</td>
                  <td className="py-2 text-right text-blue-600 font-medium">
                    -{formatKRW(currentBalance)}
                  </td>
                </tr>
                <tr className={`font-bold ${calc.shortfall > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  <td className="py-2">부족 금액</td>
                  <td className="py-2 text-right">{formatKRW(calc.shortfall)}</td>
                </tr>
                {calc.shortfall > 0 && (
                  <>
                    <tr>
                      <td className="py-2 text-gray-500">납입 기간</td>
                      <td className="py-2 text-right">{calc.monthsLeft}개월</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-500">납입 인원</td>
                      <td className="py-2 text-right">{leaguePlan.payingMembers}명</td>
                    </tr>
                    <tr className="font-bold text-blue-700 text-base">
                      <td className="py-2">1인당 월 납입액</td>
                      <td className="py-2 text-right">{formatKRW(calc.monthlyPerMember)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          목표 날짜와 납입 인원을 입력하면 계산 결과가 표시됩니다.
        </div>
      )}
    </div>
  )
}
