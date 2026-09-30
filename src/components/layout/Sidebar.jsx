import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Tag, ShoppingCart, Factory, Package,
  Users, Truck, DollarSign, UsersRound, FileText, Settings, ChevronLeft, ClipboardList, UserCog, LogOut
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAuth } from '../../context/AuthContext'

const nav = [
  { section: null, items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, mod: null }] },
  {
    section: 'OPERATIONS',
    items: [
      { to: '/sales', label: 'Sales', icon: Tag, mod: 'sales' },
      { to: '/orders', label: 'Orders', icon: ClipboardList, mod: 'orders' },
      { to: '/purchases', label: 'Purchases', icon: ShoppingCart, mod: 'purchases' },
      { to: '/production', label: 'Production', icon: Factory, mod: 'production' },
      { to: '/inventory', label: 'Inventory', icon: Package, mod: 'inventory' },
    ],
  },
  {
    section: 'RELATIONSHIPS',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, mod: 'customers' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, mod: 'suppliers' },
    ],
  },
  {
    section: 'FINANCE',
    items: [
      { to: '/finance', label: 'Finance', icon: DollarSign, mod: 'finance' },
      { to: '/payroll', label: 'Payroll', icon: UsersRound, mod: 'payroll' },
    ],
  },
  {
    section: 'INSIGHTS',
    items: [{ to: '/reports', label: 'Reports', icon: FileText, mod: 'reports' }],
  },
  {
    section: 'SYSTEM',
    items: [
      { to: '/staff', label: 'Staff', icon: UserCog, mod: 'staff' },
      { to: '/settings', label: 'Settings', icon: Settings, mod: 'settings' },
    ],
  },
]

export function Sidebar({ collapsed, onToggle }) {
  const { can, signOut } = useAuth()

  return (
    <aside
      className={cn(
        'h-screen flex flex-col bg-white border-r border-[#E8E8E5] flex-shrink-0 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[240px]'
      )}
    >
      <div className={cn('flex items-center h-16 px-4 border-b border-[#E8E8E5]', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && <span className="text-lg font-semibold tracking-tight">Olly</span>}
        <button type="button" onClick={onToggle} className="p-2 rounded-lg hover:bg-[#F7F7F5] text-[#707070]">
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map((group, gi) => {
          const items = group.items.filter((item) => !item.mod || can(item.mod))
          if (items.length === 0) return null
          return (
            <div key={gi} className="mb-4">
              {group.section && !collapsed && (
                <p className="px-3 mb-1 text-[10px] font-medium tracking-wider text-[#A0A0A0]">{group.section}</p>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm mb-0.5 transition-colors',
                      isActive ? 'bg-[#181818] text-white' : 'text-[#404040] hover:bg-[#F7F7F5]',
                      collapsed && 'justify-center px-2'
                    )
                  }
                  title={item.label}
                >
                  <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Logout button below everything with red borders and background */}
      <div className="p-3 border-t border-[#E8E8E5] shrink-0">
        <button
          type="button"
          onClick={signOut}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer shadow-2xs',
            'bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] hover:bg-[#FEE2E2] hover:border-[#F87171] active:scale-[0.98]',
            collapsed && 'justify-center px-2'
          )}
          title="Log out"
        >
          <LogOut className="w-4 h-4 shrink-0 text-[#DC2626]" strokeWidth={2} />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  )
}
