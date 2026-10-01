import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { cn } from '../../utils/cn'

export default function PayrollPage() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [message, setMessage] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newSalary, setNewSalary] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase.from('employees').select('*').eq('is_active', true).order('name')
    setEmployees(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addEmployee() {
    if (!newName.trim() || !newSalary) return
    setSaving(true)
    try {
      await supabase.from('employees').insert({
        name: newName.trim(),
        role: newRole.trim() || null,
        salary: Number(newSalary),
      })
      setShowAdd(false)
      setNewName(''); setNewRole(''); setNewSalary('')
      await load()
    } catch (e) {
      setMessage(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function payEmployee(emp) {
    setPaying(emp.id)
    setMessage(null)
    try {
      const period = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const { data: run, error: rErr } = await supabase.from('payroll_runs').insert({
        period_label: period,
        period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        period_end: new Date().toISOString().slice(0, 10),
        total_amount: emp.salary,
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).select().single()
      if (rErr) throw rErr

      await supabase.from('payroll_items').insert({
        payroll_run_id: run.id,
        employee_id: emp.id,
        base_salary: emp.salary,
        status: 'paid',
      })

      await supabase.from('ledger_entries').insert({
        entry_type: 'payroll',
        amount: emp.salary,
        description: `Salary — ${emp.name} (${period})`,
        reference_type: 'payroll',
        reference_id: run.id,
        entry_date: new Date().toISOString().slice(0, 10),
      })

      setMessage(`Paid ${emp.name} ${formatMoney(emp.salary)}`)
    } catch (e) {
      setMessage(e.message)
    } finally {
      setPaying(null)
    }
  }

  const total = employees.reduce((s, e) => s + Number(e.salary || 0), 0)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-sm text-[#707070] mt-0.5">Employees and salary payments</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>Add employee</Button>
      </div>

      {showAdd && (
        <Card className="mb-6 space-y-3">
          <input className="w-full h-11 px-4 rounded-xl border border-[#E8E8E5]" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="w-full h-11 px-4 rounded-xl border border-[#E8E8E5]" placeholder="Role" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          <input type="number" className="w-full h-11 px-4 rounded-xl border border-[#E8E8E5] tabular-nums" placeholder="Monthly salary TZS" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button loading={saving} onClick={addEmployee} disabled={!newName.trim() || !newSalary}>Save</Button>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <p className="text-sm text-[#707070]">Monthly payroll total</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{formatMoney(total)}</p>
        <p className="text-xs text-[#707070] mt-1">{employees.length} active employees</p>
      </Card>

      {message && (
        <div className="mb-4 p-3 rounded-xl bg-[#3F8065]/10 text-[#3F8065] text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {message}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : (
        <div className="space-y-3">
          {employees.map((e) => (
            <div
              key={e.id}
              className="bg-white border border-[#E8E8E5] rounded-2xl p-4 sm:p-5 flex flex-row items-center justify-between gap-3 transition-all duration-200 hover:border-[#D0D0CA] hover:shadow-xs"
            >
              <div className="min-w-0">
                <p className="font-semibold text-base text-[#181818] truncate">{e.name}</p>
                <p className="text-xs text-[#707070] mt-0.5 truncate">{e.role || 'Staff'}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="font-semibold tabular-nums text-sm sm:text-base text-[#181818] whitespace-nowrap">
                  {formatMoney(e.salary)}
                </p>
                <Button
                  size="sm"
                  className="h-9 px-3.5 rounded-xl font-medium shrink-0"
                  loading={paying === e.id}
                  onClick={() => payEmployee(e)}
                >
                  Pay
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
