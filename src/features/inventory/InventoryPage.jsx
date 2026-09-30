import { useEffect, useState, useRef } from 'react'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Droplets,
  Boxes,
  Package,
  Wheat,
  ArrowRight,
  Sparkles,
  SlidersHorizontal,
  History,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatNumber, formatMoney, getProductStock } from '../../utils/format'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../utils/cn'
import { isOnline, enqueue } from '../../lib/offline'
import { FilterChips } from '../../components/ui/FilterChips'

function getProductIcon(item) {
  const name = (item?.name || '').toLowerCase()
  if (name.includes('oil')) return Droplets
  if (name.includes('nut') || name.includes('peanut') || name.includes('seed')) return Wheat
  if (item?.type === 'packaging') return Package
  if (item?.type === 'finished_good') return Sparkles
  return Boxes
}

function InventoryCard({ item, onClick }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const cardRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const qty = getProductStock(item)
  const reorder = Number(item.reorder_level || 0)
  const isOutOfStock = qty <= 0
  const isLowStock = !isOutOfStock && reorder > 0 && qty <= reorder
  const totalValue = qty * Number(item.cost_price || 0)
  const Icon = getProductIcon(item)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      ref={cardRef}
      className={cn(
        'group relative w-full text-left bg-white border border-[#E8E8E5] rounded-2xl p-5 overflow-hidden select-none cursor-pointer',
        'transition-all duration-300 ease-out hover:-translate-y-1 active:scale-[0.99]',
        'hover:border-[#D0D0CA] hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.08),0_4px_10px_-4px_rgba(0,0,0,0.03)]'
      )}
    >
      {/* Interactive Cursor Spotlight Glow (matches Dashboard KPICards) */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-200"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(280px circle at ${mousePos.x}px ${mousePos.y}px, rgba(24, 24, 24, 0.045), transparent 70%)`,
        }}
      />
      {/* Cursor Precision Focus Halo */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-150"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(80px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 0, 0, 0.04), transparent 60%)`,
        }}
      />

      <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
        {/* Top Header: Title & Context Icon */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base text-[#181818] tracking-tight truncate group-hover:text-black transition-colors">
              {item.name}
            </h3>
            <p className="text-xs text-[#707070] capitalize mt-0.5">
              {item.type.replace('_', ' ')}
            </p>
          </div>

          <div className="w-9 h-9 rounded-xl bg-[#F7F7F5] border border-[#ECECE8] flex items-center justify-center text-[#707070] shrink-0 transition-all duration-300 group-hover:bg-[#181818] group-hover:text-white group-hover:border-[#181818] group-hover:scale-105 shadow-xs">
            <Icon className="w-4 h-4" />
          </div>
        </div>

        {/* Stock Level & Status Badge */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#181818] tabular-nums">
              {formatNumber(qty, qty % 1 ? 2 : 0)}
            </span>
            <span className="text-sm font-medium text-[#707070]">
              {item.unit}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FAECEB] text-[#A3382F] border border-[#F5C7C3]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E04B38]" />
                Out of stock
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FCF9F2] text-[#B7833F] border border-[#F5E2C2]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                Low stock (≤ {reorder} {item.unit})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EBF5F0] text-[#1E754C] border border-[#BCE1CE]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                Optimal stock
              </span>
            )}

            {reorder > 0 && !isLowStock && !isOutOfStock && (
              <span className="text-[11px] text-[#8E8E89]">
                Reorder at {reorder} {item.unit}
              </span>
            )}
          </div>
        </div>

        {/* Financial Details & Interactive Footer */}
        <div className="pt-3 border-t border-[#F0F0EB] flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <p className="text-[#707070]">
              Cost <span className="font-semibold text-[#181818] tabular-nums">{formatMoney(item.cost_price)}</span> / {item.unit}
            </p>
            {totalValue > 0 && (
              <p className="text-[11px] text-[#8E8E89]">
                Valued at <span className="font-medium text-[#505050] tabular-nums">{formatMoney(totalValue)}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs font-medium text-[#707070] group-hover:text-[#181818] transition-colors">
            <span>Manage</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </button>
  )
}

export default function InventoryPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [movements, setMovements] = useState([])
  const [showAdjust, setShowAdjust] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, type, unit, reorder_level, cost_price, selling_price, lot_tracking, shelf_life_days, inventory_balances(quantity)')
      .eq('is_active', true)
      .order('type')
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function openDetail(item) {
    setSelected(item)
    const { data } = await supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity, unit_cost, notes, created_at, lot_number, expiry_date')
      .eq('product_id', item.id)
      .order('created_at', { ascending: false })
      .limit(40)
    setMovements(data || [])
  }

  async function refreshSelected(id) {
    const { data } = await supabase
      .from('products')
      .select('id, name, type, unit, reorder_level, cost_price, selling_price, lot_tracking, shelf_life_days, inventory_balances(quantity)')
      .eq('id', id)
      .single()
    if (data) {
      setSelected(data)
      const { data: movs } = await supabase
        .from('inventory_movements')
        .select('id, movement_type, quantity, unit_cost, notes, created_at, lot_number, expiry_date')
        .eq('product_id', data.id)
        .order('created_at', { ascending: false })
        .limit(40)
      setMovements(movs || [])
    }
    await load()
  }

  async function saveAdjustment() {
    if (!selected || adjustQty === '' || Number(adjustQty) === 0) return
    setSaving(true)
    try {
      const payload = {
        p_product_id: selected.id,
        p_quantity: Number(adjustQty),
        p_notes: adjustNote || (Number(adjustQty) > 0 ? 'Stock in' : 'Stock out / write-off'),
        p_lot_number: lotNumber || null,
        p_expiry_date: expiryDate || null,
      }
      if (!isOnline()) {
        await enqueue({ type: 'stock_adjust', payload })
        addToast('Stock change saved offline — will sync when online')
        setShowAdjust(false)
        setAdjustQty('')
        setAdjustNote('')
        setLotNumber('')
        setExpiryDate('')
        return
      }
      const { error } = await supabase.rpc('adjust_stock', payload)
      if (error) throw error

      const qtyChange = Number(adjustQty)
      const currentStock = getProductStock(selected)
      const newStock = currentStock + qtyChange

      addToast(`Stock updated to ${formatNumber(newStock, newStock % 1 ? 2 : 0)} ${selected.unit}`)
      setShowAdjust(false)
      setAdjustQty('')
      setAdjustNote('')
      setLotNumber('')
      setExpiryDate('')
      await refreshSelected(selected.id)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveProductEdit() {
    if (!selected) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: editForm.name,
          cost_price: Number(editForm.cost_price) || 0,
          selling_price: Number(editForm.selling_price) || 0,
          reorder_level: Number(editForm.reorder_level) || 0,
          unit: editForm.unit || selected.unit,
          lot_tracking: !!editForm.lot_tracking,
          shelf_life_days: editForm.shelf_life_days ? Number(editForm.shelf_life_days) : null,
        })
        .eq('id', selected.id)
      if (error) throw error
      addToast('Product updated')
      setShowEdit(false)
      await refreshSelected(selected.id)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function startEdit() {
    setEditForm({
      name: selected.name,
      cost_price: selected.cost_price,
      selling_price: selected.selling_price,
      reorder_level: selected.reorder_level,
      unit: selected.unit,
      lot_tracking: selected.lot_tracking,
      shelf_life_days: selected.shelf_life_days || '',
    })
    setShowEdit(true)
  }

  const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter)
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'raw_material', label: 'Raw materials' },
    { id: 'packaging', label: 'Packaging' },
    { id: 'finished_good', label: 'Finished goods' },
  ]

  // Item Detail View
  if (selected) {
    const qty = getProductStock(selected)
    const reorder = Number(selected.reorder_level || 0)
    const isOutOfStock = qty <= 0
    const isLow = !isOutOfStock && reorder > 0 && qty <= reorder
    const totalVal = qty * Number(selected.cost_price || 0)
    const Icon = getProductIcon(selected)

    // Projected stock in adjustment modal
    const parsedAdjust = Number(adjustQty) || 0
    const projectedQty = qty + parsedAdjust

    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#707070] hover:text-[#181818] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </button>

        {/* Product Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F7F7F5] border border-[#ECECE8] flex items-center justify-center text-[#181818] shadow-xs">
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#181818]">{selected.name}</h1>
              <p className="text-sm text-[#707070] capitalize mt-0.5">{selected.type.replace('_', ' ')}</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={startEdit} className="shrink-0">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>

        {/* Interactive Stock Spotlight Card */}
        <Card spotlight className="!p-6 space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#8E8E89] uppercase tracking-wider">Current Stock Balance</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={cn('text-4xl font-extrabold tracking-tight tabular-nums', isLow ? 'text-[#B7833F]' : isOutOfStock ? 'text-[#A3382F]' : 'text-[#181818]')}>
                  {formatNumber(qty, qty % 1 ? 2 : 0)}
                </span>
                <span className="text-lg font-normal text-[#707070]">{selected.unit}</span>
              </div>
            </div>

            <div>
              {isOutOfStock ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FAECEB] text-[#A3382F] border border-[#F5C7C3]">
                  <AlertCircle className="w-3.5 h-3.5" /> Out of stock
                </span>
              ) : isLow ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FCF9F2] text-[#B7833F] border border-[#F5E2C2]">
                  <AlertCircle className="w-3.5 h-3.5" /> Below reorder level ({selected.reorder_level} {selected.unit})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#EBF5F0] text-[#1E754C] border border-[#BCE1CE]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" /> Optimal stock level
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-5 border-t border-[#F0F0EB] text-sm">
            <div>
              <p className="text-xs text-[#707070]">Unit cost price</p>
              <p className="font-semibold text-sm tabular-nums text-[#181818] mt-0.5">{formatMoney(selected.cost_price)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707070]">Total inventory value</p>
              <p className="font-semibold text-sm tabular-nums text-[#181818] mt-0.5">{formatMoney(totalVal)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707070]">Reorder threshold</p>
              <p className="font-semibold text-sm tabular-nums text-[#181818] mt-0.5">{selected.reorder_level ? `${selected.reorder_level} ${selected.unit}` : 'Not set'}</p>
            </div>
            {selected.type === 'finished_good' && (
              <div>
                <p className="text-xs text-[#707070]">Selling price</p>
                <p className="font-semibold text-sm tabular-nums text-[#181818] mt-0.5">{formatMoney(selected.selling_price)}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Action Button */}
        <div>
          <Button
            size="lg"
            className="w-full sm:w-auto shadow-sm"
            onClick={() => {
              setAdjustQty('')
              setAdjustNote('')
              setShowAdjust(true)
            }}
          >
            <SlidersHorizontal className="w-4 h-4" /> Adjust stock
          </Button>
        </div>

        {/* Movement History */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base text-[#181818] tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 text-[#707070]" /> Movement history
            </h2>
            <span className="text-xs text-[#707070]">{movements.length} records</span>
          </div>

          {movements.length === 0 ? (
            <Card className="!p-8 text-center text-[#707070] text-sm">
              <History className="w-8 h-8 text-[#A0A09B] mx-auto mb-2 opacity-50" />
              <p>No inventory movements recorded yet</p>
            </Card>
          ) : (
            <Card className="divide-y divide-[#F0F0EB] !p-0 overflow-hidden">
              {movements.map((m) => {
                const isPositive = Number(m.quantity) > 0
                return (
                  <div key={m.id} className="flex items-center justify-between p-4 hover:bg-[#FAFAF8] transition-colors text-sm">
                    <div className="space-y-0.5 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'w-2 h-2 rounded-full',
                          isPositive ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                        )} />
                        <p className="font-medium capitalize text-[#181818] truncate">
                          {m.movement_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <p className="text-xs text-[#707070]">
                        {new Date(m.created_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {m.lot_number ? ` · Lot: ${m.lot_number}` : ''}
                        {m.expiry_date ? ` · Exp: ${m.expiry_date}` : ''}
                      </p>
                      {m.notes && <p className="text-xs text-[#505050] italic mt-0.5">"{m.notes}"</p>}
                    </div>

                    <div className="text-right shrink-0">
                      <span className={cn(
                        'inline-flex items-center gap-1 font-semibold tabular-nums text-sm px-2.5 py-1 rounded-lg',
                        isPositive ? 'bg-[#EBF5F0] text-[#1E754C]' : 'bg-[#FAECEB] text-[#A3382F]'
                      )}>
                        {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {isPositive ? '+' : ''}{formatNumber(m.quantity, 2)} {selected.unit}
                      </span>
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
        </div>

        {/* Adjust Stock Modal */}
        <Modal open={showAdjust} onClose={() => setShowAdjust(false)} title={`Adjust stock · ${selected.name}`}>
          <div className="space-y-4">
            {/* Current Stock Banner */}
            <div className="p-3.5 rounded-xl bg-[#FAFAF8] border border-[#E8E8E5] flex items-center justify-between">
              <div>
                <p className="text-xs text-[#707070]">Current Stock Balance</p>
                <p className="text-lg font-bold text-[#181818] tabular-nums mt-0.5">
                  {formatNumber(qty, qty % 1 ? 2 : 0)} <span className="text-sm font-normal text-[#707070]">{selected.unit}</span>
                </p>
              </div>

              {adjustQty && Number(adjustQty) !== 0 && (
                <div className="text-right">
                  <p className="text-xs text-[#707070]">Projected Balance</p>
                  <p className={cn(
                    'text-lg font-bold tabular-nums mt-0.5',
                    projectedQty < 0 ? 'text-[#A3382F]' : 'text-[#1E754C]'
                  )}>
                    {formatNumber(projectedQty, projectedQty % 1 ? 2 : 0)}{' '}
                    <span className="text-sm font-normal text-[#707070]">{selected.unit}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Quick Adjustment Presets */}
            <div>
              <p className="text-xs font-medium text-[#707070] mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {[10, 25, 50, 100].map((val) => (
                  <button
                    key={`plus-${val}`}
                    type="button"
                    onClick={() => setAdjustQty(String(val))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#FAFAF8] hover:bg-[#EBF5F0] hover:text-[#1E754C] border border-[#E8E8E5] transition-colors"
                  >
                    +{val} {selected.unit}
                  </button>
                ))}
                {[-5, -10].map((val) => (
                  <button
                    key={`minus-${val}`}
                    type="button"
                    onClick={() => setAdjustQty(String(val))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#FAFAF8] hover:bg-[#FAECEB] hover:text-[#A3382F] border border-[#E8E8E5] transition-colors"
                  >
                    {val} {selected.unit}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Quantity Input */}
            <Input
              label={`Adjustment quantity (${selected.unit})`}
              type="number"
              step="any"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              placeholder="e.g. 50 (stock in) or -10 (waste/stock out)"
              helperText="Positive numbers add stock, negative numbers reduce stock"
            />

            {projectedQty < 0 && (
              <p className="text-xs text-[#A3382F] bg-[#FAECEB] p-2.5 rounded-lg border border-[#F5C7C3]">
                Warning: Resulting balance will be negative ({projectedQty} {selected.unit}).
              </p>
            )}

            <Input
              label="Note (optional)"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="e.g. Restocked shipment, inventory physical count, damaged jars..."
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Lot / Batch # (optional)"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="LOT-2026-001"
              />
              <Input
                label="Expiry Date (optional)"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowAdjust(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={saving}
                disabled={!adjustQty || Number(adjustQty) === 0}
                onClick={saveAdjustment}
              >
                Save adjustment
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit Product Modal */}
        <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit · ${selected.name}`}>
          <div className="space-y-3">
            <Input label="Product name" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Unit of measurement" value={editForm.unit || ''} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} />
            <Input label="Cost price (TZS)" type="number" value={editForm.cost_price ?? ''} onChange={(e) => setEditForm({ ...editForm, cost_price: e.target.value })} />
            {selected.type === 'finished_good' && (
              <Input label="Selling price (TZS)" type="number" value={editForm.selling_price ?? ''} onChange={(e) => setEditForm({ ...editForm, selling_price: e.target.value })} />
            )}
            <Input label="Reorder alert level" type="number" value={editForm.reorder_level ?? ''} onChange={(e) => setEditForm({ ...editForm, reorder_level: e.target.value })} />
            <Input label="Shelf life (days, optional)" type="number" value={editForm.shelf_life_days ?? ''} onChange={(e) => setEditForm({ ...editForm, shelf_life_days: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-[#505050] pt-1 cursor-pointer">
              <input type="checkbox" checked={!!editForm.lot_tracking} onChange={(e) => setEditForm({ ...editForm, lot_tracking: e.target.checked })} />
              Enable lot & batch tracking
            </label>
            <div className="pt-2 flex items-center gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowEdit(false)} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" loading={saving} onClick={saveProductEdit}>
                Save changes
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  // Main Inventory Grid View
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#181818]">Inventory</h1>
          <p className="text-sm text-[#707070] mt-1">Stock balances, costs & movements · tap an item to manage</p>
        </div>
      </div>

      <FilterChips
        options={tabs.map((x) => ({ id: x.id, label: x.label }))}
        value={filter}
        onChange={setFilter}
        className="mb-4"
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="!p-12 text-center text-[#707070] max-w-md mx-auto">
          <Boxes className="w-10 h-10 text-[#B0B0AA] mx-auto mb-3 opacity-60" />
          <h3 className="font-semibold text-base text-[#181818] mb-1">No items in this category</h3>
          <p className="text-xs text-[#707070] mb-4">
            {filter === 'packaging'
              ? 'No packaging supplies active.'
              : filter === 'finished_good'
              ? 'No finished goods active.'
              : 'No products found.'}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
            View all products
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onClick={() => openDetail(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
