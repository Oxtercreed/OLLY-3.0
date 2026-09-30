import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeft, Factory, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney, formatNumber } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { cn } from '../../utils/cn'
import { FilterChips } from '../../components/ui/FilterChips'

export default function ProductionPage() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [consumptions, setConsumptions] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('production_batches')
      .select('id, batch_number, planned_quantity, actual_quantity, waste_quantity, waste_reason, status, material_cost, packaging_cost, labor_cost, overhead_cost, total_cost, unit_cost, started_at, completed_at, created_at, products(name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setBatches(data || []); setLoading(false) })
  }, [])

  async function openDetail(b) {
    setSelected(b)
    const { data } = await supabase
      .from('production_consumptions')
      .select('quantity, unit_cost, products(name, unit, type)')
      .eq('batch_id', b.id)
    setConsumptions(data || [])
  }

  if (selected) {
    return (
      <div className="p-4 md:p-8 max-w-2xl md:max-w-4xl mx-auto">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-[#707070] mb-4 hover:text-[#181818]">
          <ArrowLeft className="w-4 h-4" /> Production
        </button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{selected.products?.name}</h1>
            <p className="text-sm text-[#707070] mt-0.5">{selected.batch_number}</p>
          </div>
          <StatusBadge status={selected.status} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="!p-4">
            <p className="text-xs text-[#707070]">Planned</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(selected.planned_quantity)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-[#707070]">Good output</p>
            <p className="text-xl font-semibold tabular-nums text-[#3F8065]">{formatNumber(selected.actual_quantity || 0)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-[#707070]">Waste</p>
            <p className="text-xl font-semibold tabular-nums">{formatNumber(selected.waste_quantity || 0)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-[#707070]">Unit cost</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(selected.unit_cost || 0)}</p>
          </Card>
        </div>

        {/* Desktop: 2-column workspace; Mobile: stacked */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold mb-3">Materials consumed</h3>
            {consumptions.length === 0 ? (
              <p className="text-sm text-[#707070]">No consumption data</p>
            ) : (
              <div className="space-y-2 text-sm">
                {consumptions.map((c, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{c.products?.name}</span>
                    <span className="tabular-nums text-[#707070]">
                      {formatNumber(c.quantity, 2)} {c.products?.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold mb-3">Cost breakdown</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[#707070]">Materials</span><span className="tabular-nums">{formatMoney(selected.material_cost || 0)}</span></div>
              <div className="flex justify-between"><span className="text-[#707070]">Packaging</span><span className="tabular-nums">{formatMoney(selected.packaging_cost || 0)}</span></div>
              <div className="flex justify-between"><span className="text-[#707070]">Labor</span><span className="tabular-nums">{formatMoney(selected.labor_cost || 0)}</span></div>
              <div className="flex justify-between"><span className="text-[#707070]">Overhead</span><span className="tabular-nums">{formatMoney(selected.overhead_cost || 0)}</span></div>
              <div className="flex justify-between border-t border-[#E8E8E5] pt-2 font-semibold">
                <span>Total</span><span className="tabular-nums">{formatMoney(selected.total_cost || 0)}</span>
              </div>
            </div>
            {selected.waste_reason && (
              <p className="text-xs text-[#707070] mt-4">Waste reason: {selected.waste_reason}</p>
            )}
          </Card>
        </div>
      </div>
    )
  }

  const filtered = batches.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const name = (b.products?.name || '').toLowerCase()
      const num = (b.batch_number || '').toLowerCase()
      if (!name.includes(q) && !num.includes(q)) return false
    }
    return true
  })

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
          <p className="text-sm text-[#707070] mt-0.5">Batches, materials, output and waste</p>
        </div>
        <Link to="/production/new"><Button><Plus className="w-4 h-4" /> New production</Button></Link>
      </div>

      <div className="space-y-3 mb-5">
        <FilterChips
          options={[
            { id: 'all', label: 'All' },
            { id: 'in_progress', label: 'In progress' },
            { id: 'completed', label: 'Completed' },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        <div className="relative">
          <Search className="w-4 h-4 text-[#707070] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-[#E8E8E5] text-sm bg-white focus:outline-none focus:border-[#181818]"
            placeholder="Search by product name or batch #..."
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
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-[#707070] mb-4">
            {batches.length === 0 ? 'No batches yet' : 'No batches match this filter'}
          </p>
          {batches.length === 0 && (
            <Link to="/production/new"><Button>Start first production</Button></Link>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const dateStr = b.completed_at || b.started_at || b.created_at
            const formattedDate = dateStr
              ? new Date(dateStr).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Recent'

            return (
              <button
                key={b.id}
                onClick={() => openDetail(b)}
                className="w-full text-left focus:outline-none group block"
              >
                <Card className="!p-4 sm:!p-5 hover:border-[#181818] hover:shadow-xs transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full">
                    {/* Left: Icon, Product name, Batch #, Date & Cost */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] flex items-center justify-center text-[#707070] shrink-0 group-hover:bg-[#181818] group-hover:text-white group-hover:border-[#181818] transition-all">
                        <Factory className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-base text-[#181818] tracking-tight truncate">
                            {b.products?.name || 'Finished Good'}
                          </h3>
                          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#F4F4F2] border border-[#E8E8E5] text-[#707070]">
                            {b.batch_number}
                          </span>
                        </div>
                        <div className="text-xs text-[#707070] mt-1 flex items-center gap-2 flex-wrap">
                          <span>{formattedDate}</span>
                          {Number(b.unit_cost || 0) > 0 && (
                            <>
                              <span>·</span>
                              <span className="tabular-nums font-medium text-[#181818]">
                                {formatMoney(b.unit_cost)} / unit
                              </span>
                            </>
                          )}
                          {Number(b.waste_quantity || 0) > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-[#B4534A]">
                                {formatNumber(b.waste_quantity)} waste
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quantity, Status badge, Chevron */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#F0F0EE]">
                      <div className="text-left sm:text-right">
                        <div className="font-semibold text-base tabular-nums text-[#181818]">
                          {formatNumber(b.actual_quantity ?? b.planned_quantity)} units
                        </div>
                        <div className="mt-1 flex sm:justify-end">
                          <StatusBadge status={b.status} />
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#A0A09B] group-hover:text-[#181818] group-hover:translate-x-0.5 transition-all hidden sm:block" />
                    </div>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
