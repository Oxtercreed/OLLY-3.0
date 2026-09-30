import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeft, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FilterChips } from '../../components/ui/FilterChips'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../utils/cn'
import { completeOrder as completeOrderService } from '../../services/orderService'

export default function OrdersPage() {
  const { addToast } = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])
  const [completing, setCompleting] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, status, due_date, total_amount, notes, created_at, customers(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    setOrders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function openDetail(o) {
    setSelected(o)
    const { data } = await supabase
      .from('order_items')
      .select('quantity, unit_price, products(name)')
      .eq('order_id', o.id)
    setItems(data || [])
  }

  async function setStatus(status) {
    if (!selected) return
    const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', selected.id)
    if (error) addToast(error.message, 'error')
    else {
      setSelected({ ...selected, status })
      addToast(`Order ${status.replace('_', ' ')}`)
      await load()
    }
  }

  async function completeOrder(payMethod = 'credit') {
    if (!selected) return
    setCompleting(true)
    try {
      const { data, error } = await completeOrderService({
        orderId: selected.id,
        paymentMethod: payMethod,
      })
      if (error) throw error
      addToast(`Order completed — Sale recorded (${data?.invoice_number || 'Linked'})`)
      setSelected(null)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setCompleting(false)
    }
  }

  const chips = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'in_production', label: 'In production' },
    { id: 'ready', label: 'Ready' },
    { id: 'completed', label: 'Completed' },
  ]

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

  if (selected) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-[#707070] mb-4">
          <ArrowLeft className="w-4 h-4" /> Orders
        </button>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-semibold">{selected.order_number}</h1>
            <p className="text-sm text-[#707070] mt-0.5">
              {selected.customers?.name || selected.customer_name || 'Customer'}
              {selected.due_date ? ` · Due ${selected.due_date}` : ''}
            </p>
          </div>
          <StatusBadge status={selected.status} />
        </div>
        <Card className="mb-4 space-y-2">
          {items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{i.products?.name} × {i.quantity}</span>
              <span className="tabular-nums">{formatMoney(Number(i.quantity) * Number(i.unit_price))}</span>
            </div>
          ))}
          {selected.notes && <p className="text-sm text-[#707070] pt-2 border-t border-[#E8E8E5]">{selected.notes}</p>}
        </Card>

        {selected.status === 'completed' && (
          <div className="p-4 mb-4 rounded-2xl bg-[#3F8065]/10 border border-[#3F8065]/20 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#3F8065]">Order Completed</p>
              <p className="text-xs text-[#707070] mt-0.5">Recorded as sale, stock deducted & invoice linked</p>
            </div>
            <Link to="/sales">
              <Button variant="secondary" className="!h-9 !text-xs">
                View in Sales →
              </Button>
            </Link>
          </div>
        )}

        {selected.status !== 'completed' && selected.status !== 'cancelled' && (
          <div className="space-y-2">
            <p className="text-xs text-[#707070] uppercase tracking-wider mb-1">Update status</p>
            <div className="flex flex-wrap gap-2">
              {['confirmed', 'in_production', 'ready'].map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={cn('px-3 py-2 rounded-full text-sm border',
                    selected.status === s ? 'bg-[#181818] text-white' : 'bg-white border-[#E8E8E5]')}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <Button className="w-full mt-4" loading={completing} onClick={() => completeOrder('credit')}>
              <Check className="w-4 h-4" /> Complete → create sale (credit)
            </Button>
            <Button variant="secondary" className="w-full" loading={completing} onClick={() => completeOrder('cash')}>
              Complete → create sale (cash)
            </Button>
            <p className="text-xs text-[#707070] text-center">
              Completing records a sale, deducts stock, and links this order to the invoice.
            </p>
            <Button variant="secondary" className="w-full text-[#B4534A]" onClick={() => setStatus('cancelled')}>
              Cancel order
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-[#707070] mt-0.5">Customer requests → track → complete as sale</p>
        </div>
        <Link to="/orders/new"><Button><Plus className="w-4 h-4" /> New order</Button></Link>
      </div>
      <FilterChips options={chips} value={filter} onChange={setFilter} className="mb-5" />
      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#707070] mb-4">No orders yet</p>
          <Link to="/orders/new"><Button>Create first order</Button></Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <button key={o.id} type="button" onClick={() => openDetail(o)} className="w-full text-left">
              <Card className="!p-4 hover:border-[#181818] hover:shadow-xs transition-all">
                <div className="flex justify-between items-center w-full">
                  <div>
                    <p className="font-medium">{o.customers?.name || o.customer_name || 'Customer'}</p>
                    <p className="text-xs text-[#707070] mt-0.5">{o.order_number}{o.due_date ? ` · due ${o.due_date}` : ''}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
