import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Check, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney, getProductStock } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { SelectionCard } from '../../components/ui/SelectionCard'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { FlowShell, FlowContinue } from '../../components/layout/FlowShell'
import { cn } from '../../utils/cn'
import { isOnline, enqueue, cacheSet, cacheGet } from '../../lib/offline'
import { recordSale } from '../../services/salesService'

export default function NewSaleFlow() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [step, setStep] = useState(0)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerType, setCustomerType] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [cart, setCart] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  async function loadCustomers() {
    const { data: c } = await supabase.from('customers').select('id, name, phone, credit_allowed').eq('is_active', true).order('name')
    setCustomers(c || [])
  }

  useEffect(() => {
    async function load() {
      await loadCustomers()
      try {
        const { data: p } = await supabase
          .from('products')
          .select('id, name, selling_price, unit, type')
          .eq('is_active', true)
          .order('name')
        const { data: bals } = await supabase.from('inventory_balances').select('product_id, quantity')
        const balMap = Object.fromEntries((bals || []).map((b) => [b.product_id, Number(b.quantity)]))
        const list = (p || [])
          .filter((item) => item.type === 'finished_good' || Number(item.selling_price) > 0)
          .map((row) => ({
            ...row,
            inventory_balances: { quantity: balMap[row.id] ?? 0 },
          }))
        setProducts(list)
        await cacheSet('products_fg', list)
      } catch {
        const cached = await cacheGet('products_fg')
        if (cached) setProducts(cached)
      }
    }
    load()
  }, [])

  const filteredCustomers = customers.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)
  )

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const prod = products.find((p) => p.id === id)
      return { ...prod, qty, lineTotal: qty * Number(prod?.selling_price || 0) }
    })
  const total = cartItems.reduce((s, i) => s + i.lineTotal, 0)

  function addToCart(id) {
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }))
  }
  function setQty(id, qty) {
    setCart((c) => {
      const next = { ...c }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  async function createCustomer() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data, error: err } = await supabase
        .from('customers')
        .insert({
          name: newName.trim(),
          phone: newPhone.trim() || null,
          credit_allowed: true,
        })
        .select()
        .single()
      if (err) throw err
      await loadCustomers()
      setCustomerType('existing')
      setSelectedCustomer(data.id)
      setShowNewCustomer(false)
      setNewName('')
      setNewPhone('')
      addToast(`Customer ${data.name} added`)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function saveSale() {
    setSaving(true)
    setError(null)
    try {
      const items = cartItems.map((i) => ({
        product_id: i.id,
        quantity: i.qty,
        unit_price: Number(i.selling_price),
      }))
      const saleData = {
        customerId: customerType === 'existing' ? selectedCustomer : null,
        items,
        paymentMethod,
        paidAmount: paymentMethod === 'credit' ? 0 : total,
      }
      if (!isOnline()) {
        await enqueue({
          type: 'sale',
          payload: {
            p_customer_id: saleData.customerId,
            p_items: items,
            p_payment_method: paymentMethod,
            p_paid_amount: saleData.paidAmount,
          },
        })
        setSuccess({ total, invoice_number: 'OFFLINE-PENDING', gross_profit: null, offline: true })
        addToast('Sale saved offline — will sync when online')
        return
      }
      const { data, error: err } = await recordSale(saleData)
      if (err) throw err
      setSuccess(data)
      addToast('Sale completed')
    } catch (e) {
      // network failure mid-request → queue
      if (!isOnline() || e.message?.includes('Failed to fetch') || e.message?.includes('Network')) {
        try {
          const items = cartItems.map((i) => ({
            product_id: i.id, quantity: i.qty, unit_price: Number(i.selling_price),
          }))
          await enqueue({
            type: 'sale',
            payload: {
              p_customer_id: customerType === 'existing' ? selectedCustomer : null,
              p_items: items,
              p_payment_method: paymentMethod,
              p_paid_amount: paymentMethod === 'credit' ? 0 : total,
            },
          })
          setSuccess({ total, invoice_number: 'OFFLINE-PENDING', offline: true })
          addToast('Sale saved offline — will sync when online')
          return
        } catch (_) {}
      }
      setError(e.message || 'Failed to save sale')
    } finally {
      setSaving(false)
    }
  }

  const canContinue =
    (step === 0 && customerType === 'walkin') ||
    (step === 0 && customerType === 'existing' && selectedCustomer) ||
    (step === 1 && cartItems.length > 0) ||
    (step === 2 && paymentMethod) ||
    step === 3

  if (success) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-[#3F8065]/10 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-[#3F8065]" />
        </div>
        <h1 className="text-xl font-semibold mb-1">Sale completed</h1>
        <p className="text-[#707070] text-sm mb-6">{formatMoney(success.total)}</p>
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 w-full max-w-sm space-y-2 text-sm mb-8">
          <div className="flex justify-between"><span className="text-[#707070]">Invoice</span><span>{success.invoice_number}</span></div>
          <div className="flex justify-between"><span className="text-[#707070]">Gross profit</span><span className="text-[#3F8065]">{formatMoney(success.gross_profit)}</span></div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/sales')}>View sales</Button>
          <Button onClick={() => navigate('/')}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <FlowShell
      title="New sale"
      stepLabel={`Step ${step + 1} of 4`}
      onBack={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
      footerHint={
        step === 1 && cartItems.length > 0 ? (
          <p className="text-sm text-[#707070] mb-2 tabular-nums">
            {cartItems.reduce((s, i) => s + i.qty, 0)} items · {formatMoney(total)}
          </p>
        ) : null
      }
      footer={
        step < 3 ? (
          <FlowContinue
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
          />
        ) : (
          <FlowContinue label="Save sale" loading={saving} onClick={saveSale} />
        )
      }
    >
      <div className="flow-enter" key={step}>
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-4">Who is buying?</h2>
            <SelectionCard title="Walk-in customer" selected={customerType === 'walkin'}
              onClick={() => { setCustomerType('walkin'); setSelectedCustomer(null) }} />
            <SelectionCard title="Existing customer" selected={customerType === 'existing'}
              onClick={() => setCustomerType('existing')} />
            {customerType === 'existing' && (
              <div className="mt-4 space-y-2">
                <input className="w-full h-11 px-4 rounded-xl border border-[#E8E8E5] text-sm"
                  placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <button type="button" onClick={() => setShowNewCustomer(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#E8E8E5] text-sm font-medium hover:bg-[#F7F7F5]">
                  <UserPlus className="w-4 h-4" /> Add new customer
                </button>
                {filteredCustomers.map((c) => (
                  <SelectionCard key={c.id} title={c.name} subtitle={c.phone || 'No phone'}
                    selected={selectedCustomer === c.id} onClick={() => setSelectedCustomer(c.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-1">What are they buying?</h2>
            <p className="text-sm text-[#707070] mb-4">Use − / number / + to set quantity (e.g. 5 jars).</p>
            {products.length === 0 && (
              <p className="text-sm text-[#B7833F]">No finished products yet. Add them in Settings and set opening stock (or produce first).</p>
            )}
            {products.map((p) => {
              const qty = cart[p.id] || 0
              const stock = getProductStock(p)
              return (
                <div key={p.id} className={cn('p-4 rounded-2xl border-2 bg-white', qty > 0 ? 'border-[#181818]' : 'border-[#E8E8E5]')}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-[#707070] tabular-nums">{formatMoney(p.selling_price)} · {stock > 0 ? `${stock} in stock` : '0 in stock — adjust or produce'}</div>
                    </div>
                    {qty === 0 ? (
                      <button type="button" onClick={() => addToCart(p.id)} disabled={stock <= 0}
                        className="w-11 h-11 rounded-xl bg-[#181818] text-white flex items-center justify-center disabled:opacity-40 shrink-0">
                        <Plus className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => setQty(p.id, qty - 1)}
                          className="w-10 h-10 rounded-xl border border-[#E8E8E5] flex items-center justify-center">
                          <Minus className="w-4 h-4" />
                        </button>
                        <input type="number" min={1} max={stock} value={qty}
                          onChange={(e) => setQty(p.id, Math.max(0, Math.min(stock, Number(e.target.value) || 0)))}
                          className="w-14 h-10 text-center font-semibold tabular-nums rounded-xl border border-[#E8E8E5]" />
                        <button type="button" onClick={() => setQty(p.id, Math.min(stock, qty + 1))} disabled={qty >= stock}
                          className="w-10 h-10 rounded-xl border border-[#E8E8E5] flex items-center justify-center disabled:opacity-40">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {qty > 0 && (
                    <div className="mt-2 text-right text-sm font-medium tabular-nums">{formatMoney(qty * Number(p.selling_price))}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-4">How are they paying?</h2>
            {['cash', 'mobile_money', 'bank', 'credit'].map((m) => (
              <SelectionCard
                key={m}
                title={m === 'mobile_money' ? 'Mobile Money' : m === 'credit' ? 'Credit (mkopo)' : m.charAt(0).toUpperCase() + m.slice(1)}
                subtitle={m === 'credit' ? 'Pay later (mkopo)' : undefined}
                selected={paymentMethod === m}
                onClick={() => { setError(null); setPaymentMethod(m) }}
              />
            ))}
            {error && <p className="text-sm text-[#B4534A]">{error}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium mb-2">Sale summary</h2>
            <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 space-y-3">
              {cartItems.map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.name} × {i.qty}</span>
                  <span className="tabular-nums">{formatMoney(i.lineTotal)}</span>
                </div>
              ))}
              <div className="border-t border-[#E8E8E5] pt-3 flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
              <div className="flex justify-between text-sm text-[#707070]">
                <span>Payment</span>
                <span className="capitalize">{paymentMethod === 'credit' ? 'Credit (mkopo)' : paymentMethod.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-sm text-[#707070]">
                <span>Customer</span>
                <span>{customerType === 'walkin' ? 'Walk-in' : customers.find((c) => c.id === selectedCustomer)?.name}</span>
              </div>
            </div>
            {error && <div className="p-3 rounded-xl bg-[#B4534A]/10 text-[#B4534A] text-sm">{error}</div>}
          </div>
        )}
      </div>

      <Modal open={showNewCustomer} onClose={() => setShowNewCustomer(false)} title="New customer">
        <div className="space-y-3">
          <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" required />
          <Input label="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+255..." />
          <p className="text-xs text-[#707070]">Phone is optional. Name is enough to keep customer records.</p>
          <Button className="w-full" loading={creating} disabled={!newName.trim()} onClick={createCustomer}>
            Add & select
          </Button>
        </div>
      </Modal>
    </FlowShell>
  )
}
