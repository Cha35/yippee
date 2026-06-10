import { useState } from 'react'
import { Trash2, Edit2, Check, X, UserPlus } from 'lucide-react'
import type { Member, Settings } from '../types'
import { formatKRW } from '../utils/calculations'

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
  monthlyDues: string
  aliases: string
  joinDate: string
}

export default function MemberManager({ members, setMembers, settings, setSettings }: Props) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<EditState, 'id'>>({
    name: '',
    role: 'member',
    monthlyDues: String(settings.defaultMonthlyDues),
    aliases: '',
    joinDate: thisMonth,
  })
  const [editForm, setEditForm] = useState<EditState | null>(null)
  const [aliasInput, setAliasInput] = useState('')

  function startAdd() {
    setForm({
      name: '',
      role: 'member',
      monthlyDues: String(settings.defaultMonthlyDues),
      aliases: '',
      joinDate: thisMonth,
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
    const newMember: Member = {
      id: generateId(),
      name: form.name.trim(),
      role: form.role,
      monthlyDues: parseInt(form.monthlyDues) || settings.defaultMonthlyDues,
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
      monthlyDues: String(m.monthlyDues),
      aliases: m.aliases.join(', '),
      joinDate: m.joinDate,
    })
  }

  function saveEdit() {
    if (!editForm) return
    const aliases = editForm.aliases
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    setMembers(
      members.map((m) =>
        m.id === editForm.id
          ? {
              ...m,
              name: editForm.name.trim(),
              role: editForm.role,
              monthlyDues: parseInt(editForm.monthlyDues) || m.monthlyDues,
              aliases,
              joinDate: editForm.joinDate,
            }
          : m
      )
    )
    setEditId(null)
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
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-700">
            팀원 목록 <span className="text-xs text-gray-400 font-normal">({active.length}명 활동중)</span>
          </h2>
          <button
            onClick={startAdd}
            className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
          >
            <UserPlus size={15} /> 팀원 추가
          </button>
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
                <label className="text-xs text-gray-500">월 회비 (원)</label>
                <input
                  type="number"
                  className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                  value={form.monthlyDues}
                  onChange={(e) => setForm({ ...form, monthlyDues: e.target.value })}
                />
              </div>
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
                      <label className="text-xs text-gray-500">월 회비</label>
                      <input
                        type="number"
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.monthlyDues}
                        onChange={(e) => setEditForm({ ...editForm, monthlyDues: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">가입 연월</label>
                      <input
                        type="month"
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.joinDate}
                        onChange={(e) => setEditForm({ ...editForm, joinDate: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">입금자명 별칭 (쉼표 구분)</label>
                      <input
                        className="border rounded px-2 py-1.5 text-sm w-full mt-1"
                        value={editForm.aliases}
                        onChange={(e) => setEditForm({ ...editForm, aliases: e.target.value })}
                      />
                    </div>
                  </div>
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
                      <span className="text-xs text-gray-500">
                        월 {formatKRW(m.monthlyDues)}
                      </span>
                    </div>
                    {m.aliases.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        별칭: {m.aliases.join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">가입: {m.joinDate}</p>
                  </div>
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

        {inactive.length > 0 && (
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
