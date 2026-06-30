import { useState } from 'react'
import { Trash2, Edit2, Check, X, UserPlus, Plus } from 'lucide-react'
import type { Member, Settings, PaymentType, MemberDuesRule } from '../types'
import { formatKRW, getAnnualDues } from '../utils/calculations'
import { useAdmin } from '../auth'

interface Props {
  members: Member[]
  setMembers: (m: Member[]) => void
  settings: Settings
  setSettings: (s: Settings) => void
}

function generateId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const today = new Date()
const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

interface EditState {
  id: string
  name: string
  role: 'captain' | 'member'
  paymentType: PaymentType
  monthlyDues: string
  annualDues: string
  aliases: string
  joinDate: string
  exempt: boolean
  duesRules: MemberDuesRule[]
}

export default function MemberManager({ members, setMembers, settings, setSettings }: Props) {
  const { isAdmin } = useAdmin()
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<EditState, 'id'>>({
    name: '',
    role: 'member',
    paymentType: 'monthly',
    monthlyDues: String(settings.defaultMonthlyDues),
    annualDues: '',
    aliases: '',
    joinDate: thisMonth,
    exempt: false,
    duesRules: [],
  })
  const [editForm, setEditForm] = useState<EditState | null>(null)
  const [aliasInput, setAliasInput] = useState('')

  function startAdd() {
    setForm({
      name: '',
      role: 'member',
      paymentType: 'monthly',
      monthlyDues: String(settings.defaultMonthlyDues),
      annualDues: '',
      aliases: '',
      joinDate: thisMonth,
      exempt: false,
      duesRules: [],
    })
    setAliasInput('')
    setAdding(true)
  }

  function saveAdd() {
    if (!form.name.trim()) return
    const aliases = aliasInput
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const monthlyDues = parseInt(form.monthlyDues) || settings.defaultMonthlyDues
    const newMember: Member = {
      id: generateId(),
      name: form.name.trim(),
      role: form.role,
      paymentType: form.paymentType,
      monthlyDues,
      annualDues: form.paymentType === 'annual' && form.annualDues
        ? parseInt(form.annualDues) || undefined
        : undefined,
      aliases,
      active: true,
      joinDate: form.joinDate || thisMonth,
    }
    setMembers([...members, newMember])
    setAdding(false)
  }

  function startEdit(m: Member) {
    setEditId(m.id)
    setEditForm({
      id: m.id,
      name: m.name,
      role: m.role,
      paymentType: m.paymentType ?? 'monthly',
      monthlyDues: String(m.monthlyDues),
      annualDues: m.annualDues ? String(m.annualDues) : '',
      aliases: m.aliases.join(', '),
      joinDate: m.joinDate,
      exempt: m.exempt ?? false,
      duesRules: m.duesRules ? [...m.duesRules] : [],
    })
  }

  function saveEdit() {
    if (!editForm) return
    const aliases = editForm.aliases
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    // 유효한 규칙만 (시작월 입력된 것), 시작월순 정렬
    const duesRules = editForm.duesRules
      .filter((r) => r.fromMonth)
      .map((r) => ({
        ...r,
        toMonth: r.toMonth || undefined,
        monthlyDues: r.monthlyDues || 0,
        note: r.note?.trim() || undefined,
      }))
      .sort((a, b) => (a.fromMonth > b.fromMonth ? 1 : -1))
    setMembers(
      members.map((m) =>
        m.id === editForm.id
          ? {
              ...m,
              name: editForm.name.trim(),
              role: editForm.role,
              paymentType: editForm.paymentType,
              monthlyDues: parseInt(editForm.monthlyDues) || m.monthlyDues,
              annualDues: editForm.paymentType === 'annual' && editForm.annualDues
                ? parseInt(editForm.annualDues) || undefined
                : undefined,
              aliases,
              joinDate: editForm.joinDate,
              exempt: editForm.exempt || undefined,
              duesRules: duesRules.length > 0 ? duesRules : undefined,
            }
          : m
      )
    )
    setEditId(null)
  }

  function updateRule(idx: number, patch: Partial<MemberDuesRule>) {
    if (!editForm) return
    const rules = editForm.duesRules.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    setEditForm({ ...editForm, duesRules: rules })
  }

  function addRule() {
    if (!editForm) return
    setEditForm({
      ...editForm,
      duesRules: [...editForm.duesRules, { fromMonth: '', monthlyDues: 0, note: '' }],
    })
  }

  function removeRule(idx: number) {
    if (!editForm) return
    setEditForm({ ...editForm, duesRules: editForm.duesRules.filter((_, i) => i !== idx) })
  }

  function toggleActive(id: string) {
    setMembers(members.map((m) => (m.id === id ? { ...m, active: !m.active } : m)))
  }

  function removeMember(id: string) {
    if (!confirm('정말 삭제하시겠습니까? 관련 납입 데이터는 유지됩니다.')) return
    setMembers(members.filter((m) => m.id !== id))
  }

  const active = members.filter((m) => m.active)
  const inactive = members.filter((m) => !m.active)

  return (
    <div className="space-y-6">
      {isAdmin && (
      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">기본 설정</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">팀 이름</label>
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={settings.teamName}
              onChange={(e) => setSettings({ ...settings, teamName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">기본 월 회비 (원)</label>
            <input
              type="number"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={settings.defaultMonthlyDues}
              onChange={(e) =>
                setSettings({ ...settings, defaultMonthlyDues: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {/* 회비 시작월 설정 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-3">
            회비 납입 시작월
            <span className="text-gray-400 font-normal ml-1">
              — 이 달 이전은 다른 통장 사용 등으로 미납 체크 안 함
            </span>
          </p>
          <div className="sm:w-1/2">
            <input
              type="month"
              className="border rounded-lg px-3 py-2 text-sm w-full"
              value={settings.duesStartMonth ?? ''}
              onChange={(e) =>
                setSettings({ ...settings, duesStartMonth: e.target.value || undefined })
              }
            />
            <p className="text-xs text-gray-400 mt-1">
              예: 2026-03 → 1·2월은 미납자 없이 납입 처리됩니다
            </p>
          </div>
        </div>

        {/* 리그비 추가 징수 설정 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-600 mb-3">
            리그비 추가 징수 설정
            <span className="text-gray-400 font-normal ml-1">
              — 특정 월부터 회비에 포함해서 내년 리그비를 걷는 경우
            </span>
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">추가 징수 시작월</label>
              <input
                type="month"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={settings.leagueFeeStartMonth ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, leagueFeeStartMonth: e.target.value || undefined })
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                일시납 멤버는 이 달 이전까지만 일시납으로 표시됩니다
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">월 추가 리그비 (원)</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                placeholder="예: 10000"
                value={settings.monthlyLeagueFee ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    monthlyLeagueFee: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
              />
              <p className="text-xs text-gray-400 mt-1">
                월납은 (기본 회비 + 이 금액)이 required로 계산됩니다
              </p>
            </div>
          </div>
        </div>
      </div>

      )}

      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">
            팀원 목록 <span className="text-xs text-gray-400 font-normal">({active.length}명 활동중)</span>
          </h2>
          {isAdmin && (
            <button
              onClick={startAdd}
              className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
            >
              <UserPlus size={15} /> 팀원 추가
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
            <p className="text-sm font-medium text-blue-700">새 팀원 추가</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">이름 *</label>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  placeholder="홍길동"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">역할</label>
                <select
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'captain' | 'member' })}
                >
                  <option value="member">팀원</option>
                  <option value="captain">주장/임원</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">납입 방식</label>
                <select
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.paymentType}
                  onChange={(e) => setForm({ ...form, paymentType: e.target.value as PaymentType })}
                >
                  <option value="monthly">월납</option>
                  <option value="annual">일시납 (연간)</option>
                </select>
              </div>
              {form.paymentType === 'monthly' ? (
                <div>
                  <label className="text-xs text-gray-500">월 회비 (원)</label>
                  <input
                    type="number"
                    className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                    value={form.monthlyDues}
                    onChange={(e) => setForm({ ...form, monthlyDues: e.target.value })}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-500">연간 납입액 (원)</label>
                  <input
                    type="number"
                    className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                    placeholder={String(parseInt(form.monthlyDues || '0') * 12 || settings.defaultMonthlyDues * 12)}
                    value={form.annualDues}
                    onChange={(e) => setForm({ ...form, annualDues: e.target.value })}
                  />
                  <p className="text-xs text-gray-400 mt-0.5">비워두면 월회비×12 자동 계산</p>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500">가입 연월</label>
                <input
                  type="month"
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.joinDate}
                  onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">
                  입금자명 별칭 (쉼표로 구분, 선택사항)
                </label>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  placeholder="예: 홍길동2, 홍길동(기업은행)"
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  CSV의 입금자명이 팀원 이름과 다를 때 여기에 등록하세요.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveAdd}
                className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
              >
                <Check size={14} /> 저장
              </button>
              <button
                onClick={() => setAdding(false)}
                className="flex items-center gap-1 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                <X size={14} /> 취소
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {active.map((m) => (
            <div key={m.id} className="py-3">
              {editId === m.id && editForm ? (
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">이름</label>
                      <input
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">역할</label>
                      <select
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm({ ...editForm, role: e.target.value as 'captain' | 'member' })
                        }
                      >
                        <option value="member">팀원</option>
                        <option value="captain">주장/임원</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">납입 방식</label>
                      <select
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.paymentType}
                        onChange={(e) =>
                          setEditForm({ ...editForm, paymentType: e.target.value as PaymentType })
                        }
                      >
                        <option value="monthly">월납</option>
                        <option value="annual">일시납 (연간)</option>
                      </select>
                    </div>
                    {editForm.paymentType === 'monthly' ? (
                      <div>
                        <label className="text-xs text-gray-500">월 회비</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                          value={editForm.monthlyDues}
                          onChange={(e) => setEditForm({ ...editForm, monthlyDues: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-gray-500">연간 납입액</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                          placeholder={String(parseInt(editForm.monthlyDues) * 12)}
                          value={editForm.annualDues}
                          onChange={(e) => setEditForm({ ...editForm, annualDues: e.target.value })}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500">가입 연월</label>
                      <input
                        type="month"
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.joinDate}
                        onChange={(e) => setEditForm({ ...editForm, joinDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">입금자명 별칭 (쉼표 구분)</label>
                      <input
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.aliases}
                        onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 임의 회비 규칙 (월납 전용) */}
                  {editForm.paymentType === 'monthly' && (
                    <div className="border-t border-yellow-200 pt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.exempt}
                          onChange={(e) => setEditForm({ ...editForm, exempt: e.target.checked })}
                        />
                        <span className="font-medium text-gray-700">회비 면제 (기본)</span>
                        <span className="text-xs text-gray-400">예: 주전 포수 — 평소 면제</span>
                      </label>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-gray-600">특정월부터 회비 변경</p>
                          <button
                            onClick={addRule}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <Plus size={12} /> 규칙 추가
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-2">
                          면제 해제(5월부터 징수), 감면(부상자 1.5만원) 등을 시작월 기준으로 설정
                        </p>
                        {editForm.duesRules.length === 0 ? (
                          <p className="text-xs text-gray-300">규칙 없음</p>
                        ) : (
                          <div className="space-y-2">
                            {editForm.duesRules.map((rule, idx) => (
                              <div key={idx} className="bg-white rounded border border-gray-200 p-2 grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-3">
                                  <label className="text-[11px] text-gray-500">시작월</label>
                                  <input
                                    type="month"
                                    className="border rounded px-1.5 py-1 text-xs w-full mt-0.5"
                                    value={rule.fromMonth}
                                    onChange={(e) => updateRule(idx, { fromMonth: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-3">
                                  <label className="text-[11px] text-gray-500">종료월(선택)</label>
                                  <input
                                    type="month"
                                    className="border rounded px-1.5 py-1 text-xs w-full mt-0.5"
                                    value={rule.toMonth ?? ''}
                                    onChange={(e) => updateRule(idx, { toMonth: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-[11px] text-gray-500">월회비</label>
                                  <input
                                    type="number"
                                    disabled={rule.monthlyDues === 0}
                                    className="border rounded px-1.5 py-1 text-xs w-full mt-0.5 disabled:bg-gray-100 disabled:text-gray-400"
                                    value={rule.monthlyDues}
                                    onChange={(e) => updateRule(idx, { monthlyDues: parseInt(e.target.value) || 0 })}
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-[11px] text-gray-500 block">면제</label>
                                  <input
                                    type="checkbox"
                                    className="mt-1.5"
                                    checked={rule.monthlyDues === 0}
                                    onChange={(e) =>
                                      updateRule(idx, {
                                        monthlyDues: e.target.checked ? 0 : (settings.defaultMonthlyDues || 30000),
                                      })
                                    }
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label className="text-[11px] text-gray-500">사유</label>
                                  <input
                                    className="border rounded px-1.5 py-1 text-xs w-full mt-0.5"
                                    placeholder="부상"
                                    value={rule.note ?? ''}
                                    onChange={(e) => updateRule(idx, { note: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                  <button
                                    onClick={() => removeRule(idx)}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex items-center gap-1 text-sm bg-yellow-500 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-600"
                    >
                      <Check size={14} /> 저장
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="flex items-center gap-1 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      <X size={14} /> 취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{m.name}</span>
                      {m.role === 'captain' && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          주장
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        (m.paymentType ?? 'monthly') === 'annual'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {(m.paymentType ?? 'monthly') === 'annual' ? '일시납' : '월납'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {(m.paymentType ?? 'monthly') === 'annual'
                          ? `연 ${formatKRW(getAnnualDues(m))}`
                          : m.exempt
                          ? '면제'
                          : `월 ${formatKRW(m.monthlyDues)}`}
                      </span>
                      {m.duesRules && m.duesRules.length > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          규칙 {m.duesRules.length}
                        </span>
                      )}
                    </div>
                    {m.duesRules && m.duesRules.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.duesRules.map((r) =>
                          `${r.fromMonth}~${r.toMonth ?? ''} ${r.monthlyDues === 0 ? '면제' : formatKRW(r.monthlyDues)}${r.note ? `(${r.note})` : ''}`
                        ).join(' · ')}
                      </p>
                    )}
                    {m.aliases.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        별칭: {m.aliases.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">가입: {m.joinDate}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(m.id)}
                        className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded text-xs"
                      >
                        비활성
                      </button>
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {active.length === 0 && !adding && (
            <p className="text-sm text-gray-400 py-4 text-center">
              팀원을 추가해주세요.
            </p>
          )}
        </div>

        {isAdmin && inactive.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 font-medium mb-2">비활성 팀원</p>
            <div className="flex flex-wrap gap-2">
              {inactive.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggleActive(m.id)}
                  className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full hover:bg-gray-200"
                >
                  {m.name} (복귀)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
