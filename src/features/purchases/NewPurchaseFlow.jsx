import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Check, Search, PlusCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { SelectionCard } from '../../components/ui/SelectionCard'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { FlowShell, FlowContinue } from '../../components/layout/FlowShell'
import { cn } from '../../utils/cn'
import { isOnline, enqueue } from '../../lib/offline'
import { recordPurchase } from '../../services/purchaseService'

const DEFAULT_SAMPLE_MATERIALS = [
  { name: 'Groundnuts', sku: 'RM-GN', type: 'raw_material', unit: 'kg', cost_price: 2500, reorder_level: 50 },
  { name: 'Sesame Seeds', sku: 'RM-SS', type: 'raw_material', unit: 'kg', cost_price: 4500, reorder_level: 30 },
  { name: 'Cooking Oil', sku: 'RM-OIL', type: 'raw_material', unit: 'L', cost_price: 3500, reorder_level: 20 },
  { name: 'Sugar', sku: 'RM-SUG', type: 'raw_material', unit: 'kg', cost_price: 2000, reorder_level: 15 },
  { name: 'Salt', sku: 'RM-SALT', type: 'raw_material', unit: 'kg', cost_price: 800, reorder_level: 5 },
  { name: '300g Jars', sku: 'PK-J300', type: 'packaging', unit: 'pcs', cost_price: 300, reorder_level: 100 },
  { name: '450g Jars', sku: 'PK-J450', type: 'packaging', unit: 'pcs', cost_price: 400, reorder_level: 100 },
  { name: '750g Jars', sku: 'PK-J750', type: 'packaging', unit: 'pcs', cost_price: 550, reorder_level: 50 },
  { name: 'Caps', sku: 'PK-CAP', type: 'packaging', unit: 'pcs', cost_price: 80, reorder_level: 200 },
  { name: 'Labels', sku: 'PK-LBL', type: 'packaging', unit: 'pcs', cost_price: 50, reorder_level: 200 },
]

