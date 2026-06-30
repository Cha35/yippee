export type PaymentType = 'monthly' | 'annual'

export interface Member {
  id: string
  name: string
  role: 'captain' | 'member'
  monthlyDues: number
  annualDues?: number // 일시납 금액 (미설정 시 monthlyDues * 12)
  paymentType: PaymentType
  aliases: string[]
  active: boolean
  joinDate: string // YYYY-MM
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  type: '입금' | '출금'
  amount: number
  balance: number
  description: string
  depositorName: string
  memberId?: string
  isManualEntry: boolean
  manuallyVerified?: boolean
  category?: 'dues' | 'general' | 'interest'
  reason?: string
  includedInDues?: boolean
  // 회비 월 이관/분할: 설정 시 거래일 기준 자동집계 대신 이 배분만 회비로 집계됨
  duesAllocations?: DuesAllocation[]
}

export interface DuesAllocation {
  yearMonth: string // YYYY-MM
  amount: number
  reason?: string
}

export type ExpenseCategory = '리그참가비' | '유니폼' | '운영비' | '기타'

export interface Expense {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  description: string
  receipt?: string
}

export interface LeaguePlan {
  leagueFee: number
  reserveFund: number
  targetDate: string
  payingMembers: number
  useCurrentBalance: boolean
  manualBalance: number
}

export interface Settings {
  teamName: string
  defaultMonthlyDues: number
  leagueFeeStartMonth?: string  // YYYY-MM: 이 달부터 리그비 추가 징수
  monthlyLeagueFee?: number     // 월 추가 리그비
  duesStartMonth?: string       // YYYY-MM: 이 달부터 회비 미납 체크 (이전 달은 미납 없음)
}

export interface DuesStatus {
  memberId: string
  yearMonth: string // YYYY-MM
  required: number
  paid: number
  status: 'paid' | 'partial' | 'unpaid' | 'annual_paid' | 'annual_unpaid'
  manualOverride?: 'paid' | 'unpaid'
  transactions: Transaction[]
  // 리그비 추가 징수 기간 필드 (leagueFeeStartMonth 이후 월에만 설정)
  leagueFeeRequired?: number
  leagueFeePaid?: number
  leagueFeeStatus?: 'paid' | 'unpaid'
}
