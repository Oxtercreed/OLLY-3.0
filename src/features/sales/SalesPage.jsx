import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeft, Trash2, Pencil, Printer, Search, TrendingUp, Wallet, ArrowDownLeft, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { Card, KPICard } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { FilterChips } from '../../components/ui/FilterChips'
import { useToast } from '../../components/ui/Toast'
import { useLanguage } from '../../i18n/LanguageContext'
import { SelectionCard } from '../../components/ui/SelectionCard'
import { PeriodPicker, getPeriodRange } from '../../components/ui/PeriodPicker'
import { deleteSale } from '../../services/salesService'
import { cn } from '../../utils/cn'

export default function SalesPage() {
  const { t, lang } = useLanguage()
  const { addToast } = useToast()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customers, setCustomers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editForm, setEditForm] = useState({ customer_id: null, payment_method: 'cash', paid_amount: 0, payment_status: 'paid' })

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('id, invoice_number, sale_date, total_amount, paid_amount, payment_status, payment_method, cogs_amount, customer_id, notes, customers(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) console.error('Error loading sales:', error)
    setSales(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('customers').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  async function openDetail(s) {
    setSelected(s)
    const { data } = await supabase
      .from('sale_items')
      .select('quantity, unit_price, unit_cost, products(name)')
      .eq('sale_id', s.id)
    setItems(data || [])
  }

  function openEdit() {
    if (!selected) return
    setEditForm({
      customer_id: selected.customer_id || null,
      payment_method: selected.payment_method || 'cash',
      paid_amount: Number(selected.paid_amount || 0),
      payment_status: selected.payment_status || 'paid',
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    try {
      const paid = Number(editForm.paid_amount) || 0
      const total = Number(selected.total_amount)
      let status = editForm.payment_status
      if (editForm.payment_method === 'credit' && paid <= 0) status = 'pending'
      else if (paid >= total) status = 'paid'
      else if (paid > 0) status = 'partial'
      else status = 'pending'

      const { error } = await supabase.from('sales').update({
        customer_id: editForm.customer_id,
        payment_method: editForm.payment_method,
        paid_amount: paid,
        payment_status: status,
        updated_at: new Date().toISOString(),
      }).eq('id', selected.id)
      if (error) throw error
      addToast(lang === 'sw' ? 'Uuzaji umesasishwa' : 'Sale updated')
      setEditing(false)
      const updated = { ...selected, ...editForm, paid_amount: paid, payment_status: status,
        customers: customers.find((c) => c.id === editForm.customer_id)
          ? { name: customers.find((c) => c.id === editForm.customer_id).name }
          : null }
      setSelected(updated)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    try {
      const { error } = await deleteSale(selected.id)
      if (error) throw error
      addToast(t('saleDeleted'))
      setConfirmDelete(false)
      setSelected(null)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  function handleCopyReceipt() {
    if (!selected) return
    const lines = [
      `============================`,
      `OLLY - SALES RECEIPT`,
      `Invoice: ${selected.invoice_number}`,
      `Date: ${selected.sale_date}`,
      `Customer: ${selected.customers?.name || t('walkIn')}`,
      `============================`,
      ...items.map(
        (i) =>
          `${i.products?.name || 'Item'} x ${i.quantity} = ${formatMoney(Number(i.quantity) * Number(i.unit_price))}`
      ),
      `----------------------------`,
      `Total: ${formatMoney(selected.total_amount)}`,
      `Paid: ${formatMoney(selected.paid_amount)} (${selected.payment_method?.replace('_', ' ')})`,
      `Balance: ${formatMoney(Math.max(0, Number(selected.total_amount) - Number(selected.paid_amount)))}`,
      `Status: ${selected.payment_status?.toUpperCase()}`,
      `============================`,
      `Thank you for your business!`,
    ]
    navigator.clipboard?.writeText(lines.join('\n'))
    addToast(lang === 'sw' ? 'Muhtasari wa risiti umenakiliwa!' : 'Receipt copied to clipboard!')
  }

  function getCustomerName(s) {
    if (s?.customers?.name) return s.customers.name
    if (s?.notes) {
      if (s.notes.includes(' · ')) {
        const parts = s.notes.split(' · ')
        return parts[parts.length - 1]
      }
    }
    return t('walkIn')
  }

  const range = getPeriodRange(period, customFrom, customTo)
  const filtered = sales.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const inv = (s.invoice_number || '').toLowerCase()
      const cust = getCustomerName(s).toLowerCase()
      const notes = (s.notes || '').toLowerCase()
      if (!inv.includes(q) && !cust.includes(q) && !notes.includes(q)) return false
    }
    if (filter === 'paid' && s.payment_status !== 'paid') return false
    if (filter === 'credit' && s.payment_status !== 'pending' && s.payment_status !== 'partial') return false
    if (range.from && s.sale_date < range.from) return false
    if (range.to && s.sale_date > range.to) return false
    return true
  })

  const totalSalesAmount = filtered.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
  const totalPaidAmount = filtered.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0)
  const totalOutstanding = filtered.reduce((sum, s) => sum + Math.max(0, Number(s.total_amount || 0) - Number(s.paid_amount || 0)), 0)
  const totalProfit = filtered.reduce((sum, s) => sum + (Number(s.total_amount || 0) - Number(s.cogs_amount || 0)), 0)

  const chips = [
    { id: 'all', label: lang === 'sw' ? 'Zote' : 'All' },
    { id: 'paid', label: lang === 'sw' ? 'Zimelipwa' : 'Paid' },
    { id: 'credit', label: lang === 'sw' ? 'Mkopo' : 'Credit / partial' },
  ]

  if (selected) {
    const gross = Number(selected.total_amount) - Number(selected.cogs_amount || 0)
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-[#707070] mb-4 hover:text-[#181818]">
          <ArrowLeft className="w-4 h-4" /> {t('sales')}
        </button>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{selected.invoice_number}</h1>
            <p className="text-sm text-[#707070] mt-0.5">
              {selected.sale_date} · {getCustomerName(selected)}
              {selected.notes ? ` (${selected.notes})` : ''}
            </p>
          </div>
          <StatusBadge status={selected.payment_status} />
        </div>
        <Card className="mb-4 space-y-3">
          {items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{i.products?.name} × {i.quantity}</span>
              <span className="tabular-nums">{formatMoney(Number(i.quantity) * Number(i.unit_price))}</span>
            </div>
          ))}
          <div className="border-t border-[#E8E8E5] pt-3 flex justify-between font-semibold">
            <span>{t('total')}</span>
            <span className="tabular-nums">{formatMoney(selected.total_amount)}</span>
          </div>
          <div className="flex justify-between text-sm text-[#707070]">
            <span>COGS</span>
            <span className="tabular-nums">{formatMoney(selected.cogs_amount || 0)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium text-[#3F8065]">
            <span>{t('grossProfit')}</span>
            <span className="tabular-nums">{formatMoney(gross)}</span>
          </div>
          <div className="flex justify-between text-sm text-[#707070]">
            <span>{t('payment')}</span>
            <span className="capitalize">{selected.payment_method?.replace('_', ' ')} · {formatMoney(selected.paid_amount)}</span>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="secondary" className="flex-1 min-w-[130px]" onClick={handleCopyReceipt}>
            <Printer className="w-4 h-4" /> {lang === 'sw' ? 'Nakili Risiti' : 'Copy Receipt'}
          </Button>
          <Button variant="secondary" className="flex-1 min-w-[100px]" onClick={openEdit}>
            <Pencil className="w-4 h-4" /> {t('edit')}
          </Button>
          <Button variant="secondary" className="flex-1 min-w-[100px] text-[#B4534A]" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" /> {t('delete')}
          </Button>
        </div>
        <p className="text-xs text-[#707070] text-center">
          {lang === 'sw'
            ? 'Hariri malipo au mteja. Ikiwa bidhaa zilikosewa, futa na unda uuzaji mpya.'
            : 'Edit payment or customer. If products were wrong, delete and record a new sale.'}
        </p>

        <Modal open={editing} onClose={() => setEditing(false)} title={lang === 'sw' ? 'Hariri uuzaji' : 'Edit sale'}>
          <div className="space-y-3">
            <p className="text-sm text-[#707070]">{lang === 'sw' ? 'Mteja' : 'Customer'}</p>
            <SelectionCard title={t('walkIn')} selected={!editForm.customer_id}
              onClick={() => setEditForm({ ...editForm, customer_id: null })} />
            {customers.map((c) => (
              <SelectionCard key={c.id} title={c.name} selected={editForm.customer_id === c.id}
                onClick={() => setEditForm({ ...editForm, customer_id: c.id })} />
            ))}
            <p className="text-sm text-[#707070] pt-2">{t('payment')}</p>
            <div className="grid grid-cols-2 gap-2">
              {['cash', 'mobile_money', 'bank', 'credit'].map((m) => (
                <SelectionCard key={m}
                  title={m === 'mobile_money' ? t('mobileMoney') : t(m) || m}
                  selected={editForm.payment_method === m}
                  onClick={() => setEditForm({ ...editForm, payment_method: m })} />
              ))}
            </div>
            <Input label={lang === 'sw' ? 'Kiasi kilicholipwa' : 'Amount paid'} type="number"
              value={editForm.paid_amount}
              onChange={(e) => setEditForm({ ...editForm, paid_amount: e.target.value })} />
            <Button className="w-full" loading={saving} onClick={saveEdit}>{t('save')}</Button>
          </div>
        </Modal>

        <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('delete')}>
          <p className="text-sm text-[#707070] mb-4">{t('confirmDeleteSale')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
            <Button className="flex-1 !bg-[#B4534A]" loading={deleting} onClick={handleDelete}>{t('delete')}</Button>
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sales')}</h1>
          <p className="text-sm text-[#707070] mt-0.5">{lang === 'sw' ? 'Rekodi na fuatilia mauzo' : 'Record and track sales'}</p>
        </div>
        <Link to="/sales/new"><Button><Plus className="w-4 h-4" /> {t('newSale')}</Button></Link>
      </div>

      <div className="space-y-3 mb-5">
        <PeriodPicker
          value={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={(f, to) => { setCustomFrom(f); setCustomTo(to) }}
        />
        <FilterChips options={chips} value={filter} onChange={setFilter} />

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#707070] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-[#E8E8E5] text-sm bg-white focus:outline-none focus:border-[#181818]"
            placeholder={lang === 'sw' ? 'Tafuta mteja au namba ya risiti...' : 'Search by customer or invoice #...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707070] hover:text-[#181818]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      {!loading && sales.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
          <KPICard
            label={lang === 'sw' ? 'Jumla ya Mauzo' : 'Total sales'}
            value={formatMoney(totalSalesAmount)}
            icon={TrendingUp}
            subtext={`${filtered.length} ${filtered.length === 1 ? (lang === 'sw' ? 'uuzaji' : 'order') : (lang === 'sw' ? 'mauzo' : 'orders')}`}
          />
          <KPICard
            label={lang === 'sw' ? 'Yaliyolipwa' : 'Paid / Collected'}
            value={formatMoney(totalPaidAmount)}
            icon={Wallet}
            subtext={lang === 'sw' ? 'Mkusanyiko' : 'Inflow'}
          />
          <KPICard
            label={lang === 'sw' ? 'Deni / Mkopo' : 'Unpaid (Mkopo)'}
            value={formatMoney(totalOutstanding)}
            icon={ArrowDownLeft}
            subtext={lang === 'sw' ? 'Linadaiwa' : 'Outstanding'}
          />
          <KPICard
            label={lang === 'sw' ? 'Faida Ghafi' : 'Gross profit'}
            value={formatMoney(totalProfit)}
            icon={BarChart3}
            subtext={totalSalesAmount > 0 ? `${Math.round((totalProfit / totalSalesAmount) * 100)}% margin` : '0% margin'}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#707070] mb-4">{sales.length === 0 ? t('noSales') : (lang === 'sw' ? 'Hakuna katika kichujio hiki' : 'Nothing in this filter')}</p>
          {sales.length === 0 && <Link to="/sales/new"><Button>{t('recordFirstSale')}</Button></Link>}
        </Card>
      ) : (
        <>
          <div className="hidden md:block bg-white border border-[#E8E8E5] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E5] text-left text-[#707070]">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium text-right">{t('total')}</th>
                  <th className="px-5 py-3 font-medium">{t('payment')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => openDetail(s)} className="border-b border-[#E8E8E5] last:border-0 hover:bg-[#F7F7F5] cursor-pointer">
                    <td className="px-5 py-3.5">{s.sale_date}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{getCustomerName(s)}</div>
                      {s.notes && <div className="text-xs text-[#707070] truncate max-w-xs">{s.notes}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-[#707070]">{s.invoice_number}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-medium">{formatMoney(s.total_amount)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={s.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {filtered.map((s) => (
              <button key={s.id} onClick={() => openDetail(s)} className="w-full text-left">
                <Card className="!p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm sm:text-base text-[#181818] truncate">{getCustomerName(s)}</p>
                      <p className="text-xs text-[#707070] mt-0.5 truncate">{s.sale_date} · {s.invoice_number}</p>
                      {s.notes && <p className="text-xs text-[#707070] mt-0.5 truncate">{s.notes}</p>}
                    </div>
                    <p className="font-semibold tabular-nums text-sm sm:text-base text-[#181818] whitespace-nowrap shrink-0 text-right">
                      {formatMoney(s.total_amount)}
                    </p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <StatusBadge status={s.payment_status} />
                    <span className="text-xs text-[#707070] capitalize">
                      {s.payment_method?.replace('_', ' ')}
                    </span>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
