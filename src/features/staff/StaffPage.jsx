import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'
import { Navigate } from 'react-router-dom'

const MODULES = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'production', label: 'Production' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Customers' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'finance', label: 'Finance / money' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
  { id: 'staff', label: 'Manage staff' },
]

const DEFAULT_STAFF_PERMS = {
  sales: true, orders: true, purchases: true, production: true, inventory: true,
  customers: true, suppliers: true, finance: false, payroll: false,
  reports: true, settings: false, staff: false,
}

export default function StaffPage() {
  const { isAdmin, can } = useAuth()
  const { addToast } = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ full_name: '', email: '', permissions: { ...DEFAULT_STAFF_PERMS } })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('staff_members').select('*').order('created_at')
    setList(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!isAdmin && !can('staff')) return <Navigate to="/" replace />

  function startAdd() {
    setEdit(null)
    setForm({ full_name: '', email: '', permissions: { ...DEFAULT_STAFF_PERMS } })
    setOpen(true)
  }

  function startEdit(s) {
    setEdit(s)
    setForm({
      full_name: s.full_name,
      email: s.email,
      permissions: { ...DEFAULT_STAFF_PERMS, ...(s.permissions || {}) },
    })
    setOpen(true)
  }

  async function save() {
    if (!form.full_name.trim() || !form.email.trim()) return
    setSaving(true)
    try {
      if (edit) {
        const { error } = await supabase.from('staff_members').update({
          full_name: form.full_name.trim(),
          permissions: form.permissions,
          updated_at: new Date().toISOString(),
        }).eq('id', edit.id)
        if (error) throw error
        addToast('Staff updated')
      } else {
        const { error } = await supabase.from('staff_members').insert({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          role: 'staff',
          permissions: form.permissions,
        })
        if (error) throw error
        addToast('Staff invited — they sign up with this email')
      }
      setOpen(false)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s) {
    if (s.role === 'admin') return
    await supabase.from('staff_members').update({ is_active: !s.is_active }).eq('id', s.id)
    await load()
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-[#707070] mt-0.5">Admin controls who can see and edit what</p>
        </div>
        <Button onClick={startAdd} className="shrink-0 whitespace-nowrap"><Plus className="w-4 h-4" /> Add staff</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <Card key={s.id} className="!p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#181818] truncate">{s.full_name}</p>
                  <p className="text-sm text-[#707070] truncate">{s.email}</p>
                  <span className={cn(
                    'inline-block mt-2 text-xs px-2.5 py-0.5 rounded-full capitalize font-medium',
                    s.role === 'admin' ? 'bg-[#181818] text-white' : 'bg-[#E8E8E5] text-[#707070]'
                  )}>
                    {s.role}{!s.is_active ? ' · inactive' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                  {s.role !== 'admin' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(s)} className="text-xs sm:text-sm">
                        Permissions
                      </Button>
                      <button
                        type="button"
                        onClick={() => toggleActive(s)}
                        className={cn(
                          'h-9 px-3 text-xs sm:text-sm rounded-[10px] font-medium transition-all duration-150 cursor-pointer shadow-2xs shrink-0',
                          s.is_active
                            ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] hover:bg-[#FEE2E2] hover:border-[#F87171] active:scale-[0.98]'
                            : 'bg-[#F0FDF4] text-[#16A34A] border border-[#86EFAC] hover:bg-[#DCFCE7] active:scale-[0.98]'
                        )}
                      >
                        {s.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? 'Edit staff permissions' : 'Add staff'} size="lg">
        <div className="space-y-3">
          <Input label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Email (they sign up with this)" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!edit} />
          <p className="text-sm font-medium pt-2">What can they access?</p>
          <div className="grid grid-cols-2 gap-2">
            {MODULES.map((m) => (
              <label key={m.id} className={cn(
                'flex items-center gap-2 p-3 rounded-xl border text-sm cursor-pointer',
                form.permissions[m.id] ? 'border-[#181818] bg-[#F7F7F5]' : 'border-[#E8E8E5]'
              )}>
                <input
                  type="checkbox"
                  checked={!!form.permissions[m.id]}
                  onChange={(e) => setForm({
                    ...form,
                    permissions: { ...form.permissions, [m.id]: e.target.checked },
                  })}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-[#707070]">
            Tip: leave Finance & Payroll off for production staff so they cannot see or change money.
          </p>
          <Button className="w-full" loading={saving} disabled={!form.full_name.trim() || !form.email.trim()} onClick={save}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  )
}
