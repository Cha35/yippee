import { useState } from 'react'
import { X } from 'lucide-react'
import type { Member, Transaction, DuesStatus, Settings } from '../types'
import {
  computeDuesStatuses,
  formatKRW,
  formatYearMonth,
  getMonthsBetween,
} from '../utils/calculations'

interface Props {
  members: Member[]
  transactions: Transaction[]
  manualOverrides: Record<string, 'paid' | 'unpaid'>
  setManualOverrides: (o: Record<string, 'paid' | 'unpaid'>) => void
  settings: Settings
}

export default function DuesTracker({
  members,
  transactions,
  manualOverrides,
  setManualOverrides,
  settings,
}: Props) {
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; ym: string } | null>(null)

  const activeMembers = members.filter((m) => m.active)

  const today = new Date()
  const thisYear = String(today.getFullYear())

  // 사용 가능한 연도 목록 계산
  const availableYears = (() => {
    const years = new Set<string>()
    years.add(thisYear)
    transactions.forEach((t) => years.add(t.date.slice(0, 4)))
    activeMembers.forEach((m) => years.add(m.joinDate.slice(0, 4)))
    return [...years].sort().reverse()
  })()

  const [selectedYear, setSelectedYear] = useState(thisYear)

  // 선택 연도의 월 목록
  const yearStart = `${selectedYear}-01`
  const yearEnd = `${selectedYear}-12`
  const months = getMonthsBetween(yearStart, yearEnd)

  const { leagueFeeStartMonth, monthlyLeagueFee } = settings
  const isLeagueFeeMonth = (ym: string) =>
    !!(leagueFeeStartMonth && monthlyLeagueFee && monthlyLeagueFee > 0 && leagueFeeStartMonth <= ym)

  const statuses = computeDuesStatuses(
    activeMembers,
    transactions,
    months,
    manualOverrides,
    leagueFeeStartMonth,
    monthlyLeagueFee
  )

  function getStatus(memberId: string, ym: string): DuesStatus | undefined {
    return statuses.find((s) => s.memberId === memberId && s.yearMonth === ym)
  }

  function isMemberActive(member: Member, ym: string): boolean {
    return member.joinDate <= ym
  }

  function toggleOverride(_memberId: string, key: string) {
    const current = manualOverrides[key]
    const next = { ...manualOverrides }
    if (current === 'paid') {
      next[key] = 'unpaid'
    } else if (current === 'unpaid') {
      delete next[key]
    } else {
      next[key] = 'paid'
    }
    setManualOverrides(next)
  }


  const selectedStatus = selectedCell
    ? getStatus(selectedCell.memberId, selectedCell.ym)
    : null
  const selectedMember = selectedCell
    ? members.find((m) => m.id === selectedCell.memberId)
    : null

  // 일시납 여부 확인
  const isAnnualMember = (memberId: string) =>
    members.find((m) => m.id === memberId)?.paymentType === 'annual'

  // 연도별 오버라이드 키 (일시납용)
  const annualOverrideKey = (memberId: string) => `${memberId}:${selectedYear}`

  return (
    <div className="space-y-6">

      {/* 납입 현황 그리드 */}
      {activeMembers.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-400">
          팀원을 먼저 등록해주세요.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-gray-700">월별 회비 납입 현황</h2>
              <div className="flex items-center gap-3">
                {/* 연도 필터 */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">연도</label>
                  <select
                    className="border rounded-lg px-2 py-1.5 text-sm font-medium"
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(e.target.value)
                      setSelectedCell(null)
                    }}
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-green-200 inline-block" /> 납입
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-yellow-200 inline-block" /> 부분
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> 미납
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-purple-200 inline-block" /> 일시납
                  </span>
                  {leagueFeeStartMonth && monthlyLeagueFee && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <span className="w-3 h-3 rounded-sm bg-orange-100 inline-block" /> 리그비포함
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50 min-w-[90px]">
                    팀원
                  </th>
                  {months.map((ym) => {
                    const isLeague = isLeagueFeeMonth(ym)
                    const isFirst = isLeague && ym === leagueFeeStartMonth
                    return (
                      <th
                        key={ym}
                        className={`px-2 py-3 text-xs font-medium text-center min-w-[60px] relative ${
                          isLeague ? 'bg-orange-50 text-orange-600' : 'text-gray-500'
                        }`}
                      >
                        {isFirst && (
                          <span className="absolute top-1 left-0 right-0 text-[9px] text-orange-400 text-center leading-none">
                            리그비↓
                          </span>
                        )}
                        <span className={isFirst ? 'mt-2 block' : ''}>
                          {parseInt(ym.split('-')[1])}월
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeMembers.map((member) => {
                  const isAnnual = member.paymentType === 'annual'
                  // 일시납의 경우 첫 번째 셀 상태로 연간 상태 판단
                  const annualStatus = isAnnual
                    ? getStatus(member.id, months[0])
                    : null

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 sticky left-0 bg-white font-medium text-gray-800 min-w-[90px]">
                        <div className="flex items-center gap-1">
                          {member.name}
                          {member.role === 'captain' && (
                            <span className="text-xs text-blue-500">C</span>
                          )}
                          {isAnnual && (
                            <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">일시</span>
                          )}
                        </div>
                      </td>
                      {isAnnual ? (
                        // 일시납: 첫 셀에 연간 상태 표시, 나머지는 연결
                        months.map((ym, idx) => {
                          if (!isMemberActive(member, ym)) {
                            return (
                              <td key={ym} className="px-2 py-3 text-center">
                                <span className="text-gray-300 text-xs">-</span>
                              </td>
                            )
                          }
                          const isPaid = annualStatus?.status === 'annual_paid'
                          const isSelected =
                            selectedCell?.memberId === member.id && selectedCell?.ym === ym

                          const s = getStatus(member.id, ym)
                          const lfStatus = s?.leagueFeeStatus
                          const isLeague = isLeagueFeeMonth(ym)

                          return (
                            <td
                              key={ym}
                              className={`px-2 py-2 text-center cursor-pointer ${isLeague ? 'bg-orange-50' : ''}`}
                              onClick={() =>
                                setSelectedCell(isSelected ? null : { memberId: member.id, ym })
                              }
                            >
                              <span
                                className={`inline-flex flex-col items-center justify-center w-14 h-10 rounded-lg text-xs font-medium transition-all ${
                                  idx === 0
                                    ? isPaid
                                      ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                      : 'bg-red-50 text-red-500 hover:bg-red-100'
                                    : isPaid
                                    ? 'bg-purple-50 text-purple-400 hover:bg-purple-100'
                                    : 'bg-red-50 text-red-300 hover:bg-red-100'
                                } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                              >
                                {idx === 0 ? (isPaid ? '일시납✓' : '미납') : (isPaid ? '✓' : '✗')}
                                {idx === 0 && annualStatus?.manualOverride && (
                                  <span className="text-[10px] opacity-60">수동</span>
                                )}
                                {isLeague && lfStatus && (
                                  <span className={`text-[9px] font-semibold ${lfStatus === 'paid' ? 'text-orange-500' : 'text-red-400'}`}>
                                    {lfStatus === 'paid' ? '리그✓' : '리그✗'}
                                  </span>
                                )}
                              </span>
                            </td>
                          )
                        })
                      ) : (
                        // 월납
                        months.map((ym) => {
                          const isLeague = isLeagueFeeMonth(ym)
                          if (!isMemberActive(member, ym)) {
                            return (
                              <td key={ym} className={`px-2 py-3 text-center ${isLeague ? 'bg-orange-50' : ''}`}>
                                <span className="text-gray-300 text-xs">-</span>
                              </td>
                            )
                          }
                          const s = getStatus(member.id, ym)
                          const isSelected =
                            selectedCell?.memberId === member.id && selectedCell?.ym === ym
                          const cellClass =
                            s?.status === 'paid'
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : s?.status === 'partial'
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          return (
                            <td
                              key={ym}
                              className={`px-2 py-2 text-center cursor-pointer ${isLeague ? 'bg-orange-50' : ''}`}
                              onClick={() =>
                                setSelectedCell(
                                  isSelected ? null : { memberId: member.id, ym }
                                )
                              }
                            >
                              <span
                                className={`inline-flex flex-col items-center justify-center w-14 h-10 rounded-lg text-xs font-medium transition-all ${cellClass} ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                              >
                                {s?.status === 'paid'
                                  ? '✓'
                                  : s?.status === 'partial'
                                  ? `${Math.round(((s?.paid ?? 0) / (s?.required || 1)) * 100)}%`
                                  : '✗'}
                                {s?.manualOverride && (
                                  <span className="text-[10px] opacity-60">수동</span>
                                )}
                              </span>
                            </td>
                          )
                        })
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 셀 클릭 상세 (모달) */}
      {selectedCell && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">
                {selectedMember.name} — {isAnnualMember(selectedCell.memberId)
                  ? `${selectedCell.ym.slice(0, 4)}년 일시납`
                  : formatYearMonth(selectedCell.ym)}
              </h3>
              <button onClick={() => setSelectedCell(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-3">
              {selectedStatus && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-xs text-gray-500">납입 필요</p>
                      <p className="font-bold text-xs">{formatKRW(selectedStatus.required)}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-xs text-gray-500">실제 납입</p>
                      <p className="font-bold text-xs">{formatKRW(selectedStatus.paid)}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <p className="text-xs text-gray-500">상태</p>
                      <p className={`font-bold text-xs ${
                        selectedStatus.status === 'paid' || selectedStatus.status === 'annual_paid'
                          ? 'text-green-600'
                          : selectedStatus.status === 'partial'
                          ? 'text-yellow-600'
                          : 'text-red-500'
                      }`}>
                        {selectedStatus.status === 'paid' ? '완료'
                          : selectedStatus.status === 'annual_paid' ? '완료'
                          : selectedStatus.status === 'partial' ? '부분'
                          : selectedStatus.status === 'annual_unpaid' ? '미완'
                          : '미납'}
                      </p>
                    </div>
                  </div>

                  {selectedStatus.transactions.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2 font-medium">입금 내역</p>
                      <ul className="space-y-1">
                        {selectedStatus.transactions.map((tx) => (
                          <li key={tx.id} className="py-1 flex justify-between text-xs border-b border-gray-100">
                            <span className="text-gray-600">{tx.date} {tx.depositorName}</span>
                            <span className="font-medium text-blue-600">{formatKRW(tx.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-xs text-gray-500 mb-2 font-medium">수동 변경</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {isAnnualMember(selectedCell.memberId) ? (
                        <>
                          <button
                            onClick={() => toggleOverride(selectedCell.memberId, annualOverrideKey(selectedCell.memberId))}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              selectedStatus.manualOverride === 'paid'
                                ? 'bg-purple-100 border-purple-300 text-purple-700'
                                : 'border-gray-300 hover:bg-purple-50'
                            }`}
                          >
                            완료
                          </button>
                          <button
                            onClick={() => toggleOverride(selectedCell.memberId, annualOverrideKey(selectedCell.memberId))}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              selectedStatus.manualOverride === 'unpaid'
                                ? 'bg-red-100 border-red-300 text-red-600'
                                : 'border-gray-300 hover:bg-red-50'
                            }`}
                          >
                            미납
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleOverride(selectedCell.memberId, `${selectedCell.memberId}:${selectedCell.ym}`)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              selectedStatus.manualOverride === 'paid'
                                ? 'bg-green-100 border-green-300 text-green-700'
                                : 'border-gray-300 hover:bg-green-50'
                            }`}
                          >
                            완료
                          </button>
                          <button
                            onClick={() => toggleOverride(selectedCell.memberId, `${selectedCell.memberId}:${selectedCell.ym}`)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                              selectedStatus.manualOverride === 'unpaid'
                                ? 'bg-red-100 border-red-300 text-red-600'
                                : 'border-gray-300 hover:bg-red-50'
                            }`}
                          >
                            미납
                          </button>
                        </>
                      )}
                      {selectedStatus.manualOverride && (
                        <button
                          onClick={() => {
                            const key = isAnnualMember(selectedCell.memberId)
                              ? annualOverrideKey(selectedCell.memberId)
                              : `${selectedCell.memberId}:${selectedCell.ym}`
                            const next = { ...manualOverrides }
                            delete next[key]
                            setManualOverrides(next)
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-500"
                        >
                          자동
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
