import { useState, useRef } from 'react'
import { Upload, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Edit2, Trash2, Check, X, Sparkles, KeyRound } from 'lucide-react'
import type { Member, Transaction } from '../types'
import { parseKakaoBankCSV, type ParseResult } from '../utils/csvParser'
import {
  formatKRW,
  matchTransactionToMember,
} from '../utils/calculations'
import { matchTransactionsWithAI } from '../utils/claudeApi'

interface Props {
  members: Member[]
  transactions: Transaction[]
  setTransactions: (t: Transaction[]) => void
}

export default function TransactionManager({
  members,
  transactions,
  setTransactions,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
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
  const [classifyingTx, setClassifyingTx] = useState<string | null>(null)
  const [classifyForm, setClassifyForm] = useState<{
    category: 'dues' | 'general' | 'interest'
    reason: string
    includedInDues: boolean
  } | null>(null)


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

  const unmatchedTxs = transactions.filter(
    (tx) => tx.type === '입금' && !tx.memberId
  )

  function startClassify(txId: string) {
    setClassifyingTx(txId)
    const tx = transactions.find((t) => t.id === txId)
    setClassifyForm({
      category: tx?.category || 'general',
      reason: tx?.reason || '',
      includedInDues: tx?.includedInDues ?? false,
    })
  }

  function saveClassify() {
    if (!classifyingTx || !classifyForm) return
    setTransactions(
      transactions.map((tx) =>
        tx.id === classifyingTx
          ? {
              ...tx,
              category: classifyForm.category,
              reason: classifyForm.reason,
              includedInDues: classifyForm.includedInDues,
            }
          : tx
      )
    )
    setClassifyingTx(null)
    setClassifyForm(null)
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
                        {tx.description && (
                          <span className="text-xs text-gray-500 block mt-0.5">내용: {tx.description}</span>
                        )}
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
              onClick={() => {}}
            >
              <AlertTriangle size={15} />
              미매칭 입금 {unmatchedTxs.length}건
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

          <div className="mt-3 divide-y divide-gray-100 space-y-3">
            {unmatchedTxs.map((tx) => {
              const aiResult = aiResults.find((r) => r.txId === tx.id)
              const isClassifying = classifyingTx === tx.id
              return (
                <div key={tx.id} className="py-3">
                  {isClassifying && classifyForm ? (
                    <div className="bg-blue-50 rounded-lg p-3 space-y-2 border border-blue-200">
                      <div>
                        <label className="text-xs text-gray-600 font-medium">사유</label>
                        <input
                          type="text"
                          className="border rounded px-2 py-1 text-xs w-full mt-1"
                          placeholder="예: 유니폼 구매"
                          value={classifyForm.reason}
                          onChange={(e) => setClassifyForm({ ...classifyForm, reason: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 font-medium block mb-1">구분</label>
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="radio"
                              checked={classifyForm.category === 'dues'}
                              onChange={() => setClassifyForm({ ...classifyForm, category: 'dues' })}
                            />
                            <span>회비</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="radio"
                              checked={classifyForm.category === 'general'}
                              onChange={() => setClassifyForm({ ...classifyForm, category: 'general' })}
                            />
                            <span>일반 입금</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="radio"
                              checked={classifyForm.category === 'interest'}
                              onChange={() => setClassifyForm({ ...classifyForm, category: 'interest' })}
                            />
                            <span>이자</span>
                          </label>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={classifyForm.includedInDues}
                          onChange={(e) => setClassifyForm({ ...classifyForm, includedInDues: e.target.checked })}
                        />
                        <span>회비에 포함</span>
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={saveClassify}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => { setClassifyingTx(null); setClassifyForm(null) }}
                          className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{tx.depositorName}</span>
                          <span className="text-gray-400 text-xs">{tx.date}</span>
                          <span className="text-blue-600 font-medium text-sm">{formatKRW(tx.amount)}</span>
                        </div>
                        {tx.description && (
                          <span className="text-xs text-gray-500">내용: {tx.description}</span>
                        )}
                        {tx.category && (
                          <div className="text-xs text-gray-600 mt-1">
                            분류: <span className="font-medium">{
                              tx.category === 'dues' ? '회비' :
                              tx.category === 'interest' ? '이자' : '일반 입금'
                            }</span>
                            {tx.reason && <span> ({tx.reason})</span>}
                            {tx.includedInDues && <span className="ml-1 text-green-600">✓ 회비 포함</span>}
                          </div>
                        )}
                        {aiResult && !tx.category && (
                          <span className={`text-xs ml-0 px-1.5 py-0.5 rounded inline-block mt-1 ${
                            aiResult.confidence === 'high' ? 'bg-green-100 text-green-700' :
                            aiResult.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            AI: {aiResult.reason}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => startClassify(tx.id)}
                        className="text-xs bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 shrink-0"
                      >
                        분류
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
