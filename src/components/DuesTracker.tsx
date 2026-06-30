import { useState, useRef } from 'react'
import { Upload, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Edit2, Trash2, Check, X, Sparkles, KeyRound } from 'lucide-react'
import type { Member, Transaction, DuesStatus, Settings } from '../types'
import { parseKakaoBankCSV, type ParseResult } from '../utils/csvParser'
import {
  computeDuesStatuses,
  formatKRW,
  formatYearMonth,
  getMonthsBetween,
  matchTransactionToMember,
} from '../utils/calculations'
import { matchTransactionsWithAI } from '../utils/claudeApi'

interface Props {
  members: Member[]
  transactions: Transaction[]
  setTransactions: (t: Transaction[]) => void
  manualOverrides: Record<string, 'paid' | 'unpaid'>
  setManualOverrides: (o: Record<string, 'paid' | 'unpaid'>) => void
  settings: Settings
}

export default function DuesTracker({
  members,
  transactions,
  setTransactions,
  manualOverrides,
  setManualOverrides,
  settings,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ memberId: string; ym: string } | null>(null)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showTxList, setShowTxList] = useState(false)
  const [editTxId, setEditTxId] = useState<string | null>(null)
  const [editTxForm, setEditTxForm] = useState<{
    depositorName: string
    amount: string
    date: string
    memberId: string
  } | null>(null)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiResults, setAiResults] = useState<{ txId: string; memberId: string | null; confidence: string; reason: string }[]>([])

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

  const unmatchedTxs = transactions.filter(
    (tx) => tx.type === '입금' && !tx.memberId
  )

  function assignTransaction(txId: string, newMemberId: string) {
    setTransactions(
      transactions.map((tx) =>
        tx.id === txId ? { ...tx, memberId: newMemberId || undefined } : tx
      )
    )
  }

  function startEditTx(tx: Transaction) {
    setEditTxId(tx.id)
    setEditTxForm({
      depositorName: tx.depositorName,
      amount: String(tx.amount),
      date: tx.date,
      memberId: tx.memberId ?? '',
    })
  }

  function saveEditTx() {
    if (!editTxForm || !editTxId) return
    setTransactions(
      transactions.map((tx) =>
        tx.id === editTxId
          ? {
              ...tx,
              depositorName: editTxForm.depositorName,
              amount: parseInt(editTxForm.amount) || tx.amount,
              date: editTxForm.date,
              memberId: editTxForm.memberId || undefined,
            }
          : tx
      )
    )
    setEditTxId(null)
  }

  function deleteTx(id: string) {
    if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return
    setTransactions(transactions.filter((tx) => tx.id !== id))
  }

  function saveApiKey(key: string) {
    setApiKey(key)
    localStorage.setItem('anthropic_api_key', key)
  }

  async function runAiMatching() {
    if (!apiKey) { setShowApiKey(true); return }
    const unmatched = transactions.filter((tx) => tx.type === '입금' && !tx.memberId)
    if (unmatched.length === 0) return
    setAiLoading(true)
    setAiError('')
    setAiResults([])
    try {
      const results = await matchTransactionsWithAI(apiKey, unmatched, members)
      setAiResults(results)
      // 신뢰도 high/medium인 것은 자동 적용
      const highConfidence = results.filter((r) => r.memberId && (r.confidence === 'high' || r.confidence === 'medium'))
      if (highConfidence.length > 0) {
        setTransactions(
          transactions.map((tx) => {
            const match = highConfidence.find((r) => r.txId === tx.id)
            return match ? { ...tx, memberId: match.memberId ?? undefined } : tx
          })
        )
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 분류 실패')
    } finally {
      setAiLoading(false)
    }
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

  const sortedTxs = [...transactions].sort((a, b) => (a.date > b.date ? -1 : 1))

  return (
    <div className="space-y-6">
      {/* CSV 업로드 */}
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
          중복 거래는 자동으로 제거됩니다.
        </p>
        {parseErrors.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-1 text-red-600 text-xs font-medium mb-1">
              <AlertTriangle size={13} /> 파싱 경고
            </div>
            {parseErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-500">{e}</p>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">총 {transactions.length}건 등록됨</p>
          {transactions.length > 0 && (
            <button
              onClick={() => setShowTxList(!showTxList)}
              className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            >
              내역 보기/수정 {showTxList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>

        {/* 거래 내역 수정 목록 */}
        {showTxList && (
          <div className="mt-3 border-t border-gray-100 pt-3 max-h-80 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-2 font-medium">전체 거래 내역 (수정/삭제 가능)</p>
            <ul className="divide-y divide-gray-50">
              {sortedTxs.map((tx) => (
                <li key={tx.id} className="py-2">
                  {editTxId === tx.id && editTxForm ? (
                    <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500">날짜</label>
                          <input
                            type="date"
                            className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                            value={editTxForm.date}
                            onChange={(e) => setEditTxForm({ ...editTxForm, date: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">금액 (원)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                            value={editTxForm.amount}
                            onChange={(e) =>
                              setEditTxForm({ ...editTxForm, amount: e.target.value.replace(/[^0-9]/g, '') })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">입금자명</label>
                          <input
                            className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                            value={editTxForm.depositorName}
                            onChange={(e) => setEditTxForm({ ...editTxForm, depositorName: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">팀원 연결</label>
                          <select
                            className="border rounded px-2 py-1 text-xs w-full mt-0.5"
                            value={editTxForm.memberId}
                            onChange={(e) => setEditTxForm({ ...editTxForm, memberId: e.target.value })}
                          >
                            <option value="">미연결</option>
                            {members.filter((m) => m.active).map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditTx}
                          className="flex items-center gap-1 text-xs bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600"
                        >
                          <Check size={12} /> 저장
                        </button>
                        <button
                          onClick={() => setEditTxId(null)}
                          className="flex items-center gap-1 text-xs border px-2 py-1 rounded hover:bg-gray-50"
                        >
                          <X size={12} /> 취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-700 truncate">
                            {tx.depositorName || tx.description}
                          </span>
                          {tx.memberId && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
                              {members.find((m) => m.id === tx.memberId)?.name}
                            </span>
                          )}
                          <span className={`text-xs shrink-0 ${tx.type === '입금' ? 'text-blue-600' : 'text-red-500'}`}>
                            {tx.type === '입금' ? '+' : '-'}{formatKRW(tx.amount)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{tx.date}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEditTx(tx)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => deleteTx(tx.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 미매칭 입금 */}
      {unmatchedTxs.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <button
              className="flex items-center gap-2 text-sm font-medium text-yellow-700"
              onClick={() => setShowUnmatched(!showUnmatched)}
            >
              <AlertTriangle size={15} />
              미매칭 입금 {unmatchedTxs.length}건
              {showUnmatched ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1"
              >
                <KeyRound size={12} /> API 키
              </button>
              <button
                onClick={runAiMatching}
                disabled={aiLoading}
                className="flex items-center gap-1 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {aiLoading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI 자동 분류
              </button>
            </div>
          </div>

          {/* API 키 입력 */}
          {showApiKey && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="password"
                placeholder="sk-ant-api03-..."
                className="border rounded px-3 py-1.5 text-xs flex-1 font-mono"
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
              />
              <button
                onClick={() => setShowApiKey(false)}
                className="text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1.5"
              >
                저장
              </button>
            </div>
          )}

          {aiError && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle size={12} /> {aiError}
            </p>
          )}

          {aiResults.length > 0 && (
            <p className="mt-2 text-xs text-purple-600">
              AI 분류 완료: 신뢰도 high/medium {aiResults.filter((r) => r.memberId && (r.confidence === 'high' || r.confidence === 'medium')).length}건 자동 적용됨
            </p>
          )}

          {showUnmatched && (
            <div className="mt-3 divide-y divide-gray-100">
              {unmatchedTxs.map((tx) => {
                const aiResult = aiResults.find((r) => r.txId === tx.id)
                return (
                  <div key={tx.id} className="py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <span className="font-medium">{tx.depositorName}</span>
                      <span className="text-gray-400 text-xs ml-2">{tx.date}</span>
                      <span className="text-blue-600 font-medium ml-2">{formatKRW(tx.amount)}</span>
                      {aiResult && (
                        <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${
                          aiResult.confidence === 'high' ? 'bg-green-100 text-green-700' :
                          aiResult.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          AI: {aiResult.reason}
                        </span>
                      )}
                    </div>
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => assignTransaction(tx.id, e.target.value)}
                    >
                      <option value="">팀원 선택</option>
                      {members.filter((m) => m.active).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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

                          if (idx === 0) {
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
                                    isPaid
                                      ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                      : 'bg-red-50 text-red-500 hover:bg-red-100'
                                  } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                                >
                                  {isPaid ? '일시납✓' : '미납'}
                                  {annualStatus?.manualOverride && (
                                    <span className="text-[10px] opacity-60">수동</span>
                                  )}
                                </span>
                              </td>
                            )
                          }
                          // 나머지 월은 연간 상태를 이어받아 표시 (작게)
                          return (
                            <td key={ym} className={`px-2 py-2 text-center ${isLeague ? 'bg-orange-50' : ''}`}>
                              <span
                                className={`inline-flex flex-col items-center justify-center w-14 h-10 rounded-lg text-xs ${
                                  isPaid ? 'bg-purple-50 text-purple-400' : 'bg-red-50 text-red-300'
                                }`}
                              >
                                {isPaid ? '✓' : '✗'}
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

      {/* 셀 클릭 상세 */}
      {selectedCell && selectedMember && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              {selectedMember.name} —{' '}
              {isAnnualMember(selectedCell.memberId)
                ? `${selectedCell.ym.slice(0, 4)}년 일시납`
                : formatYearMonth(selectedCell.ym)}
            </h3>
            <button onClick={() => setSelectedCell(null)} className="text-xs text-gray-400 hover:text-gray-600">
              닫기
            </button>
          </div>

          {selectedStatus && (
            <>
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
                  <p className={`font-bold text-sm ${
                    selectedStatus.status === 'paid' || selectedStatus.status === 'annual_paid'
                      ? 'text-green-600'
                      : selectedStatus.status === 'partial'
                      ? 'text-yellow-600'
                      : 'text-red-500'
                  }`}>
                    {selectedStatus.status === 'paid' ? '납입완료'
                      : selectedStatus.status === 'annual_paid' ? '일시납완료'
                      : selectedStatus.status === 'partial' ? '부분납입'
                      : selectedStatus.status === 'annual_unpaid' ? '일시납미완'
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
                        <span className="text-gray-600">{tx.date} — {tx.depositorName}</span>
                        <span className="font-medium text-blue-600">{formatKRW(tx.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-gray-500 mr-1">수동 상태 변경:</p>
                {isAnnualMember(selectedCell.memberId) ? (
                  <>
                    <button
                      onClick={() => toggleOverride(selectedCell.memberId, annualOverrideKey(selectedCell.memberId))}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selectedStatus.manualOverride === 'paid'
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'border-gray-300 hover:bg-purple-50'
                      }`}
                    >
                      일시납 완료 처리
                    </button>
                    <button
                      onClick={() => toggleOverride(selectedCell.memberId, annualOverrideKey(selectedCell.memberId))}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selectedStatus.manualOverride === 'unpaid'
                          ? 'bg-red-100 border-red-300 text-red-600'
                          : 'border-gray-300 hover:bg-red-50'
                      }`}
                    >
                      미납 처리
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => toggleOverride(selectedCell.memberId, `${selectedCell.memberId}:${selectedCell.ym}`)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selectedStatus.manualOverride === 'paid'
                          ? 'bg-green-100 border-green-300 text-green-700'
                          : 'border-gray-300 hover:bg-green-50'
                      }`}
                    >
                      납입완료 처리
                    </button>
                    <button
                      onClick={() => toggleOverride(selectedCell.memberId, `${selectedCell.memberId}:${selectedCell.ym}`)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selectedStatus.manualOverride === 'unpaid'
                          ? 'bg-red-100 border-red-300 text-red-600'
                          : 'border-gray-300 hover:bg-red-50'
                      }`}
                    >
                      미납 처리
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
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-500"
                  >
                    자동으로
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
