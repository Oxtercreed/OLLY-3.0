import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../utils/format'
import { Button } from '../../components/ui/Button'
import { Card, KPICard } from '../../components/ui/Card'
import { cn } from '../../utils/cn'

export default function FinancePage() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [profit, setProfit] = useState({ revenue: 0, cogs: 0, gross_profit: 0, operating_expenses: 0, net_profit: 0 })
  const [toCollect, setToCollect] = useState(0)
  const [toPay, setToPay] = useState(0)
  const [expenses, setExpenses] = useState([])
  const [tab, setTab] = useState(location.pathname.includes('expense') ? 'expenses' : 'overview')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: p }, { data: cb }, { data: sb }, { data: exp }] = await Promise.all([
        supabase.from('v_profit_summary').select('*').single(),
        supabase.from('v_customer_balances').select('outstanding'),
        supabase.from('v_supplier_balances').select('outstanding'),
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(30),
      ])
      if (p) setProfit({
        revenue: Number(p.revenue || 0),
        cogs: Number(p.cogs || 0),
        gross_profit: Number(p.gross_profit || 0),
        operating_expenses: Number(p.operating_expenses || 0),
        net_profit: Number(p.net_profit || 0),
      })
      setToCollect((cb || []).reduce((s, r) => s + Number(r.outstanding || 0), 0))
      setToPay((sb || []).reduce((s, r) => s + Number(r.outstanding || 0), 0))
      setExpenses(exp || [])
      setLoading(false)
    }
    load()
  }, [])

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'pl', label: 'Profit & Loss' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="text-sm text-[#707070] mt-0.5">Income, expenses, receivables and profit</p>
        </div>
        <Link to="/finance/expense">
          <Button><Plus className="w-4 h-4" /> Add expense</Button>
        </Link>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-2 rounded-full text-sm whitespace-nowrap',
              tab === t.id ? 'bg-[#181818] text-white' : 'bg-white border border-[#E8E8E5]')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard label="Net profit" value={formatMoney(profit.net_profit)} icon={Wallet} />
                <KPICard label="Revenue" value={formatMoney(profit.revenue)} icon={TrendingUp} />
                <KPICard label="To collect" value={formatMoney(toCollect)} icon={ArrowDownLeft} />
                <KPICard label="To pay" value={formatMoney(toPay)} icon={ArrowUpRight} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <h3 className="font-semibold mb-3">Receivables</h3>
                  <p className="text-2xl font-semibold tabular-nums text-[#B7833F]">{formatMoney(toCollect)}</p>
                  <Link to="/customers" className="text-sm text-[#707070] mt-2 inline-block hover:text-[#181818]">View customers →</Link>
                </Card>
                <Card>
                  <h3 className="font-semibold mb-3">Payables</h3>
                  <p className="text-2xl font-semibold tabular-nums text-[#B7833F]">{formatMoney(toPay)}</p>
                  <Link to="/suppliers" className="text-sm text-[#707070] mt-2 inline-block hover:text-[#181818]">View suppliers →</Link>
                </Card>
              </div>
            </div>
          )}

          {tab === 'expenses' && (
            <div className="space-y-3">
              {expenses.length === 0 ? (
                <Card className="text-center py-12">
                  <p className="text-[#707070] mb-4">No expenses recorded</p>
                  <Link to="/finance/expense"><Button>Add expense</Button></Link>
                </Card>
              ) : expenses.map((e) => (
                <Card key={e.id} className="!p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium capitalize">{e.category}</p>
                    <p className="text-xs text-[#707070] mt-0.5">{e.expense_date}{e.description ? ` · ${e.description}` : ''}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatMoney(e.amount)}</p>
                </Card>
              ))}
            </div>
          )}

          {tab === 'pl' && (
            <Card>
              <h3 className="font-semibold mb-4">Profit & Loss</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-[#707070]">Revenue</span><span className="tabular-nums font-medium">{formatMoney(profit.revenue)}</span></div>
                <div className="flex justify-between"><span className="text-[#707070]">− Cost of goods sold</span><span className="tabular-nums">{formatMoney(profit.cogs)}</span></div>
                <div className="flex justify-between border-t border-[#E8E8E5] pt-3 font-semibold">
                  <span>Gross profit</span><span className="tabular-nums text-[#3F8065]">{formatMoney(profit.gross_profit)}</span>
                </div>
                <div className="flex justify-between"><span className="text-[#707070]">− Operating expenses & payroll</span><span className="tabular-nums">{formatMoney(profit.operating_expenses)}</span></div>
                <div className={cn('flex justify-between border-t border-[#E8E8E5] pt-3 text-base font-semibold',
                  profit.net_profit >= 0 ? 'text-[#3F8065]' : 'text-[#B4534A]')}>
                  <span>{profit.net_profit >= 0 ? 'Net profit' : 'Net loss'}</span>
                  <span className="tabular-nums">{formatMoney(Math.abs(profit.net_profit))}</span>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
