import { useState, useEffect } from 'react'
import type { Member, Transaction, Expense, LeaguePlan, Settings, CellComment } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import Dashboard from './components/Dashboard'
import MemberManager from './components/MemberManager'
import TransactionManager from './components/TransactionManager'
import DuesTracker from './components/DuesTracker'
import ExpenseManager from './components/ExpenseManager'
import LeaguePlanner from './components/LeaguePlanner'
import { LayoutDashboard, Users, CreditCard, Receipt, Target, Lock, Unlock } from 'lucide-react'
import { INITIAL_MEMBERS } from './data/initialMembers'
import { INITIAL_TRANSACTIONS } from './data/initialTransactions'
import { useAdmin } from './auth'

function AdminControl() {
  const { isAdmin, unlock, lock } = useAdmin()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  if (isAdmin) {
    return (
      <button
        onClick={lock}
        className="flex items-center gap-1 text-xs text-green-600 border border-green-200 bg-green-50 rounded-lg px-2.5 py-1.5 hover:bg-green-100"
        title="관리자 모드 — 잠그기"
      >
        <Unlock size={13} /> 관리자
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); setError(false) }}
        className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
        title="관리자 PIN 입력"
      >
        <Lock size={13} /> 열람 모드
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56">
          <p className="text-xs text-gray-500 mb-2">관리자 PIN을 입력하세요</p>
          <input
            type="password"
            autoFocus
            className={`border rounded px-2 py-1.5 text-sm w-full ${error ? 'border-red-400' : ''}`}
            placeholder="PIN"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (unlock(pin)) { setOpen(false); setPin('') }
                else setError(true)
              }
            }}
          />
          {error && <p className="text-xs text-red-500 mt-1">PIN이 올바르지 않습니다</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { if (unlock(pin)) { setOpen(false); setPin('') } else setError(true) }}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex-1"
            >
              해제
            </button>
            <button
              onClick={() => { setOpen(false); setPin(''); setError(false) }}
              className="text-xs border px-3 py-1.5 rounded hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type Tab = 'dashboard' | 'members' | 'transactions' | 'dues' | 'expenses' | 'league'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={17} /> },
  { id: 'members', label: '팀원', icon: <Users size={17} /> },
  { id: 'transactions', label: '입출금 내역', icon: <CreditCard size={17} /> },
  { id: 'dues', label: '회비 납입 현황', icon: <CreditCard size={17} /> },
  { id: 'expenses', label: '지출', icon: <Receipt size={17} /> },
  { id: 'league', label: '리그계획', icon: <Target size={17} /> },
]

const DEFAULT_SETTINGS: Settings = {
  teamName: '우리 팀',
  defaultMonthlyDues: 30000,
  duesStartMonth: '2026-03',
}

const DEFAULT_LEAGUE_PLAN: LeaguePlan = {
  leagueFee: 0,
  reserveFund: 0,
  targetDate: '',
  payingMembers: 0,
  useCurrentBalance: false,
  manualBalance: 0,
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [members, setMembers] = useLocalStorage<Member[]>('tdm:members', INITIAL_MEMBERS)
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('tdm:transactions', INITIAL_TRANSACTIONS)

  const [expenses, setExpenses] = useLocalStorage<Expense[]>('tdm:expenses', [])
  const [leaguePlan, setLeaguePlan] = useLocalStorage<LeaguePlan>('tdm:leaguePlan', DEFAULT_LEAGUE_PLAN)
  const [settings, setSettings] = useLocalStorage<Settings>('tdm:settings', DEFAULT_SETTINGS)

  // 시드 버전 체크: v1이 없으면 강제로 초기 데이터 덮어쓰기
  useEffect(() => {
    if (!localStorage.getItem('tdm:seed-v1')) {
      setMembers(INITIAL_MEMBERS)
      setTransactions(INITIAL_TRANSACTIONS)
      localStorage.setItem('tdm:seed-v1', '1')
    }
    // 기존 사용자 설정에 회비 시작월 백필 (1회)
    if (!localStorage.getItem('tdm:migrate-duesStart')) {
      setSettings((prev) =>
        prev.duesStartMonth ? prev : { ...prev, duesStartMonth: '2026-03' }
      )
      localStorage.setItem('tdm:migrate-duesStart', '1')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [manualOverrides, setManualOverrides] = useLocalStorage<Record<string, 'paid' | 'unpaid'>>(
    'tdm:overrides',
    {}
  )
  const [comments, setComments] = useLocalStorage<CellComment[]>('tdm:comments', [])

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-800">{settings.teamName}</h1>
            <p className="text-xs text-gray-400">회비 관리</p>
          </div>
          <AdminControl />
        </div>
        <nav className="max-w-5xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 pb-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'dashboard' && (
          <Dashboard
            members={members}
            transactions={transactions}
            expenses={expenses}
            leaguePlan={leaguePlan}
            manualOverrides={manualOverrides}
            settings={settings}
          />
        )}
        {tab === 'members' && (
          <MemberManager
            members={members}
            setMembers={setMembers}
            settings={settings}
            setSettings={setSettings}
          />
        )}
        {tab === 'transactions' && (
          <TransactionManager
            members={members}
            transactions={transactions}
            setTransactions={setTransactions}
          />
        )}
        {tab === 'dues' && (
          <DuesTracker
            members={members}
            transactions={transactions}
            setTransactions={setTransactions}
            manualOverrides={manualOverrides}
            setManualOverrides={setManualOverrides}
            settings={settings}
            comments={comments}
            setComments={setComments}
          />
        )}
        {tab === 'expenses' && (
          <ExpenseManager expenses={expenses} setExpenses={setExpenses} transactions={transactions} />
        )}
        {tab === 'league' && (
          <LeaguePlanner
            leaguePlan={leaguePlan}
            setLeaguePlan={setLeaguePlan}
            transactions={transactions}
          />
        )}
      </main>
    </div>
  )
}
