import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Package, Wallet, ArrowDownLeft, ShoppingBag, Search, Trash2, Printer, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { FilterChips } from '../../components/ui/FilterChips'
import { Button } from '../../components/ui/Button'
import { Card, KPICard } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useLanguage } from '../../i18n/LanguageContext'
import { deletePurchase } from '../../services/purchaseService'

export default function PurchasesPage() {
  const { lang } = useLanguage()
  const { addToast } = useToast()
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Detail / modal state
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchases')
      .select('id, purchase_date, invoice_number, total_amount, paid_amount, payment_status, payment_method, notes, suppliers(id, name, phone)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) console.error('Error loading purchases:', error)
    setPurchases(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function openDetail(p) {
    setSelected(p)
    setLoadingItems(true)
    const { data, error } = await supabase
      .from('purchase_items')
      .select('quantity, unit_cost, products(name, unit, type)')
      .eq('purchase_id', p.id)
    if (error) console.error('Error loading purchase items:', error)
    setItems(data || [])
    setLoadingItems(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    try {
      const { success, error } = await deletePurchase(selected.id)
      if (error) throw error
      addToast(lang === 'sw' ? 'Ununuzi umefutwa' : 'Purchase deleted')
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
      `OLLY - PURCHASE RECEIPT`,
      `Invoice: ${selected.invoice_number}`,
      `Date: ${selected.purchase_date}`,
      `Supplier: ${selected.suppliers?.name || 'Local Market / Walk-in'}`,
      `============================`,
      ...items.map(
        (i) =>
          `${i.products?.name || 'Item'} x ${i.quantity} ${i.products?.unit || ''} = ${formatMoney(
            Number(i.quantity) * Number(i.unit_cost)
          )}`
      ),
      `----------------------------`,
      `Total: ${formatMoney(selected.total_amount)}`,
      `Paid: ${formatMoney(selected.paid_amount)} (${selected.payment_method?.replace('_', ' ')})`,
      `Balance: ${formatMoney(Math.max(0, Number(selected.total_amount) - Number(selected.paid_amount)))}`,
      `Status: ${selected.payment_status?.toUpperCase()}`,
      `============================`,
    ]
    navigator.clipboard?.writeText(lines.join('\n'))
    addToast(lang === 'sw' ? 'Muhtasari wa manunuzi umenakiliwa!' : 'Purchase receipt copied to clipboard!')
  }

  const filtered = purchases.filter((p) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const inv = (p.invoice_number || '').toLowerCase()
      const sup = (p.suppliers?.name || '').toLowerCase()
      const notes = (p.notes || '').toLowerCase()
      if (!inv.includes(q) && !sup.includes(q) && !notes.includes(q)) return false
    }
    if (filter === 'paid' && p.payment_status !== 'paid') return false
    if (filter === 'pending' && p.payment_status !== 'pending' && p.payment_status !== 'partial') return false
    return true
  })

  const totalPurchasesAmount = filtered.reduce((s, p) => s + Number(p.total_amount || 0), 0)
  const totalPaidAmount = filtered.reduce((s, p) => s + Number(p.paid_amount || 0), 0)
  const totalOutstanding = filtered.reduce(
    (s, p) => s + Math.max(0, Number(p.total_amount || 0) - Number(p.paid_amount || 0)),
    0
  )

  if (selected) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-2 text-sm text-[#707070] mb-4 hover:text-[#181818]"
        >
          <ArrowLeft className="w-4 h-4" /> {lang === 'sw' ? 'Rudi kwenye Manunuzi' : 'Back to purchases'}
        </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{selected.invoice_number}</h1>
            <p className="text-sm text-[#707070] mt-0.5">
              {selected.purchase_date} · {selected.suppliers?.name || 'Local Market / Walk-in'}
              {selected.notes ? ` (${selected.notes})` : ''}
            </p>
          </div>
          <StatusBadge status={selected.payment_status} />
        </div>

        <Card className="mb-4 space-y-3">
          {loadingItems ? (
            <div className="space-y-2 py-4">
              <div className="skeleton h-6" />
              <div className="skeleton h-6" />
            </div>
          ) : (
            items.map((i, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <div>
                  <span className="font-medium">{i.products?.name}</span>
                  <span className="text-xs text-[#707070] ml-1.5">
                    × {i.quantity} {i.products?.unit || ''} @ {formatMoney(i.unit_cost)}
                  </span>
                </div>
                <span className="tabular-nums font-medium">
                  {formatMoney(Number(i.quantity) * Number(i.unit_cost))}
                </span>
              </div>
            ))
          )}

          <div className="border-t border-[#E8E8E5] pt-3 flex justify-between font-semibold text-base">
            <span>{lang === 'sw' ? 'Jumla' : 'Total'}</span>
            <span className="tabular-nums">{formatMoney(selected.total_amount)}</span>
          </div>

          <div className="flex justify-between text-sm text-[#707070]">
            <span>{lang === 'sw' ? 'Kilicholipwa' : 'Paid amount'}</span>
            <span className="capitalize tabular-nums">
              {formatMoney(selected.paid_amount)} ({selected.payment_method?.replace('_', ' ')})
            </span>
          </div>

          {Number(selected.total_amount) > Number(selected.paid_amount) && (
            <div className="flex justify-between text-sm font-medium text-[#B4534A]">
              <span>{lang === 'sw' ? 'Salio / Deni' : 'Outstanding balance'}</span>
              <span className="tabular-nums">
                {formatMoney(Number(selected.total_amount) - Number(selected.paid_amount))}
              </span>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="secondary" className="flex-1 min-w-[130px]" onClick={handleCopyReceipt}>
            <Printer className="w-4 h-4" /> {lang === 'sw' ? 'Nakili Risiti' : 'Copy receipt'}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 min-w-[100px] text-[#B4534A]"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="w-4 h-4" /> {lang === 'sw' ? 'Futa' : 'Delete'}
          </Button>
        </div>

        <Modal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={lang === 'sw' ? 'Futa ununuzi huu?' : 'Delete this purchase?'}
        >
          <p className="text-sm text-[#707070] mb-4">
            {lang === 'sw'
              ? 'Hii itarejesha hisa za malighafi na kuondoa rekodi za malipo na leja.'
              : 'This will revert material stock movements and delete associated ledger and payment records.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {lang === 'sw' ? 'Ghairi' : 'Cancel'}
            </Button>
            <Button
              className="bg-[#B4534A] hover:bg-[#A3382F] text-white"
              loading={deleting}
              onClick={handleDelete}
            >
              {lang === 'sw' ? 'Futa kabisa' : 'Confirm delete'}
            </Button>
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lang === 'sw' ? 'Manunuzi' : 'Purchases'}
          </h1>
          <p className="text-sm text-[#707070] mt-0.5">
            {lang === 'sw' ? 'Nunua malighafi na vifaa vya kufungashia' : 'Buy raw materials and packaging'}
          </p>
        </div>
        <Link to="/purchases/new">
          <Button>
            <Plus className="w-4 h-4" /> {lang === 'sw' ? 'Ununuzi mpya' : 'New purchase'}
          </Button>
        </Link>
      </div>

      {/* KPI Cards matching Dashboard / Sales design without comparison */}
      {!loading && purchases.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-5">
          <KPICard
            label={lang === 'sw' ? 'Jumla ya Manunuzi' : 'Total purchases'}
            value={formatMoney(totalPurchasesAmount)}
            icon={Package}
            subtext={`${filtered.length} ${filtered.length === 1 ? (lang === 'sw' ? 'ununuzi' : 'order') : (lang === 'sw' ? 'manunuzi' : 'orders')}`}
          />
          <KPICard
            label={lang === 'sw' ? 'Yaliyolipwa' : 'Paid / Outflow'}
            value={formatMoney(totalPaidAmount)}
            icon={Wallet}
            subtext={lang === 'sw' ? 'Fedha zilizotolewa' : 'Disbursed outflow'}
          />
          <KPICard
            label={lang === 'sw' ? 'Deni la Wasambazaji' : 'Unpaid (Mkopo)'}
            value={formatMoney(totalOutstanding)}
            icon={ArrowDownLeft}
            subtext={lang === 'sw' ? 'Inayodaiwa na wasambazaji' : 'Payable to suppliers'}
          />
          <KPICard
            label={lang === 'sw' ? 'Aina za Vifaa' : 'Items purchased'}
            value={String(filtered.length)}
            icon={ShoppingBag}
            subtext={lang === 'sw' ? 'Rekodi za manunuzi' : 'Processed batches'}
          />
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-3 mb-5">
        <FilterChips
          options={[
            { id: 'all', label: lang === 'sw' ? 'Zote' : 'All' },
            { id: 'paid', label: lang === 'sw' ? 'Zimelipwa' : 'Paid' },
            { id: 'pending', label: lang === 'sw' ? 'Mkopo / Sehemu' : 'Unpaid / partial' },
          ]}
          value={filter}
          onChange={setFilter}
        />

        <div className="relative">
          <Search className="w-4 h-4 text-[#707070] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-[#E8E8E5] text-sm bg-white focus:outline-none focus:border-[#181818]"
            placeholder={
              lang === 'sw'
                ? 'Tafuta msambazaji au namba ya ankara...'
                : 'Search by supplier or invoice #...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#707070] hover:text-[#181818]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#707070] mb-4">
            {purchases.length === 0
              ? (lang === 'sw' ? 'Hakuna manunuzi bado' : 'No purchases yet')
              : (lang === 'sw' ? 'Hakuna katika kichujio hiki' : 'No purchases in this filter')}
          </p>
          {purchases.length === 0 && (
            <Link to="/purchases/new">
              <Button>{lang === 'sw' ? 'Weka ununuzi wa kwanza' : 'Record first purchase'}</Button>
            </Link>
          )}
        </Card>
      ) : (
        <>
          <div className="hidden md:block bg-white border border-[#E8E8E5] rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E5] text-left text-[#707070] bg-[#FAFAF8]">
                  <th className="px-5 py-3 font-medium">{lang === 'sw' ? 'Tarehe' : 'Date'}</th>
                  <th className="px-5 py-3 font-medium">{lang === 'sw' ? 'Ankara' : 'Invoice'}</th>
                  <th className="px-5 py-3 font-medium">{lang === 'sw' ? 'Msambazaji' : 'Supplier'}</th>
                  <th className="px-5 py-3 font-medium text-right">{lang === 'sw' ? 'Jumla' : 'Total'}</th>
                  <th className="px-5 py-3 font-medium">{lang === 'sw' ? 'Hali' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="border-b border-[#E8E8E5] last:border-0 hover:bg-[#F7F7F5] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5 text-[#707070]">{p.purchase_date}</td>
                    <td className="px-5 py-3.5 font-mono text-xs">{p.invoice_number || '—'}</td>
                    <td className="px-5 py-3.5 font-medium">{p.suppliers?.name || 'Local Market / Walk-in'}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-semibold">
                      {formatMoney(p.total_amount)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={p.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filtered.map((p) => (
              <Card
                key={p.id}
                onClick={() => openDetail(p)}
                className="!p-4 cursor-pointer hover:border-[#181818] transition-all"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base text-[#181818] truncate">{p.suppliers?.name || 'Local Market / Walk-in'}</p>
                    <p className="text-xs text-[#707070] mt-0.5 truncate">
                      {p.purchase_date} · {p.invoice_number || '—'}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-sm sm:text-base text-[#181818] whitespace-nowrap shrink-0 text-right">
                    {formatMoney(p.total_amount)}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-xs text-[#707070] capitalize">
                    {p.payment_method?.replace('_', ' ')}
                  </span>
                  <StatusBadge status={p.payment_status} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
