import { useState, useRef } from 'react'
import { Upload, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Member, Transaction, DuesStatus } from '../types'
import {
  parseKakaoBankCSV,
  type ParseResult,
} from '../utils/csvParser'
import {
  computeDuesStatuses,
  formatKRW,
  formatYearMonth,
  getMonthsBetween,
  matchTransactionToMember,
} from '../utils/calculations'

interface Props {
  members: Member[]
  transactions: Transaction[]
  setTransactions: (t: Transaction[]) => void
  manualOverrides: Record<string, 'paid' | 'unpaid'>
  setManualOverrides: (o: Record<string, 'paid' | 'unpaid'>) => void
}

export default function DuesTracker({
  members,
  transactions,
  setTransactions,
  manualOverrides,
  setManualOverrides,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; ym: string } | null>(null)
  const [showUnmatched, setShowUnmatched] = useState(false)

  const activeMembers = members.filter((m) => m.active)

  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  let months: string[] = [thisMonth]
  if (transactions.length > 0) {
    const dates = transactions.map((t) => t.date)
    const minDate = dates.reduce((a, b) => (a < b ? a : b))
    const maxDate = dates.reduce((a, b) => (a > b ? a : b))
    const fromMonth = minDate.slice(0, 7)
    const toMonth = maxDate.slice(0, 7) > thisMonth ? maxDate.slice(0, 7) : thisMonth
    months = getMonthsBetween(fromMonth, toMonth)
  }

  if (activeMembers.length > 0) {
    const earliestJoin = activeMembers.reduce(
      (min, m) => (m.joinDate < min ? m.joinDate : min),
      activeMembers[0].joinDate
    )
    if (earliestJoin < months[0]) {
      months = getMonthsBetween(earliestJoin, months[months.length - 1])
    }
  }

  const statuses = computeDuesStatuses(activeMembers, transactions, months, manualOverrides)

  function getStatus(memberId: string, ym: string): DuesStatus | undefined {
    return statuses.find((s) => s.memberId === memberId && s.yearMonth === ym)
  }

  function isMemberActive(member: Member, ym: string): boolean {
    return member.joinDate <= ym
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setParseErrors([])

    const result: ParseResult = await parseKakaoBankCSV(file)
    setParseErrors(result.errors)

    if (result.transactions.length > 0) {
      const enriched = result.transactions.map((tx) => ({
        ...tx,
        memberId: matchTransactionToMember(tx, members),
      }))

      const existing = new Set(
        transactions.map((t) => `${t.date}|${t.amount}|${t.depositorName}`)
      )
      const newTxs = enriched.filter(
        (t) => !existing.has(`${t.date}|${t.amount}|${t.depositorName}`)
      )

      setTransactions([...transactions, ...newTxs])
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function toggleOverride(memberId: string, ym: string) {
    const key = `${memberId}:${ym}`
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

  const unmatchedTxs = transactions.filter(
    (tx) => tx.type === '입금' && !tx.memberId
  )

  function assignTransaction(txId: string, memberId: string) {
    setTransactions(
      transactions.map((tx) =>
        tx.id === txId ? { ...tx, memberId: memberId || undefined } : tx
      )
    )
  }

  const selectedStatus = selectedCell
    ? getStatus(selectedCell.memberId, selectedCell.ym)
    : null
  const selectedMember = selectedCell
    ? members.find((m) => m.id === selectedCell.memberId)
    : null

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">거래내역 업로드</h2>
          <label className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">
            {uploading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Upload size={15} />
            )}
            CSV 업로드
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          카카오뱅크 앱 → 모임통장 → 거래내역 → 내보내기(CSV)로 다운받은 파일을 업로드하세요.
          <br />
          중복 거래는 자동으로 제거됩니다.
        </p>
        {parseErrors.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-1 text-red-600 text-xs font-medium mb-1">
              <AlertTriangle size={13} /> 파싱 경고
            </div>
            {parseErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-500">
                {e}
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">
          총 {transactions.length}건 등록됨
        </p>
      </div>

      {unmatchedTxs.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <button
            className="flex items-center gap-2 text-sm font-medium text-yellow-700 w-full"
            onClick={() => setShowUnmatched(!showUnmatched)}
          >
            <AlertTriangle size={15} />
            미매칭 입금 {unmatchedTxs.length}건
            {showUnmatched ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showUnmatched && (
            <div className="mt-3 divide-y divide-gray-100">
              {unmatchedTxs.map((tx) => (
                <div key={tx.id} className="py-2 flex items-center gap-3 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{tx.depositorName}</span>
                    <span className="text-gray-400 text-xs ml-2">{tx.date}</span>
                    <span className="text-blue-600 font-medium ml-2">{formatKRW(tx.amount)}</span>
                  </div>
                  <select
                    className="border rounded px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) => assignTransaction(tx.id, e.target.value)}
                  >
                    <option value="">팀원 선택</option>
                    {members
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeMembers.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-400">
          팀원을 먼저 등록해주세요.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">월별 회비 납입 현황</h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-green-200 inline-block" /> 납입
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-yellow-200 inline-block" /> 부분
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> 미납
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50 min-w-[90px]">
                    팀원
                  </th>
                  {months.map((ym) => (
                    <th
                      key={ym}
                      className="px-2 py-3 text-xs text-gray-500 font-medium text-center min-w-[70px]"
                    >
                      {formatYearMonth(ym)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white font-medium text-gray-800 min-w-[90px]">
                      {member.name}
                      {member.role === 'captain' && (
                        <span className="text-xs text-blue-500 ml-1">C</span>
                      )}
                    </td>
                    {months.map((ym) => {
                      if (!isMemberActive(member, ym)) {
                        return (
                          <td key={ym} className="px-2 py-3 text-center">
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
                          className="px-2 py-2 text-center cursor-pointer"
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
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCell && selectedStatus && selectedMember && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              {selectedMember.name} — {formatYearMonth(selectedCell.ym)}
            </h3>
            <button
              onClick={() => setSelectedCell(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              닫기
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">납입 필요</p>
              <p className="font-bold">{formatKRW(selectedStatus.required)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">실제 납입</p>
              <p className="font-bold">{formatKRW(selectedStatus.paid)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">상태</p>
              <p
                className={`font-bold ${
                  selectedStatus.status === 'paid'
                    ? 'text-green-600'
                    : selectedStatus.status === 'partial'
                    ? 'text-yellow-600'
                    : 'text-red-500'
                }`}
              >
                {selectedStatus.status === 'paid'
                  ? '납입완료'
                  : selectedStatus.status === 'partial'
                  ? '부분납입'
                  : '미납'}
              </p>
            </div>
          </div>

          {selectedStatus.transactions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">입금 내역</p>
              <ul className="divide-y divide-gray-100">
                {selectedStatus.transactions.map((tx) => (
                  <li key={tx.id} className="py-2 flex justify-between text-sm">
                    <span className="text-gray-600">
                      {tx.date} — {tx.depositorName}
                    </span>
                    <span className="font-medium text-blue-600">{formatKRW(tx.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 mr-2">수동 상태 변경:</p>
            <button
              onClick={() => toggleOverride(selectedCell.memberId, selectedCell.ym)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectedStatus.manualOverride === 'paid'
                  ? 'bg-green-100 border-green-300 text-green-700'
                  : 'border-gray-300 hover:bg-green-50'
              }`}
            >
              납입완료 처리
            </button>
            <button
              onClick={() => toggleOverride(selectedCell.memberId, selectedCell.ym)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectedStatus.manualOverride === 'unpaid'
                  ? 'bg-red-100 border-red-300 text-red-600'
                  : 'border-gray-300 hover:bg-red-50'
              }`}
            >
              미납 처리
            </button>
            {selectedStatus.manualOverride && (
              <button
                onClick={() => {
                  const next = { ...manualOverrides }
                  delete next[`${selectedCell.memberId}:${selectedCell.ym}`]
                  setManualOverrides(next)
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-500"
              >
                자동으로
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