export default function NewPurchaseFlow() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [step, setStep] = useState(0)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtering
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'raw_material' | 'packaging'

  // Cart: { [productId]: { qty, unitCost } }
  const [cart, setCart] = useState({})
  const [supplierType, setSupplierType] = useState('registered') // 'registered' | 'walkin'
  const [supplierId, setSupplierId] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paidAmount, setPaidAmount] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  // New item modal
  const [showNewItem, setShowNewItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemType, setNewItemType] = useState('raw_material')
  const [newItemUnit, setNewItemUnit] = useState('kg')
  const [newItemCost, setNewItemCost] = useState('')
  const [creatingItem, setCreatingItem] = useState(false)

  // New supplier modal
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [pRes, sRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, unit, cost_price, type')
          .in('type', ['raw_material', 'packaging'])
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('suppliers')
          .select('id, name, phone')
          .eq('is_active', true)
          .order('name'),
      ])

      setProducts(pRes.data || [])
      setSuppliers(sRes.data || [])
    } catch (err) {
      console.error('Failed to load purchase reference data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Auto-seed if products is empty
  async function handleSeedMaterials() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .upsert(DEFAULT_SAMPLE_MATERIALS, { onConflict: 'sku' })
        .select()
      if (error) throw error
      addToast(`Added ${data.length} sample materials & packaging items`)
      await loadData()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function createItem() {
    if (!newItemName.trim()) return
    setCreatingItem(true)
    try {
      const sku = (newItemType === 'raw_material' ? 'RM-' : 'PK-') + Date.now().toString(36).toUpperCase()
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: newItemName.trim(),
          type: newItemType,
          unit: newItemUnit.trim() || 'pcs',
          cost_price: Number(newItemCost) || 0,
          sku,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error
      addToast(`Item "${data.name}" added`)
      setShowNewItem(false)
      setNewItemName('')
      setNewItemCost('')
      await loadData()
      // Auto add to cart
      addProduct(data.id, data.cost_price)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setCreatingItem(false)
    }
  }

  async function createSupplier() {
    if (!newSupplierName.trim()) return
    setCreatingSupplier(true)
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          name: newSupplierName.trim(),
          phone: newSupplierPhone.trim() || null,
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error
      addToast(`Supplier "${data.name}" added`)
      setShowNewSupplier(false)
      setNewSupplierName('')
      setNewSupplierPhone('')
      await loadData()
      setSupplierType('registered')
      setSupplierId(data.id)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setCreatingSupplier(false)
    }
  }

  const filteredProducts = products.filter((p) => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q)
    }
    return true
  })

  const cartItems = Object.entries(cart)
    .filter(([, v]) => v.qty > 0)
    .map(([id, v]) => {
      const prod = products.find((p) => p.id === id)
      return { ...prod, qty: v.qty, unitCost: v.unitCost, lineTotal: v.qty * v.unitCost }
    })
  const total = cartItems.reduce((s, i) => s + i.lineTotal, 0)

  function addProduct(id, initialCost = null) {
    const prod = products.find((p) => p.id === id)
    const cost = initialCost !== null ? Number(initialCost) : Number(prod?.cost_price || 0)
    setCart((c) => ({
      ...c,
      [id]: c[id] || { qty: 1, unitCost: cost },
    }))
  }

  function setQty(id, qty) {
    setCart((c) => {
      const next = { ...c }
      if (qty <= 0) delete next[id]
      else next[id] = { ...next[id], qty }
      return next
    })
  }

  function setCost(id, unitCost) {
    setCart((c) => ({ ...c, [id]: { ...c[id], unitCost: Number(unitCost) || 0 } }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const items = cartItems.map((i) => ({
        product_id: i.id,
        quantity: i.qty,
        unit_cost: i.unitCost,
      }))
      const resolvedSupplierId = supplierType === 'registered' ? supplierId : null
      const purchaseData = {
        supplierId: resolvedSupplierId,
        items,
        paymentMethod,
        paidAmount: paidAmount ?? (paymentMethod === 'credit' ? 0 : total),
      }

      if (!isOnline()) {
        await enqueue({
          type: 'purchase',
          payload: {
            p_supplier_id: resolvedSupplierId,
            p_items: items,
            p_payment_method: paymentMethod,
            p_paid_amount: purchaseData.paidAmount,
          },
        })
        setSuccess({ total, offline: true })
        addToast('Purchase saved offline — will sync when online')
        return
      }

      const { data, error: err } = await recordPurchase(purchaseData)
      if (err) throw err
      setSuccess(data)
      addToast('Purchase saved')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const canContinue =
    (step === 0 && cartItems.length > 0) ||
    (step === 1 && (supplierType === 'walkin' || (supplierType === 'registered' && supplierId))) ||
    (step === 2 && paymentMethod) ||
    step === 3

  if (success) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-[#3F8065]/10 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-[#3F8065]" />
        </div>
        <h1 className="text-xl font-semibold mb-1">Purchase saved</h1>
        <p className="text-[#707070] text-sm mb-6">{formatMoney(success.total)}</p>
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 w-full max-w-sm space-y-2 text-sm mb-8">
          <div className="flex justify-between">
            <span className="text-[#707070]">Inventory</span>
            <span className="text-[#3F8065]">Stock updated</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#707070]">Payment</span>
            <span className="capitalize">{paymentMethod.replace('_', ' ')}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/purchases')}>View purchases</Button>
          <Button onClick={() => navigate('/')}>Done</Button>
        </div>
      </div>
    )
  }

  return (
    <FlowShell
      title="New purchase"
      stepLabel={`Step ${step + 1} of 4`}
      onBack={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
      footerHint={
        step === 0 && cartItems.length > 0 ? (
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
          <FlowContinue label="Save purchase" loading={saving} onClick={save} />
        )
      }
    >
      <div className="flow-enter" key={step}>
        {/* Step 0: What are you buying? */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">What are you buying?</h2>
                <p className="text-xs text-[#707070] mt-0.5">Select raw materials or packaging</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewItem(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#181818]/30 hover:border-[#181818] text-xs font-medium bg-white hover:bg-[#F7F7F5] transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add item
              </button>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#707070] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search materials or jars..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E8E8E5] text-sm bg-white focus:outline-none focus:border-[#181818]"
                />
              </div>
              <div className="flex gap-1 bg-[#F7F7F5] p-1 rounded-xl border border-[#E8E8E5] self-start sm:self-auto">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'raw_material', label: 'Raw materials' },
                  { id: 'packaging', label: 'Packaging' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
                      typeFilter === tab.id ? 'bg-white shadow-xs text-[#181818]' : 'text-[#707070] hover:text-[#181818]'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Products List */}
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}</div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-6 text-center space-y-3">
                <p className="text-sm text-[#707070]">No materials found matching this filter.</p>
                <div className="flex justify-center gap-2">
                  <Button variant="secondary" onClick={handleSeedMaterials}>
                    Add standard demo materials
                  </Button>
                  <Button onClick={() => setShowNewItem(true)}>
                    + Custom material
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredProducts.map((p) => {
                  const item = cart[p.id]
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'p-4 rounded-2xl border-2 bg-white transition-all',
                        item ? 'border-[#181818] shadow-xs' : 'border-[#E8E8E5] hover:border-[#D0D0CA]'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="font-medium text-sm sm:text-base truncate">{p.name}</div>
                          <div className="text-xs text-[#707070] capitalize mt-0.5">
                            {p.type.replace('_', ' ')} · Per {p.unit}
                          </div>
                        </div>

                        {!item ? (
                          <button
                            type="button"
                            onClick={() => addProduct(p.id)}
                            className="w-10 h-10 rounded-xl bg-[#181818] text-white flex items-center justify-center shrink-0 hover:opacity-90 active:scale-95 transition-all"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setQty(p.id, item.qty - 1)}
                              className="w-8 h-8 rounded-lg border border-[#E8E8E5] flex items-center justify-center hover:bg-[#F7F7F5]"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => setQty(p.id, Math.max(0, Number(e.target.value) || 0))}
                              className="w-12 h-8 text-center tabular-nums font-semibold rounded-lg border border-[#E8E8E5] text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setQty(p.id, item.qty + 1)}
                              className="w-8 h-8 rounded-lg border border-[#E8E8E5] flex items-center justify-center hover:bg-[#F7F7F5]"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {item && (
                        <div className="mt-3 pt-3 border-t border-[#F0F0EE] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#707070] whitespace-nowrap">Price/unit:</span>
                            <div className="relative">
                              <input
                                type="number"
                                className="h-8 w-28 px-2 rounded-lg border border-[#E8E8E5] text-sm tabular-nums"
                                value={item.unitCost}
                                onChange={(e) => setCost(p.id, e.target.value)}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-[#181818]">
                            {formatMoney(item.qty * item.unitCost)}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Who supplied it? */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-4">Who supplied it?</h2>

            <SelectionCard
              title="Local market / Walk-in supplier"
              subtitle="Cash purchase, no registered supplier ledger needed"
              selected={supplierType === 'walkin'}
              onClick={() => {
                setSupplierType('walkin')
                setSupplierId(null)
              }}
            />

            <SelectionCard
              title="Registered supplier"
              subtitle="Track payments, debt and purchase ledger"
              selected={supplierType === 'registered'}
              onClick={() => setSupplierType('registered')}
            />

            {supplierType === 'registered' && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#E8E8E5] text-sm font-medium hover:bg-[#F7F7F5]"
                >
                  <PlusCircle className="w-4 h-4" /> Add new supplier
                </button>

                {suppliers.map((s) => (
                  <SelectionCard
                    key={s.id}
                    title={s.name}
                    subtitle={s.phone || 'No phone'}
                    selected={supplierId === s.id}
                    onClick={() => setSupplierId(s.id)}
                  />
                ))}

                {suppliers.length === 0 && (
                  <p className="text-sm text-[#707070] text-center py-4">
                    No suppliers yet. Click "+ Add new supplier" above.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-1">Payment</h2>
            <p className="text-2xl font-bold tabular-nums mb-4 text-[#181818]">{formatMoney(total)}</p>

            {['cash', 'mobile_money', 'bank', 'credit'].map((m) => (
              <SelectionCard
                key={m}
                title={m === 'mobile_money' ? 'Mobile Money' : m === 'credit' ? 'Credit (Pay later)' : m.charAt(0).toUpperCase() + m.slice(1)}
                subtitle={m === 'credit' ? 'Supplier ledger debt to be paid later' : undefined}
                selected={paymentMethod === m}
                onClick={() => setPaymentMethod(m)}
              />
            ))}

            {paymentMethod !== 'credit' && (
              <div className="mt-4 bg-white border border-[#E8E8E5] rounded-2xl p-4">
                <label className="text-xs font-medium text-[#707070] uppercase tracking-wider block mb-1">
                  Amount paid now (leave blank for full {formatMoney(total)})
                </label>
                <input
                  type="number"
                  className="w-full h-11 px-4 rounded-xl border border-[#E8E8E5] tabular-nums text-sm focus:outline-none focus:border-[#181818]"
                  value={paidAmount ?? ''}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder={String(total)}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Purchase summary */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Purchase summary</h2>
            <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 space-y-3">
              {cartItems.map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>{i.name} × {i.qty} {i.unit}</span>
                  <span className="tabular-nums font-medium">{formatMoney(i.lineTotal)}</span>
                </div>
              ))}
              <div className="border-t border-[#E8E8E5] pt-3 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(total)}</span>
              </div>
              <div className="flex justify-between text-sm text-[#707070]">
                <span>Supplier</span>
                <span>
                  {supplierType === 'walkin'
                    ? 'Walk-in / Local Market'
                    : suppliers.find((s) => s.id === supplierId)?.name || 'Selected Supplier'}
                </span>
              </div>
              <div className="flex justify-between text-sm text-[#707070]">
                <span>Payment</span>
                <span className="capitalize">{paymentMethod === 'credit' ? 'Credit (Deni)' : paymentMethod.replace('_', ' ')}</span>
              </div>
            </div>
            {error && <div className="p-3 rounded-xl bg-[#B4534A]/10 text-[#B4534A] text-sm">{error}</div>}
          </div>
        )}
      </div>

      {/* Modal: New Item */}
      <Modal open={showNewItem} onClose={() => setShowNewItem(false)} title="New raw material or packaging">
        <div className="space-y-3">
          <Input
            label="Item name"
            placeholder="e.g. Sesame Seeds or 500g Jar"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            required
          />

          <div>
            <label className="text-sm text-[#707070] block mb-1">Category</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewItemType('raw_material')}
                className={cn(
                  'h-10 rounded-xl text-xs font-medium border transition-colors',
                  newItemType === 'raw_material' ? 'bg-[#181818] text-white border-[#181818]' : 'bg-white border-[#E8E8E5]'
                )}
              >
                Raw Material
              </button>
              <button
                type="button"
                onClick={() => setNewItemType('packaging')}
                className={cn(
                  'h-10 rounded-xl text-xs font-medium border transition-colors',
                  newItemType === 'packaging' ? 'bg-[#181818] text-white border-[#181818]' : 'bg-white border-[#E8E8E5]'
                )}
              >
                Packaging
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Unit (kg, L, pcs...)"
              placeholder="kg"
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
            />
            <Input
              label="Standard Cost (TZS)"
              placeholder="2500"
              type="number"
              value={newItemCost}
              onChange={(e) => setNewItemCost(e.target.value)}
            />
          </div>

          <Button className="w-full mt-2" loading={creatingItem} disabled={!newItemName.trim()} onClick={createItem}>
            Save & Add to Purchase
          </Button>
        </div>
      </Modal>

      {/* Modal: New Supplier */}
      <Modal open={showNewSupplier} onClose={() => setShowNewSupplier(false)} title="New supplier">
        <div className="space-y-3">
          <Input
            label="Supplier name"
            placeholder="e.g. Arusha Mills Co"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            required
          />
          <Input
            label="Phone (optional)"
            placeholder="+255..."
            value={newSupplierPhone}
            onChange={(e) => setNewSupplierPhone(e.target.value)}
          />
          <Button className="w-full mt-2" loading={creatingSupplier} disabled={!newSupplierName.trim()} onClick={createSupplier}>
            Save & Select
          </Button>
        </div>
      </Modal>
    </FlowShell>
  )
}
