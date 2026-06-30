import { useState } from 'react'
import { X, ArrowRightLeft, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import type { Member, Transaction, DuesStatus, Settings, CellComment } from '../types'
import {
  computeDuesStatuses,
  duesContribution,
  formatKRW,
  formatYearMonth,
  getMonthsBetween,
  getYearMonth,
} from '../utils/calculations'
import { useAdmin } from '../auth'

interface Props {
  members: Member[]
  transactions: Transaction[]
  setTransactions: (t: Transaction[]) => void
  manualOverrides: Record<string, 'paid' | 'unpaid'>
  setManualOverrides: (o: Record<string, 'paid' | 'unpaid'>) => void
  settings: Settings
  comments: CellComment[]
  setComments: (c: CellComment[]) => void
}

export default function DuesTracker({
  members,
  transactions,
  setTransactions,
  manualOverrides,
  setManualOverrides,
  settings,
  comments,
  setComments,
}: Props) {
  const { isAdmin } = useAdmin()
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; ym: string } | null>(null)
  // 이관 폼: 어떤 거래를 이 달로 이관할지
  const [allocTxId, setAllocTxId] = useState<string | null>(null)
  const [allocAmount, setAllocAmount] = useState('')
  const [allocReason, setAllocReason] = useState('')
  // 회비 시작월 이전(다른 통장) 달 펼치기
  const [showPreStart, setShowPreStart] = useState(false)
  // 댓글 입력 폼
  const [commentName, setCommentName] = useState(() => localStorage.getItem('tdm:commentName') || '')
  const [commentText, setCommentText] = useState('')

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

  const { leagueFeeStartMonth, monthlyLeagueFee, duesStartMonth } = settings

  // 선택 연도의 월 목록
  const yearStart = `${selectedYear}-01`
  const yearEnd = `${selectedYear}-12`
  const allMonths = getMonthsBetween(yearStart, yearEnd)

  // 회비 시작월 이전 달은 기본 숨김 (다른 통장에서 납입 완료)
  const preStartMonths = duesStartMonth
    ? allMonths.filter((m) => m < duesStartMonth)
    : []
  const months = showPreStart
    ? allMonths
    : allMonths.filter((m) => !preStartMonths.includes(m))
  const isLeagueFeeMonth = (ym: string) =>
    !!(leagueFeeStartMonth && monthlyLeagueFee && monthlyLeagueFee > 0 && leagueFeeStartMonth <= ym)

  const statuses = computeDuesStatuses(
    activeMembers,
    transactions,
    months,
    manualOverrides,
    leagueFeeStartMonth,
    monthlyLeagueFee,
    duesStartMonth
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

  // 이관 가능한 거래: 선택 멤버의 입금 거래 중, 현재 월에 기여하지 않는 것
  const allocatableTxs = selectedCell
    ? transactions
        .filter(
          (tx) =>
            tx.type === '입금' &&
            tx.memberId === selectedCell.memberId &&
            tx.date.startsWith(selectedYear) &&
            duesContribution(tx, selectedCell.ym) === 0
        )
        .sort((a, b) => (a.date > b.date ? -1 : 1))
    : []

  function startAlloc(tx: Transaction) {
    setAllocTxId(tx.id)
    setAllocAmount(String(tx.amount))
    setAllocReason('')
  }

  // 거래를 현재 선택 월의 회비로 이관/배분
  function applyAlloc() {
    if (!allocTxId || !selectedCell) return
    const amount = parseInt(allocAmount.replace(/[^0-9]/g, '')) || 0
    if (amount <= 0) return
    const ym = selectedCell.ym
    setTransactions(
      transactions.map((tx) => {
        if (tx.id !== allocTxId) return tx
        // 기존 배분이 없으면, 원래 거래일 월에 대한 배분을 먼저 보존
        const base: Transaction['duesAllocations'] =
          tx.duesAllocations && tx.duesAllocations.length > 0
            ? [...tx.duesAllocations]
            : []
        // 이 달에 대한 기존 배분 제거 후 추가
        const filtered = base.filter((a) => a.yearMonth !== ym)
        filtered.push({ yearMonth: ym, amount, reason: allocReason.trim() || undefined })
        return { ...tx, duesAllocations: filtered }
      })
    )
    setAllocTxId(null)
    setAllocAmount('')
    setAllocReason('')
  }

  // 셀 댓글
  const cellKey = selectedCell ? `${selectedCell.memberId}:${selectedCell.ym}` : ''
  const cellComments = comments
    .filter((c) => c.cellKey === cellKey)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))

  function addComment() {
    if (!selectedCell || !commentName.trim() || !commentText.trim()) return
    const c: CellComment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cellKey,
      name: commentName.trim(),
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('tdm:commentName', commentName.trim())
    setComments([...comments, c])
    setCommentText('')
  }

  function removeComment(id: string) {
    setComments(comments.filter((c) => c.id !== id))
  }

  // 이 달에 대한 배분 취소 (거래의 해당 월 배분 제거)
  function removeAlloc(txId: string, ym: string) {
    setTransactions(
      transactions.map((tx) => {
        if (tx.id !== txId) return tx
        if (!tx.duesAllocations) return tx
        const filtered = tx.duesAllocations.filter((a) => a.yearMonth !== ym)
        return { ...tx, duesAllocations: filtered.length > 0 ? filtered : undefined }
      })
    )
  }

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

                {/* 회비 시작월 이전 달 펼치기 */}
                {preStartMonths.length > 0 && (
                  <button
                    onClick={() => { setShowPreStart(!showPreStart); setSelectedCell(null) }}
                    className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-2 py-1.5 flex items-center gap-1"
                  >
                    {showPreStart ? (
                      <>{preStartMonths.map((m) => parseInt(m.split('-')[1])).join('·')}월 숨기기 <ChevronUp size={12} /></>
                    ) : (
                      <>{preStartMonths.map((m) => parseInt(m.split('-')[1])).join('·')}월 보기 <ChevronDown size={12} /></>
                    )}
                  </button>
                )}
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
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> 면제
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
                          const cellClass = s?.exempt
                            ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            : s?.status === 'paid'
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
                                {s?.exempt
                                  ? '면제'
                                  : s?.status === 'paid'
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
                      <p className="text-xs text-gray-500 mb-2 font-medium">이 달 회비 집계 내역</p>
                      <ul className="space-y-1">
                        {selectedStatus.transactions.map((tx) => {
                          const contrib = duesContribution(tx, selectedCell.ym)
                          const alloc = tx.duesAllocations?.find((a) => a.yearMonth === selectedCell.ym)
                          const isMoved = getYearMonth(tx.date) !== selectedCell.ym
                          return (
                            <li key={tx.id} className="py-1 text-xs border-b border-gray-100">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600">
                                  {tx.date} {tx.depositorName}
                                  {isMoved && (
                                    <span className="ml-1 text-orange-500">(이관됨)</span>
                                  )}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium text-blue-600">{formatKRW(contrib)}</span>
                                  {alloc && (
                                    <button
                                      onClick={() => removeAlloc(tx.id, selectedCell.ym)}
                                      className="text-gray-400 hover:text-red-500"
                                      title="이관 취소"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {alloc?.reason && (
                                <span className="text-[11px] text-gray-400">사유: {alloc.reason}</span>
                              )}
                              {alloc && tx.amount !== contrib && (
                                <span className="text-[11px] text-gray-400 block">
                                  (원거래 {formatKRW(tx.amount)} 중 {formatKRW(contrib)} 배분)
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {/* 다른 입금 이관/분할 (월납·관리자만) */}
                  {isAdmin && !isAnnualMember(selectedCell.memberId) && allocatableTxs.length > 0 && (
                    <div className="border-t border-gray-100 pt-2">
                      <p className="text-xs text-gray-500 mb-2 font-medium flex items-center gap-1">
                        <ArrowRightLeft size={12} /> 다른 입금을 이 달 회비로 이관/분할
                      </p>
                      <ul className="space-y-1">
                        {allocatableTxs.map((tx) => (
                          <li key={tx.id} className="text-xs">
                            {allocTxId === tx.id ? (
                              <div className="bg-orange-50 rounded p-2 space-y-2 border border-orange-200">
                                <p className="text-gray-600">
                                  {tx.date} {tx.depositorName} · 원거래 {formatKRW(tx.amount)}
                                </p>
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <label className="text-[11px] text-gray-500">이 달 적용 금액</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                                      value={allocAmount}
                                      onChange={(e) => setAllocAmount(e.target.value.replace(/[^0-9]/g, ''))}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[11px] text-gray-500">사유</label>
                                  <input
                                    type="text"
                                    className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                                    placeholder="예: 4월로 기재됐으나 실제 5월 회비"
                                    value={allocReason}
                                    onChange={(e) => setAllocReason(e.target.value)}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={applyAlloc}
                                    className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600"
                                  >
                                    적용
                                  </button>
                                  <button
                                    onClick={() => setAllocTxId(null)}
                                    className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center py-1 border-b border-gray-100">
                                <span className="text-gray-600">
                                  {tx.date} {tx.depositorName} · {formatKRW(tx.amount)}
                                  {getYearMonth(tx.date) !== selectedCell.ym && (
                                    <span className="ml-1 text-gray-400">
                                      ({parseInt(getYearMonth(tx.date).split('-')[1])}월 거래)
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => startAlloc(tx)}
                                  className="text-xs text-orange-600 border border-orange-300 px-2 py-0.5 rounded hover:bg-orange-50"
                                >
                                  이관
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {isAdmin && (
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
                  )}

                  {/* 댓글 (열람자도 작성 가능) */}
                  <div className="border-t border-gray-100 pt-2">
                    <p className="text-xs text-gray-500 mb-2 font-medium flex items-center gap-1">
                      <MessageSquare size={12} /> 댓글 {cellComments.length > 0 && `(${cellComments.length})`}
                    </p>
                    {cellComments.length > 0 && (
                      <ul className="space-y-1.5 mb-2">
                        {cellComments.map((c) => (
                          <li key={c.id} className="bg-gray-50 rounded p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-700">{c.name}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400">{c.createdAt.slice(0, 10)}</span>
                                {isAdmin && (
                                  <button
                                    onClick={() => removeComment(c.id)}
                                    className="text-gray-300 hover:text-red-500"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{c.text}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        className="border rounded px-2 py-1 text-xs w-full"
                        placeholder="이름"
                        value={commentName}
                        onChange={(e) => setCommentName(e.target.value)}
                      />
                      <textarea
                        className="border rounded px-2 py-1 text-xs w-full resize-none"
                        rows={2}
                        placeholder="내용을 입력하세요"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                      />
                      <button
                        onClick={addComment}
                        disabled={!commentName.trim() || !commentText.trim()}
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
                      >
                        댓글 남기기
                      </button>
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
