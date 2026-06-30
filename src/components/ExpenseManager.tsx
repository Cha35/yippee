import { useState, useRef } from 'react'
import { Plus, Trash2, Image } from 'lucide-react'
import type { Expense, ExpenseCategory, Transaction } from '../types'
import { formatKRW } from '../utils/calculations'

interface Props {
  expenses: Expense[]
  setExpenses: (e: Expense[]) => void
  transactions: Transaction[]
}

function categorizeOutflow(tx: Transaction): ExpenseCategory {
  const text = (tx.description + ' ' + tx.depositorName).toLowerCase()
  if (/리그|참가비/.test(text)) return '리그참가비'
  if (/유니폼|유니/.test(text)) return '유니폼'
  if (/구장|대관|필드|풋살|축구/.test(text)) return '운영비'
  if (/간식|음료|식사|점심|저녁/.test(text)) return '운영비'
  return '기타'
}

const CATEGORIES: ExpenseCategory[] = ['리그참가비', '유니폼', '운영비', '기타']
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  리그참가비: 'bg-purple-100 text-purple-700',
  유니폼: 'bg-blue-100 text-blue-700',
  운영비: 'bg-orange-100 text-orange-700',
  기타: 'bg-gray-100 text-gray-600',
}

function generateId() {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function ExpenseManager({ expenses, setExpenses, transactions }: Props) {
  const [adding, setAdding] = useState(false)
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>('all')
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)
  const receiptRef = useRef<HTMLInputElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date: today,
    category: '기타' as ExpenseCategory,
    amount: '',
    description: '',
    receipt: undefined as string | undefined,
  })

  function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, receipt: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  function saveExpense() {
    if (!form.description.trim() || !form.amount) return
    const expense: Expense = {
      id: generateId(),
      date: form.date,
      category: form.category,
      amount: parseInt(form.amount.replace(/,/g, '')) || 0,
      description: form.description.trim(),
      receipt: form.receipt,
    }
    setExpenses([...expenses, expense])
    setAdding(false)
    setForm({ date: today, category: '기타', amount: '', description: '', receipt: undefined })
    if (receiptRef.current) receiptRef.current.value = ''
  }

  function removeExpense(id: string) {
    if (!confirm('지출 내역을 삭제하시겠습니까?')) return
    setExpenses(expenses.filter((e) => e.id !== id))
  }

  const filtered =
    filterCategory === 'all'
      ? expenses
      : expenses.filter((e) => e.category === filterCategory)

  const sorted = [...filtered].sort((a, b) => (a.date > b.date ? -1 : 1))

  // Category summary
  const categorySummary: Record<ExpenseCategory, number> = {
    리그참가비: 0,
    유니폼: 0,
    운영비: 0,
    기타: 0,
  }
  for (const e of expenses) {
    categorySummary[e.category] += e.amount
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

  // 자동 집계: 출금 거래
  const autoOutflows = [...transactions]
    .filter((tx) => tx.type === '출금')
    .sort((a, b) => (a.date > b.date ? -1 : 1))

  // 자동 집계: 비회비 수입 (이자 + 미매칭 입금)
  const autoIncome = [...transactions]
    .filter((tx) => {
      if (tx.type !== '입금') return false
      const text = (tx.description + ' ' + tx.depositorName).toLowerCase()
      if (/이자/.test(text)) return true
      return !tx.memberId
    })
    .sort((a, b) => (a.date > b.date ? -1 : 1))

  const totalAutoOutflow = autoOutflows.reduce((s, t) => s + t.amount, 0)
  const totalAutoIncome = autoIncome.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-gray-500">{cat}</p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {formatKRW(categorySummary[cat])}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-700">지출 내역</h2>
            <p className="text-xs text-gray-400">총 {formatKRW(totalExpenses)}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border rounded-lg px-2 py-1.5 text-xs"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as ExpenseCategory | 'all')}
            >
              <option value="all">전체</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
            >
              <Plus size={15} /> 지출 추가
            </button>
          </div>
        </div>

        {adding && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
            <p className="text-sm font-medium text-blue-700">지출 내역 추가</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">날짜</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">항목</label>
                <select
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">금액 (원)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  placeholder="100000"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount: e.target.value.replace(/[^0-9]/g, ''),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">내용</label>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  placeholder="2024 봄 리그 참가비"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">영수증/증빙 첨부 (선택)</label>
                <div className="mt-1 flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs border rounded px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                    <Image size={13} /> 파일 선택
                    <input
                      ref={receiptRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleReceiptUpload}
                    />
                  </label>
                  {form.receipt && (
                    <span className="text-xs text-green-600">✓ 첨부됨</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveExpense}
                className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  if (receiptRef.current) receiptRef.current.value = ''
                }}
                className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">지출 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sorted.map((exp) => (
              <li key={exp.id} className="py-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{exp.description}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[exp.category]}`}
                    >
                      {exp.category}
                    </span>
                    {exp.receipt && (
                      <button
                        onClick={() => setPreviewReceipt(exp.receipt!)}
                        className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                      >
                        <Image size={11} /> 증빙
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{exp.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-red-500 text-sm">{formatKRW(exp.amount)}</span>
                  <button
                    onClick={() => removeExpense(exp.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 자동 집계: 출금 내역 */}
      {autoOutflows.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-700">거래내역 자동 지출</h2>
              <p className="text-xs text-gray-400">은행 출금 거래 기반 자동 집계 — 총 {formatKRW(totalAutoOutflow)}</p>
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {autoOutflows.map((tx) => {
              const cat = categorizeOutflow(tx)
              return (
                <li key={tx.id} className="py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">
                        {tx.description || tx.depositorName || '(내용 없음)'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}>
                        {cat}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{tx.date}</span>
                  </div>
                  <span className="font-bold text-red-500 text-sm">{formatKRW(tx.amount)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 자동 집계: 기타 수입 (이자 + 비회비 입금) */}
      {autoIncome.length > 0 && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-700">기타 수입</h2>
              <p className="text-xs text-gray-400">이자 · 용병게임비 · 기타 입금 — 총 {formatKRW(totalAutoIncome)}</p>
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {autoIncome.map((tx) => {
              const text = (tx.description + ' ' + tx.depositorName).toLowerCase()
              const isInterest = /이자/.test(text)
              return (
                <li key={tx.id} className="py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">
                        {tx.depositorName || '(입금자 없음)'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isInterest ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isInterest ? '이자' : '기타 입금'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{tx.date}</span>
                    {tx.description && (
                      <span className="text-xs text-gray-500 block mt-0.5">내용: {tx.description}</span>
                    )}
                  </div>
                  <span className="font-bold text-blue-600 text-sm">{formatKRW(tx.amount)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {previewReceipt && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewReceipt(null)}
        >
          <div className="max-w-lg w-full bg-white rounded-xl overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <p className="text-sm font-medium">영수증/증빙</p>
              <button
                onClick={() => setPreviewReceipt(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                닫기
              </button>
            </div>
            <div className="p-4">
              {previewReceipt.startsWith('data:image') ? (
                <img src={previewReceipt} alt="영수증" className="max-w-full rounded" />
              ) : (
                <p className="text-sm text-gray-500">PDF 첨부파일 (다운로드 필요)</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
