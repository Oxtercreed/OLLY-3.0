import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  ArrowRight,
  TrendingUp,
  Wallet,
  BarChart3,
  Package,
  Sparkles,
  Factory,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  Check,
  Layers,
  Box,
  Plus,
  Boxes,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { KPICard, Card } from '../../components/ui/Card'
import { cn } from '../../utils/cn'
import { PeriodPicker, getPeriodRange } from '../../components/ui/PeriodPicker'
import { useLanguage } from '../../i18n/LanguageContext'

function getPeriodRanges(period, customFrom, customTo) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let days = 30
  let label = 'vs previous 30d'

  if (period === 'today') {
    days = 1
    label = 'vs yesterday'
  } else if (period === 'yesterday') {
    days = 1
    label = 'vs day before'
  } else if (period === '7d') {
    days = 7
    label = 'vs previous 7d'
  } else if (period === '30d') {
    days = 30
    label = 'vs previous 30d'
  } else if (period === '3m') {
    days = 90
    label = 'vs previous 3m'
  } else if (period === '1y') {
    days = 365
    label = 'vs previous year'
  } else if (period === 'custom' && customFrom && customTo) {
    const d1 = new Date(customFrom)
    const d2 = new Date(customTo)
    days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1)
    label = `vs previous ${days}d`
  }

  const currentTo = new Date(today)
  if (period === 'yesterday') {
    currentTo.setDate(currentTo.getDate() - 1)
  }
  const currentFrom = new Date(currentTo)
  currentFrom.setDate(currentFrom.getDate() - (days - 1))

  const prevTo = new Date(currentFrom)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (days - 1))

  const toISO = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  return {
    currentFrom: toISO(currentFrom),
    currentTo: toISO(currentTo),
    prevFrom: toISO(prevFrom),
    prevTo: toISO(prevTo),
    label,
  }
}

function calcChange(curr, prev) {
  if (prev === 0 && curr === 0) return 0
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10
}

function formatChartDate(iso, period) {
  if (!iso) return ''
  const parts = String(iso).split('-')
  if (parts.length !== 3) return iso
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  const d = new Date(y, m, day)
  if (isNaN(d.getTime())) return iso

  if (period === '7d') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
  }
  if (period === '30d' || period === '3m') {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('en-GB', { month: 'short' })
}

function generatePointsForPeriod(chartPeriod, byDate = {}) {
  const days = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : chartPeriod === '3m' ? 90 : 365
  const points = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const rev = byDate[iso]?.revenue ?? 0
    const prof = byDate[iso]?.profit ?? 0

    points.push({
      date: iso,
      revenue: rev,
      profit: prof,
    })
  }

  return points
}

