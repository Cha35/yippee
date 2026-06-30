import { useState, useEffect } from 'react'
import type { Member, Transaction, Expense, LeaguePlan, Settings } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import Dashboard from './components/Dashboard'
import MemberManager from './components/MemberManager'
import DuesTracker from './components/DuesTracker'
import ExpenseManager from './components/ExpenseManager'
import LeaguePlanner from './components/LeaguePlanner'
import { LayoutDashboard, Users, CreditCard, Receipt, Target } from 'lucide-react'
import { INITIAL_MEMBERS } from './data/initialMembers'
import { INITIAL_TRANSACTIONS } from './data/initialTransactions'

type Tab = 'dashboard' | 'members' | 'dues' | 'expenses' | 'league'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={17} /> },
  { id: 'members', label: '팀원', icon: <Users size={17} /> },
  { id: 'dues', label: '납입현황', icon: <CreditCard size={17} /> },
  { id: 'expenses', label: '지출', icon: <Receipt size={17} /> },
  { id: 'league', label: '리그계획', icon: <Target size={17} /> },
]

const DEFAULT_SETTINGS: Settings = {
  teamName: '우리 팀',
  defaultMonthlyDues: 30000,
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

  // 시드 버전 체크: v1이 없으면 강제로 초기 데이터 덮어쓰기
  useEffect(() => {
    if (!localStorage.getItem('tdm:seed-v1')) {
      setMembers(INITIAL_MEMBERS)
      setTransactions(INITIAL_TRANSACTIONS)
      localStorage.setItem('tdm:seed-v1', '1')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [expenses, setExpenses] = useLocalStorage<Expense[]>('tdm:expenses', [])
  const [leaguePlan, setLeaguePlan] = useLocalStorage<LeaguePlan>('tdm:leaguePlan', DEFAULT_LEAGUE_PLAN)
  const [settings, setSettings] = useLocalStorage<Settings>('tdm:settings', DEFAULT_SETTINGS)
  const [manualOverrides, setManualOverrides] = useLocalStorage<Record<string, 'paid' | 'unpaid'>>(
    'tdm:overrides',
    {}
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-800">{settings.teamName}</h1>
            <p className="text-xs text-gray-400">회비 관리</p>
          </div>
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
        {tab === 'dues' && (
          <DuesTracker
            members={members}
            transactions={transactions}
            setTransactions={setTransactions}
            manualOverrides={manualOverrides}
            setManualOverrides={setManualOverrides}
            settings={settings}
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
