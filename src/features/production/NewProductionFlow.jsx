import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatNumber, formatMoney, getProductStock } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { SelectionCard } from '../../components/ui/SelectionCard'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../utils/cn'

export default function NewProductionFlow() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [step, setStep] = useState(0)
  const [products, setProducts] = useState([])
  const [recipes, setRecipes] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [costMode, setCostMode] = useState(null) // 'recipe' | 'manual'
  const [qty, setQty] = useState(100)
  const [materials, setMaterials] = useState([])
  const [manualUnitCost, setManualUnitCost] = useState('')
  const [manualTotalCost, setManualTotalCost] = useState('')
  const [actualQty, setActualQty] = useState(null)
  const [wasteQty, setWasteQty] = useState(0)
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('products').select('id, name, cost_price, shelf_life_days').eq('type', 'finished_good').eq('is_active', true)
      const { data: r } = await supabase.from('recipes').select('id, product_id, yield_quantity, recipe_items(product_id, quantity, products(id, name, unit, cost_price, type, inventory_balances(quantity)))')
      setProducts(p || [])
      setRecipes(r || [])
    }
    load()
  }, [])

  function selectProduct(id) {
    setSelectedProduct(id)
    const prod = products.find((p) => p.id === id)
    if (prod?.cost_price) setManualUnitCost(String(prod.cost_price))
    if (prod?.shelf_life_days) {
      const d = new Date()
      d.setDate(d.getDate() + prod.shelf_life_days)
      setExpiryDate(d.toISOString().slice(0, 10))
    }
    refreshMaterials(id, qty)
  }

  function refreshMaterials(productId, quantity) {
    const recipe = recipes.find((r) => r.product_id === productId)
    if (recipe) {
      const mats = (recipe.recipe_items || []).map((ri) => ({
        ...ri,
        required: Number(ri.quantity) * quantity,
        available: getProductStock(ri.products),
      }))
      setMaterials(mats)
    } else {
      setMaterials([])
    }
  }

  useEffect(() => {
    if (selectedProduct) refreshMaterials(selectedProduct, qty)
  }, [qty])

  const hasRecipe = selectedProduct && recipes.some((r) => r.product_id === selectedProduct)
  const allAvailable = materials.length === 0 || materials.every((m) => m.available >= m.required)
  const productName = products.find((p) => p.id === selectedProduct)?.name

  async function complete() {
    setSaving(true)
    setError(null)
    try {
      const recipe = recipes.find((r) => r.product_id === selectedProduct)
      const batchNumber = `PB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const actual = actualQty ?? qty
      const unitCost = costMode === 'manual'
        ? (manualUnitCost ? Number(manualUnitCost) : (manualTotalCost ? Number(manualTotalCost) / actual : 0))
        : 0

      const { data: batch, error: bErr } = await supabase
        .from('production_batches')
        .insert({
          batch_number: batchNumber,
          product_id: selectedProduct,
          recipe_id: costMode === 'recipe' ? recipe?.id : null,
          planned_quantity: qty,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          cost_mode: costMode,
          lot_number: lotNumber || null,
          production_date: new Date().toISOString().slice(0, 10),
          expiry_date: expiryDate || null,
        })
        .select()
        .single()
      if (bErr) throw bErr

      if (costMode === 'recipe' && materials.length > 0) {
        const consumptions = materials.map((m) => ({
          batch_id: batch.id,
          product_id: m.product_id,
          quantity: m.required,
          unit_cost: Number(m.products?.cost_price || 0),
        }))
        await supabase.from('production_consumptions').insert(consumptions)

        const { data, error: cErr } = await supabase.rpc('complete_production_batch', {
          p_batch_id: batch.id,
          p_actual_qty: actual,
          p_waste_qty: wasteQty,
          p_waste_reason: wasteQty > 0 ? 'Processing loss' : null,
        })
        if (cErr) throw cErr

        // Update lot on batch
        await supabase.from('production_batches').update({
          lot_number: lotNumber || null,
          expiry_date: expiryDate || null,
        }).eq('id', batch.id)

        setSuccess({ ...data, batch_number: batchNumber, product: productName, mode: 'recipe' })
      } else {
        // Manual cost mode: no material auto-consume, post FG with known unit cost
        const totalCost = unitCost * actual
        if (actual > 0) {
          await supabase.from('inventory_movements').insert({
            product_id: selectedProduct,
            movement_type: 'production_output',
            quantity: actual,
            unit_cost: unitCost,
            reference_type: 'production',
            reference_id: batch.id,
            lot_number: lotNumber || null,
            expiry_date: expiryDate || null,
            notes: 'Manual production cost',
          })
          await supabase.from('products').update({ cost_price: unitCost, updated_at: new Date().toISOString() }).eq('id', selectedProduct)
        }
        await supabase.from('production_batches').update({
          actual_quantity: actual,
          waste_quantity: wasteQty,
          waste_reason: wasteQty > 0 ? 'Processing loss' : null,
          material_cost: 0,
          packaging_cost: 0,
          total_cost: totalCost,
          unit_cost: unitCost,
          status: 'completed',
          completed_at: new Date().toISOString(),
          lot_number: lotNumber || null,
          expiry_date: expiryDate || null,
        }).eq('id', batch.id)

        setSuccess({
          success: true,
          batch_id: batch.id,
          total_cost: totalCost,
          unit_cost: unitCost,
          batch_number: batchNumber,
          product: productName,
          mode: 'manual',
        })
      }
      addToast('Production completed')
    } catch (e) {
      setError(e.message || 'Production failed')
      addToast(e.message || 'Production failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 scale-enter">
        <div className="w-16 h-16 rounded-full bg-[#3F8065]/10 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-[#3F8065]" />
        </div>
        <h1 className="text-xl font-semibold">Production completed</h1>
        <p className="text-[#707070] text-sm mt-1">{success.product} · {success.batch_number}</p>
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 w-full max-w-sm mt-6 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-[#707070]">Mode</span><span className="capitalize">{success.mode}</span></div>
          <div className="flex justify-between"><span className="text-[#707070]">Unit cost</span><span className="tabular-nums">{formatMoney(success.unit_cost)}</span></div>
          <div className="flex justify-between"><span className="text-[#707070]">Total cost</span><span className="tabular-nums">{formatMoney(success.total_cost)}</span></div>
        </div>
        <Button className="mt-8" onClick={() => navigate('/production')}>Done</Button>
      </div>
    )
  }

  // Step mapping: 0 product, 1 cost mode, 2 qty/materials or manual cost, 3 result
  const maxStep = 3

  return (
    <div className="min-h-full flex flex-col max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#E8E8E5] bg-white sticky top-0">
        <button onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))} className="p-2 -ml-2 rounded-lg hover:bg-[#F7F7F5]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-semibold">New production</h1>
          <p className="text-xs text-[#707070]">Step {step + 1} of {maxStep + 1}</p>
        </div>
      </div>

      <div className="flex-1 p-4 pb-28 flow-enter" key={step}>
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-4">What are you making?</h2>
            {products.map((p) => (
              <SelectionCard key={p.id} title={p.name}
                subtitle={p.cost_price ? `Known cost ~ ${formatMoney(p.cost_price)}/unit` : undefined}
                selected={selectedProduct === p.id} onClick={() => selectProduct(p.id)} />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium mb-2">How do you want to cost this?</h2>
            <p className="text-sm text-[#707070] mb-4">
              Many producers already know the cost per unit. You can enter it yourself, or use the recipe to calculate from materials.
            </p>
            <SelectionCard
              title="I know the cost"
              subtitle="Enter unit cost or total cost yourself"
              selected={costMode === 'manual'}
              onClick={() => setCostMode('manual')}
            />
            <SelectionCard
              title="Calculate from recipe"
              subtitle={hasRecipe ? 'Use BOM / ingredients in stock' : 'No recipe set — add one in Settings first'}
              selected={costMode === 'recipe'}
              onClick={() => hasRecipe && setCostMode('recipe')}
              className={!hasRecipe ? 'opacity-50' : ''}
            />
          </div>
        )}

        {step === 2 && costMode === 'recipe' && (
          <div>
            <h2 className="text-lg font-medium mb-4">How many units?</h2>
            <div className="flex items-center justify-center gap-6 py-6">
              <button onClick={() => setQty(Math.max(1, qty - 10))} className="w-12 h-12 rounded-xl border border-[#E8E8E5] flex items-center justify-center">
                <Minus className="w-5 h-5" />
              </button>
              <span className="text-4xl font-semibold tabular-nums w-24 text-center">{qty}</span>
              <button onClick={() => setQty(qty + 10)} className="w-12 h-12 rounded-xl border border-[#E8E8E5] flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <h3 className="font-medium mb-3">Materials required</h3>
            <div className="space-y-2">
              {materials.map((m) => {
                const ok = m.available >= m.required
                return (
                  <div key={m.product_id} className="flex justify-between text-sm p-3 rounded-xl bg-white border border-[#E8E8E5]">
                    <span>{m.products?.name}</span>
                    <span className={ok ? 'text-[#707070]' : 'text-[#B4534A]'}>
                      {formatNumber(m.required, 2)} {m.products?.unit}
                      {!ok && ` (need ${formatNumber(m.required - m.available, 2)} more)`}
                    </span>
                  </div>
                )
              })}
            </div>
            {!allAvailable && (
              <p className="text-sm text-[#B4534A] mt-4">Not enough stock. Adjust quantity or restock first.</p>
            )}
          </div>
        )}

        {step === 2 && costMode === 'manual' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Quantity & your cost</h2>
            <div>
              <label className="text-sm text-[#707070]">Units to produce</label>
              <div className="flex items-center gap-4 mt-2">
                <button onClick={() => setQty(Math.max(1, qty - 10))} className="w-10 h-10 rounded-xl border border-[#E8E8E5] flex items-center justify-center">
                  <Minus className="w-4 h-4" />
                </button>
                <input type="number" className="w-24 h-12 text-center text-2xl font-semibold rounded-xl border border-[#E8E8E5] tabular-nums"
                  value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                <button onClick={() => setQty(qty + 10)} className="w-10 h-10 rounded-xl border border-[#E8E8E5] flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <Input label="Cost per unit (TZS) — what you already know"
              type="number" value={manualUnitCost}
              onChange={(e) => { setManualUnitCost(e.target.value); setManualTotalCost('') }}
              placeholder="e.g. 4300" />
            <p className="text-xs text-[#707070] text-center">or</p>
            <Input label="Total batch cost (TZS)"
              type="number" value={manualTotalCost}
              onChange={(e) => { setManualTotalCost(e.target.value); setManualUnitCost('') }}
              placeholder="e.g. 430000" />
            {(manualUnitCost || manualTotalCost) && (
              <p className="text-sm text-[#707070]">
                Effective unit cost:{' '}
                <span className="font-medium text-[#181818] tabular-nums">
                  {formatMoney(manualUnitCost ? Number(manualUnitCost) : Number(manualTotalCost) / qty)}
                </span>
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Production result</h2>
            <Input label="Actual good output" type="number" value={actualQty ?? qty}
              onChange={(e) => setActualQty(Number(e.target.value))} />
            <Input label="Waste / loss" type="number" value={wasteQty}
              onChange={(e) => setWasteQty(Number(e.target.value))} />
            <Input label="Lot / batch number (optional)" value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)} placeholder="e.g. PB-2026-001" />
            <Input label="Expiry date (optional)" type="date" value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)} />
            {error && <div className="p-3 rounded-xl bg-[#B4534A]/10 text-[#B4534A] text-sm">{error}</div>}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 p-4 border-t border-[#E8E8E5] bg-white md:sticky md:inset-x-auto safe-area-pb">
        {step < 3 ? (
          <Button
            className="w-full"
            size="lg"
            disabled={
              (step === 0 && !selectedProduct) ||
              (step === 1 && !costMode) ||
              (step === 2 && costMode === 'recipe' && !allAvailable) ||
              (step === 2 && costMode === 'manual' && !manualUnitCost && !manualTotalCost)
            }
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button className="w-full" size="lg" loading={saving} onClick={complete}>
            Complete production
          </Button>
        )}
      </div>
    </div>
  )
}
