import { createContext, useContext, useState } from 'react'

// ─────────────────────────────────────────────────────────────
// 관리자 인증 (라이트 버전 — 클라이언트 전용)
// TODO: Supabase 연동 시 이 부분을 서버 인증으로 교체.
//       unlock()을 서버 검증 호출로 바꾸고 ADMIN_PIN 상수는 제거하면 됨.
//       isAdmin 기반 UI 게이팅은 그대로 재사용 가능.
// ─────────────────────────────────────────────────────────────
export const ADMIN_PIN = '435Anton12!@'
const STORAGE_KEY = 'tdm:admin'

interface AdminContextValue {
  isAdmin: boolean
  unlock: (pin: string) => boolean
  lock: () => void
}

const AdminContext = createContext<AdminContextValue>({
  isAdmin: false,
  unlock: () => false,
  lock: () => {},
})

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  function unlock(pin: string): boolean {
    if (pin === ADMIN_PIN) {
      setIsAdmin(true)
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // ignore
      }
      return true
    }
    return false
  }

  function lock() {
    setIsAdmin(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return (
    <AdminContext.Provider value={{ isAdmin, unlock, lock }}>
      {children}
    </AdminContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() {
  return useContext(AdminContext)
}
