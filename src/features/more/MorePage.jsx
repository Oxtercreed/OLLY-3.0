import { Link } from 'react-router-dom'
import { ShoppingCart, Users, Truck, DollarSign, UsersRound, FileText, Settings, ClipboardList, UserCog, LogOut } from 'lucide-react'
import { useLanguage } from '../../i18n/LanguageContext'
import { useAuth } from '../../context/AuthContext'

export default function MorePage() {
  const { t } = useLanguage()
  const { can, isAdmin, staff, signOut } = useAuth()

  const links = [
    { to: '/orders', label: 'Orders', icon: ClipboardList, mod: 'orders' },
    { to: '/purchases', label: t('purchases'), icon: ShoppingCart, mod: 'purchases' },
    { to: '/customers', label: t('customers'), icon: Users, mod: 'customers' },
    { to: '/suppliers', label: t('suppliers'), icon: Truck, mod: 'suppliers' },
    { to: '/finance', label: t('finance'), icon: DollarSign, mod: 'finance' },
    { to: '/payroll', label: t('payroll'), icon: UsersRound, mod: 'payroll' },
    { to: '/reports', label: t('reports'), icon: FileText, mod: 'reports' },
    { to: '/staff', label: 'Staff', icon: UserCog, mod: 'staff' },
    { to: '/settings', label: t('settings'), icon: Settings, mod: 'settings' },
  ].filter((l) => can(l.mod))

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold mb-1">{t('more')}</h1>
        {staff && (
          <p className="text-sm text-[#707070]">
            {staff.full_name} · <span className="capitalize">{staff.role}</span>
          </p>
        )}
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-2xl overflow-hidden shadow-2xs">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-4 border-b border-[#E8E8E5] last:border-0 hover:bg-[#F7F7F5] transition-colors">
            <l.icon className="w-5 h-5 text-[#707070]" strokeWidth={1.75} />
            <span className="font-medium text-sm text-[#181818]">{l.label}</span>
          </Link>
        ))}
      </div>

      {/* Red logout button */}
      <button
        type="button"
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] hover:bg-[#FEE2E2] hover:border-[#F87171] active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
      >
        <LogOut className="w-4 h-4 text-[#DC2626]" strokeWidth={2} />
        <span>Log out</span>
      </button>

      {!isAdmin && (
        <p className="text-xs text-[#707070] text-center pt-1">
          Some areas are hidden by the owner&apos;s permissions.
        </p>
      )}
    </div>
  )
}