export default function DashboardPage() {
  const { t } = useLanguage()
  const [initialLoading, setInitialLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    revenue: 0, cogs: 0, grossProfit: 0, netProfit: 0,
    revenueChange: 0, netProfitChange: 0, grossProfitChange: 0, cogsChange: 0,
    changeLabel: 'vs previous 30d',
    toCollect: 0, toPay: 0,
  })
  const [production, setProduction] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [chartPeriod, setChartPeriod] = useState('30d')
  const [liveChartByDate, setLiveChartByDate] = useState({})
  const [invSummary, setInvSummary] = useState({ raw: 0, packaging: 0, finished: 0 })
  const [period, setPeriod] = useState('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { currentFrom, currentTo, prevFrom, prevTo, label } = getPeriodRanges(period, customFrom, customTo)

        const [
          { data: ledgerData },
          { data: custBal },
          { data: supBal },
          { data: batches },
          { data: inv },
          { data: payments }
        ] = await Promise.all([
          supabase
            .from('ledger_entries')
            .select('entry_type, amount, entry_date')
            .gte('entry_date', prevFrom)
            .lte('entry_date', currentTo),
          supabase.from('v_customer_balances').select('outstanding'),
          supabase.from('v_supplier_balances').select('outstanding'),
          supabase.from('production_batches').select('id, batch_number, actual_quantity, planned_quantity, status, products(name)').order('created_at', { ascending: false }).limit(5),
          supabase.from('inventory_balances').select('quantity, products(id, name, type, reorder_level)'),
          supabase.from('payments').select('id, amount, direction, payment_date, customers(name), suppliers(name)').order('created_at', { ascending: false }).limit(5),
        ])

        let curRev = 0, curCogs = 0, curExp = 0
        let prevRev = 0, prevCogs = 0, prevExp = 0

        for (const e of ledgerData || []) {
          const d = e.entry_date
          const a = Number(e.amount) || 0
          const isCur = d >= currentFrom && d <= currentTo
          const isPrev = d >= prevFrom && d <= prevTo

          if (isCur) {
            if (e.entry_type === 'revenue') curRev += a
            else if (e.entry_type === 'cogs') curCogs += a
            else if (e.entry_type === 'expense' || e.entry_type === 'payroll') curExp += a
          } else if (isPrev) {
            if (e.entry_type === 'revenue') prevRev += a
            else if (e.entry_type === 'cogs') prevCogs += a
            else if (e.entry_type === 'expense' || e.entry_type === 'payroll') prevExp += a
          }
        }

        const curGross = curRev - curCogs
        const curNet = curGross - curExp
        const prevGross = prevRev - prevCogs
        const prevNet = prevGross - prevExp

        const toCollect = (custBal || []).reduce((s, r) => s + Number(r.outstanding || 0), 0)
        const toPay = (supBal || []).reduce((s, r) => s + Number(r.outstanding || 0), 0)
        const low = (inv || []).filter((i) => i.products && Number(i.products.reorder_level || 0) > 0 && Number(i.quantity) <= Number(i.products.reorder_level))
        const summary = { raw: 0, packaging: 0, finished: 0 }
        for (const i of inv || []) {
          if (!i.products) continue
          if (i.products.type === 'raw_material') summary.raw++
          else if (i.products.type === 'packaging') summary.packaging++
          else if (i.products.type === 'finished_good') summary.finished++
        }

        setMetrics({
          revenue: curRev,
          cogs: curCogs,
          grossProfit: curGross,
          netProfit: curNet,
          revenueChange: calcChange(curRev, prevRev),
          netProfitChange: calcChange(curNet, prevNet),
          grossProfitChange: calcChange(curGross, prevGross),
          cogsChange: calcChange(curCogs, prevCogs),
          changeLabel: label,
          toCollect,
          toPay,
        })
        setProduction(batches || [])
        setLowStock(low)
        setRecentPayments(payments || [])
        setInvSummary(summary)
      } catch (e) {
        console.error(e)
      } finally {
        setInitialLoading(false)
      }
    }
    load()
  }, [period, customFrom, customTo])

  const [showRevenue, setShowRevenue] = useState(true)
  const [showProfit, setShowProfit] = useState(true)

  // Compute chart points synchronously via useMemo: completely eliminates x-axis tick overcrowding
  const chartData = useMemo(() => {
    return generatePointsForPeriod(chartPeriod, liveChartByDate)
  }, [chartPeriod, liveChartByDate])

  // Live database data loader for chart
  useEffect(() => {
    let isCancelled = false
    async function loadChart() {
      const days = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : chartPeriod === '3m' ? 90 : 365
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      try {
        const { data } = await supabase
          .from('ledger_entries')
          .select('entry_type, amount, entry_date')
          .gte('entry_date', from)
          .in('entry_type', ['revenue', 'cogs', 'expense', 'payroll'])
          .order('entry_date')

        if (isCancelled) return

        const byDate = {}
        for (const e of data || []) {
          if (!byDate[e.entry_date]) byDate[e.entry_date] = { date: e.entry_date, revenue: 0, profit: 0 }
          const a = Number(e.amount)
          if (e.entry_type === 'revenue') {
            byDate[e.entry_date].revenue += a
            byDate[e.entry_date].profit += a
          } else {
            byDate[e.entry_date].profit -= a
          }
        }
        setLiveChartByDate(byDate)
      } catch (err) {
        console.error('Error loading chart entries', err)
      }
    }
    loadChart()

    return () => {
      isCancelled = true
    }
  }, [chartPeriod])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('greetingMorning') : hour < 17 ? t('greetingAfternoon') : t('greetingEvening')
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const displayRevenue = metrics.revenue
  const displayNetProfit = metrics.netProfit
  const displayGrossProfit = metrics.grossProfit
  const displayCogs = metrics.cogs

  const displayRevChange = metrics.revenueChange ?? 0
  const displayNetChange = metrics.netProfitChange ?? 0
  const displayGrossChange = metrics.grossProfitChange ?? 0
  const displayCogsChange = metrics.cogsChange ?? 0

  const displayProduction = production.map((b) => ({
    id: b.id,
    name: b.products?.name || 'Production Batch',
    quantity: b.actual_quantity || b.planned_quantity || 0,
    status: b.status || 'in_progress',
  }))

  // Inventory counts (live from database)
  const displayRawCount = invSummary.raw
  const displayPackagingCount = invSummary.packaging
  const displayFinishedCount = invSummary.finished

  // Money (Money to Collect vs Money to Pay)
  const displayToCollect = metrics.toCollect
  const displayToPay = metrics.toPay

  const displayRecentPayments = recentPayments.map((p) => ({
    id: p.id,
    name: p.customers?.name || p.suppliers?.name || 'Payment transaction',
    amount: Number(p.amount) || 0,
    direction: p.direction || 'in',
    date: p.payment_date || 'Recently',
  }))

  // Dynamic Y-axis formatter (adapts dynamically between k, M, B)
  const formatYAxis = (v) => {
    if (v === 0) return '0'
    const abs = Math.abs(v)
    const sign = v < 0 ? '-' : ''
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`
    return `${sign}${abs}`
  }

  // Custom polished floating tooltip
  const CustomChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null

    let formattedDate = label
    if (label && typeof label === 'string' && label.includes('-')) {
      const parts = label.split('-')
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        }
      }
    }

    return (
      <div className="bg-white/95 backdrop-blur-md border border-[#E8E8E5] rounded-xl p-3 shadow-lg min-w-[180px]">
        <p className="text-[11px] font-semibold text-[#8E8E89] uppercase tracking-wider mb-2">{formattedDate}</p>
        <div className="space-y-1.5">
          {payload.map((item) => (
            <div key={item.dataKey} className="flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color || (item.dataKey === 'profit' ? '#10B981' : '#181818') }}
                />
                <span className="text-[#555] font-medium">{item.name}</span>
              </div>
              <span className="font-semibold tabular-nums text-[#181818]">
                {formatMoney(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-28" />)}
        </div>
        <div className="skeleton h-64" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[32px] font-semibold tracking-tight">{greeting}, Owner.</h1>
          <p className="text-[#707070] mt-1">{t('dashboardSubtitle')} · {today}</p>
        </div>
      </div>

      <PeriodPicker
        value={period}
        onChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={(f, to) => { setCustomFrom(f); setCustomTo(to) }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KPICard
          label="Sales"
          value={formatMoney(displayRevenue)}
          icon={TrendingUp}
          change={displayRevChange}
          changeLabel={metrics.changeLabel}
        />
        <KPICard
          label="Net profit"
          value={formatMoney(displayNetProfit)}
          icon={Wallet}
          change={displayNetChange}
          changeLabel={metrics.changeLabel}
        />
        <KPICard
          label="Gross profit"
          value={formatMoney(displayGrossProfit)}
          icon={BarChart3}
          change={displayGrossChange}
          changeLabel={metrics.changeLabel}
        />
        <KPICard
          label="COGS"
          value={formatMoney(displayCogs)}
          icon={Package}
          change={displayCogsChange}
          changeLabel={metrics.changeLabel}
        />
      </div>

      {/* Revenue & Profit chart */}
      <Card className="hidden md:block">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-lg tracking-tight">Revenue & Profit</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfit(!showProfit)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                    showProfit ? 'bg-[#EBF5F0] text-[#1E754C] border-[#BCE1CE]' : 'bg-[#F7F7F5] text-[#909090] border-transparent'
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  Net profit
                </button>
                <button
                  type="button"
                  onClick={() => setShowRevenue(!showRevenue)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
                    showRevenue ? 'bg-[#F0F0EE] text-[#181818] border-[#D8D8D4]' : 'bg-[#F7F7F5] text-[#909090] border-transparent'
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-[#181818]" />
                  Revenue
                </button>
              </div>
            </div>
            <p className="text-xs text-[#707070] mt-1">
              Performance breakdown over the selected timeframe
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#F7F7F5] p-1 rounded-full border border-[#E8E8E5] self-start sm:self-auto">
            {['7d', '30d', '3m', '1y'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setChartPeriod(p)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium uppercase transition-all duration-200 cursor-pointer',
                  chartPeriod === p
                    ? 'bg-[#181818] text-white shadow-xs'
                    : 'text-[#707070] hover:text-[#181818]'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart key={chartPeriod} data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {/* Green Glow / Drop Shadow Filter for the line */}
                <filter id="greenGlow" x="-10%" y="-10%" width="120%" height="140%">
                  <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#10B981" floodOpacity="0.35" />
                </filter>
                <filter id="darkGlow" x="-10%" y="-10%" width="120%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#181818" floodOpacity="0.12" />
                </filter>

                {/* Alive Green Gradient with rich opacity */}
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                  <stop offset="35%" stopColor="#10B981" stopOpacity={0.16} />
                  <stop offset="85%" stopColor="#10B981" stopOpacity={0.03} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>

                {/* Charcoal Gradient for Revenue */}
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#181818" stopOpacity={0.12} />
                  <stop offset="50%" stopColor="#181818" stopOpacity={0.03} />
                  <stop offset="100%" stopColor="#181818" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0EB" vertical={false} />

              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#707070' }}
                tickLine={false}
                axisLine={{ stroke: '#E8E8E5' }}
                tickFormatter={(iso) => formatChartDate(iso, chartPeriod)}
                interval={chartPeriod === '7d' ? 0 : chartPeriod === '30d' ? 4 : chartPeriod === '3m' ? 14 : 29}
                minTickGap={10}
              />

              <YAxis
                tick={{ fontSize: 11, fill: '#707070' }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={formatYAxis}
                domain={['auto', 'auto']}
              />

              <Tooltip content={<CustomChartTooltip />} />

              {showRevenue && (
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#181818"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  filter="url(#darkGlow)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#181818', stroke: '#fff', strokeWidth: 2 }}
                />
              )}

              {showProfit && (
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Net profit"
                  stroke="#10B981"
                  strokeWidth={2.75}
                  fill="url(#profitGrad)"
                  filter="url(#greenGlow)"
                  dot={false}
                  activeDot={{ r: 6, fill: '#10B981', stroke: '#fff', strokeWidth: 2.5 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Production & Inventory Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Production Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Factory className="w-5 h-5 text-[#181818]" />
                <h2 className="font-semibold text-base tracking-tight text-[#181818]">Production</h2>
              </div>
              <Link
                to="/production"
                className="group text-xs font-medium text-[#707070] hover:text-[#181818] flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {displayProduction.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FAFAF8] text-center text-xs text-[#707070]">
                No production batches recorded yet
              </div>
            ) : (
              <div className="space-y-2">
                {displayProduction.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAF8] hover:bg-[#F2F2ED] transition-colors duration-150"
                  >
                    <span className="font-medium text-sm text-[#181818]">{b.name}</span>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-[#707070] tabular-nums">{b.quantity} units</span>
                      <span
                        className={cn(
                          'text-xs font-medium px-2.5 py-0.5 rounded-full capitalize',
                          b.status === 'completed'
                            ? 'bg-[#EBF5F0] text-[#1E754C]'
                            : 'bg-[#FCF9F2] text-[#B7833F]'
                        )}
                      >
                        {b.status === 'completed' ? 'completed' : 'in progress'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#F0F0EB] mt-4">
            <Link
              to="/production/new"
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-[#707070] hover:text-[#181818] hover:bg-[#FAFAF8] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New batch
            </Link>
          </div>
        </Card>

        {/* Inventory Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-[#181818]" />
                <h2 className="font-semibold text-base tracking-tight text-[#181818]">Inventory</h2>
              </div>
              <Link
                to="/inventory"
                className="group text-xs font-medium text-[#707070] hover:text-[#181818] flex items-center gap-1 transition-colors"
              >
                View stock <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Clean 3 Tiles */}
            <div className="grid grid-cols-3 gap-2.5 mb-3.5">
              <div className="p-3.5 rounded-xl bg-[#FAFAF8] hover:bg-[#F2F2ED] transition-colors text-center">
                <p className="text-2xl font-bold tracking-tight text-[#181818] tabular-nums">{displayRawCount}</p>
                <p className="text-xs text-[#707070] mt-1">Raw</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAFAF8] hover:bg-[#F2F2ED] transition-colors text-center">
                <p className="text-2xl font-bold tracking-tight text-[#181818] tabular-nums">{displayPackagingCount}</p>
                <p className="text-xs text-[#707070] mt-1">Packaging</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAFAF8] hover:bg-[#F2F2ED] transition-colors text-center">
                <p className="text-2xl font-bold tracking-tight text-[#181818] tabular-nums">{displayFinishedCount}</p>
                <p className="text-xs text-[#707070] mt-1">Finished</p>
              </div>
            </div>

            {/* Simple status line */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAF8]">
              {lowStock.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[#1E754C] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>All stock levels healthy</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#B7833F] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#D97706]" />
                  <span>{lowStock.length} items low in stock</span>
                </div>
              )}
              <span className="text-xs text-[#707070]">Optimal</span>
            </div>
          </div>

          <div className="pt-3 border-t border-[#F0F0EB] mt-4">
            <Link
              to="/inventory"
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-[#707070] hover:text-[#181818] hover:bg-[#FAFAF8] transition-colors"
            >
              <Package className="w-3.5 h-3.5" />
              Adjust stock
            </Link>
          </div>
        </Card>
      </div>

      {/* Money & Cashflow Obligations */}
      <Card>
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#F0F0EB]">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#181818]" />
            <h2 className="font-semibold text-base tracking-tight text-[#181818]">
              Cash Flow & Pending Obligations
            </h2>
          </div>
          <Link
            to="/finance"
            className="group text-xs font-medium text-[#707070] hover:text-[#181818] flex items-center gap-1 transition-colors"
          >
            Finance <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Two Clean Number Tiles */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Money to collect */}
          <div className="p-5 rounded-2xl bg-[#FAFAF8] border border-[#EFEFEA] hover:border-[#D5D5D0] transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#707070]">
                  Money to collect
                </span>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#EBF5F0] text-[#1E754C]">
                  To receive
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#181818] tabular-nums my-2">
                {formatMoney(displayToCollect)}
              </p>
            </div>

            <div className="pt-4 border-t border-[#EAEAE6] mt-4">
              <Link
                to="/customers"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#E0E0DC] text-xs font-medium text-[#181818] hover:bg-[#F2F2ED] transition-colors shadow-2xs"
              >
                Collect payments <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Money to pay */}
          <div className="p-5 rounded-2xl bg-[#FAFAF8] border border-[#EFEFEA] hover:border-[#D5D5D0] transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#707070]">
                  Money to pay
                </span>
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#FCF9F2] text-[#B7833F]">
                  To pay
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-[#181818] tabular-nums my-2">
                {formatMoney(displayToPay)}
              </p>
            </div>

            <div className="pt-4 border-t border-[#EAEAE6] mt-4">
              <Link
                to="/purchases"
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white border border-[#E0E0DC] text-xs font-medium text-[#181818] hover:bg-[#F2F2ED] transition-colors shadow-2xs"
              >
                Pay suppliers <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Cash Flow Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A8A85]">
              Recent Cash Flow Activity
            </h3>
            <Link to="/finance" className="text-xs font-medium text-[#707070] hover:text-[#181818]">
              All transactions →
            </Link>
          </div>

          {displayRecentPayments.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#FAFAF8] text-center text-xs text-[#707070]">
              No payment transactions recorded yet
            </div>
          ) : (
            <div className="space-y-2">
              {displayRecentPayments.map((p) => {
                const isIn = p.direction === 'in'
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#FAFAF8] hover:bg-[#F2F2ED] transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                          isIn ? 'bg-[#EBF5F0] text-[#1E754C]' : 'bg-[#FCF9F2] text-[#B7833F]'
                        )}
                      >
                        {isIn ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      </span>
                      <span className="font-medium text-sm text-[#181818] truncate">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-[#707070] hidden sm:inline">{p.date}</span>
                      <span
                        className={cn(
                          'font-semibold text-sm tabular-nums',
                          isIn ? 'text-[#1E754C]' : 'text-[#181818]'
                        )}
                      >
                        {isIn ? '+' : '−'} {formatMoney(p.amount)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
