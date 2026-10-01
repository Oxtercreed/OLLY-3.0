import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Plus,
  Tag,
  ShoppingCart,
  Factory,
  Receipt,
  CreditCard,
  X,
  AlertTriangle,
  CheckCircle2,
  Package,
  CheckCheck,
  ArrowRight,
  Info,
} from 'lucide-react'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ActionSheet } from './ActionSheet'
import { OfflineBanner } from './OfflineBanner'
import { cn } from '../../utils/cn'

const defaultNotifications = [
  {
    id: 'notif-1',
    title: 'Low Stock Alert',
    message: 'Groundnuts stock is at 10 kg (below reorder level of 50 kg). Restock recommended.',
    time: '10m ago',
    type: 'warning',
    link: '/inventory',
    unread: true,
  },
  {
    id: 'notif-2',
    title: 'Finished Goods Ready',
    message: 'Peanut Butter 400g has 100 jars in stock and available for immediate sale.',
    time: '25m ago',
    type: 'success',
    link: '/sales/new',
    unread: true,
  },
  {
    id: 'notif-3',
    title: 'Stock Adjustment Recorded',
    message: 'Cooking Oil balance updated to 80 L.',
    time: '1h ago',
    type: 'info',
    link: '/inventory',
    unread: true,
  },
  {
    id: 'notif-4',
    title: 'System Synced',
    message: 'Offline database engine is connected and synchronized with Supabase.',
    time: '3h ago',
    type: 'system',
    link: '/',
    unread: false,
  },
]

const NOTIF_STORAGE_KEY = 'olly_notifications_read_v1'

function getInitialNotifications() {
  try {
    const readIds = JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || '[]')
    return defaultNotifications.map((n) => ({
      ...n,
      unread: readIds.includes(n.id) ? false : n.unread,
    }))
  } catch {
    return defaultNotifications
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(getInitialNotifications)
  const location = useLocation()
  const navigate = useNavigate()
  const notifRef = useRef(null)
  const mobileNotifRef = useRef(null)

  const isNewFlow =
    location.pathname.includes('/new') ||
    location.pathname.includes('/expense') ||
    location.pathname.includes('/payment')

  const unreadCount = notifications.filter((n) => n.unread).length

  function markAllRead() {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, unread: false }))
      try {
        localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated.map((n) => n.id)))
      } catch (e) {
        console.error(e)
      }
      return updated
    })
  }

  function handleNotifClick(notif) {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n))
      try {
        const readIds = updated.filter((n) => !n.unread).map((n) => n.id)
        localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(readIds))
      } catch (e) {
        console.error(e)
      }
      return updated
    })
    setNotificationsOpen(false)
    if (notif.link) {
      navigate(notif.link)
    }
  }

  // Close notifications on outside click (for both desktop and mobile)
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && notifRef.current.contains(e.target)) return
      if (mobileNotifRef.current && mobileNotifRef.current.contains(e.target)) return
      setNotificationsOpen(false)
    }
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [notificationsOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F7F5]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />

        {/* Desktop header */}
        {!isNewFlow && (
          <header className="hidden md:flex items-center justify-between h-16 px-8 border-b border-[#E8E8E5] bg-white relative">
            <div />
            <div className="flex items-center gap-3">
              {/* Notification Bell Button */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={cn(
                    'relative p-2 rounded-xl transition-all duration-200 cursor-pointer',
                    notificationsOpen ? 'bg-[#F2F2ED] text-[#181818]' : 'hover:bg-[#F7F7F5] text-[#707070]'
                  )}
                  title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#EF4444] ring-2 ring-white"></span>
                    </span>
                  )}
                </button>

                {/* Desktop Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 w-88 bg-white/98 backdrop-blur-xl rounded-2xl shadow-xl border border-[#E8E8E5] overflow-hidden z-50 animate-[fadeIn_150ms_ease-out]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0EB] bg-[#FAFAF8]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#181818]">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EF4444] text-white">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="text-xs text-[#707070] hover:text-[#181818] font-medium transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark all read</span>
                        </button>
                      )}
                    </div>

                    <div className="divide-y divide-[#F0F0EB] max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[#707070]">No notifications</div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className={cn(
                              'p-3.5 flex items-start gap-3 hover:bg-[#F7F7F5] transition-colors cursor-pointer text-left',
                              n.unread && 'bg-[#FAFAFA]'
                            )}
                          >
                            <div className="mt-0.5 shrink-0">
                              {n.type === 'warning' && (
                                <div className="w-7 h-7 rounded-lg bg-[#FCF9F2] text-[#B7833F] border border-[#F5E2C2] flex items-center justify-center">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </div>
                              )}
                              {n.type === 'success' && (
                                <div className="w-7 h-7 rounded-lg bg-[#EBF5F0] text-[#1E754C] border border-[#BCE1CE] flex items-center justify-center">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </div>
                              )}
                              {n.type === 'info' && (
                                <div className="w-7 h-7 rounded-lg bg-[#EBF0F5] text-[#1E5075] border border-[#C5D8E8] flex items-center justify-center">
                                  <Package className="w-3.5 h-3.5" />
                                </div>
                              )}
                              {n.type === 'system' && (
                                <div className="w-7 h-7 rounded-lg bg-[#F0F0ED] text-[#707070] border border-[#E0E0DC] flex items-center justify-center">
                                  <Info className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <p className={cn('text-xs font-semibold truncate', n.unread ? 'text-[#181818]' : 'text-[#707070]')}>
                                  {n.title}
                                </p>
                                <span className="text-[10px] text-[#A0A09B] shrink-0">{n.time}</span>
                              </div>
                              <p className="text-xs text-[#505050] line-clamp-2 leading-relaxed">{n.message}</p>
                            </div>

                            {n.unread && (
                              <div className="w-2 h-2 rounded-full bg-[#EF4444] shrink-0 mt-1.5" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                onClick={() => setActionsOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#181818] text-white text-sm font-medium hover:bg-[#2c2c2c] active:scale-[0.98] transition-all duration-150 shadow-sm cursor-pointer group"
                title="Create a new transaction or activity"
              >
                <Plus className="w-4 h-4 text-[#10B981] group-hover:rotate-90 transition-transform duration-200" strokeWidth={2.5} />
                <span>New action</span>
              </button>
            </div>
          </header>
        )}

        {/* Mobile top bar */}
        {!isNewFlow && (
          <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-[#E8E8E5] bg-white relative">
            <span className="text-lg font-semibold tracking-tight text-[#181818]">Olly</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative p-2 text-[#707070] hover:text-[#181818] transition-colors cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#EF4444] ring-2 ring-white"></span>
                  </span>
                )}
              </button>
            </div>

            {/* Mobile Notifications Flyout Modal */}
            {notificationsOpen && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setNotificationsOpen(false)} />
                <div
                  ref={mobileNotifRef}
                  className="absolute top-16 inset-x-3 bg-white rounded-2xl shadow-2xl border border-[#E8E8E5] overflow-hidden max-h-[80vh] flex flex-col z-10"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0EB] bg-[#FAFAF8]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[#181818]">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EF4444] text-white">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            markAllRead()
                          }}
                          className="text-xs text-[#707070] active:text-[#181818] font-medium flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg active:bg-[#F2F2ED] cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Mark all read</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setNotificationsOpen(false)
                        }}
                        className="p-1.5 text-[#707070] active:text-[#181818] rounded-lg active:bg-[#F0F0ED] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-[#F0F0EB] overflow-y-auto flex-1">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          'p-4 flex items-start gap-3 active:bg-[#F2F2ED] transition-colors text-left',
                          n.unread && 'bg-[#FAFAFA]'
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {n.type === 'warning' && (
                            <div className="w-8 h-8 rounded-xl bg-[#FCF9F2] text-[#B7833F] border border-[#F5E2C2] flex items-center justify-center">
                              <AlertTriangle className="w-4 h-4" />
                            </div>
                          )}
                          {n.type === 'success' && (
                            <div className="w-8 h-8 rounded-xl bg-[#EBF5F0] text-[#1E754C] border border-[#BCE1CE] flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          )}
                          {n.type === 'info' && (
                            <div className="w-8 h-8 rounded-xl bg-[#EBF0F5] text-[#1E5075] border border-[#C5D8E8] flex items-center justify-center">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          {n.type === 'system' && (
                            <div className="w-8 h-8 rounded-xl bg-[#F0F0ED] text-[#707070] border border-[#E0E0DC] flex items-center justify-center">
                              <Info className="w-4 h-4" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className={cn('text-xs font-semibold truncate', n.unread ? 'text-[#181818]' : 'text-[#707070]')}>
                              {n.title}
                            </p>
                            <span className="text-[10px] text-[#A0A09B] shrink-0">{n.time}</span>
                          </div>
                          <p className="text-xs text-[#505050] line-clamp-2 leading-relaxed">{n.message}</p>
                        </div>

                        {n.unread && (
                          <div className="w-2 h-2 rounded-full bg-[#EF4444] shrink-0 mt-1.5" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </header>
        )}

        <main className={isNewFlow ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto pb-28 md:pb-6'}>
          <Outlet />
        </main>
      </div>

      {!isNewFlow && <MobileNav onOpenActions={() => setActionsOpen(true)} />}
      <ActionSheet open={actionsOpen} onClose={() => setActionsOpen(false)} />

      {/* Desktop action sheet modal */}
      {actionsOpen && (
        <div className="hidden md:block fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={() => setActionsOpen(false)} />
          <div className="absolute top-18 right-8 w-72 bg-white/98 backdrop-blur-xl rounded-2xl shadow-xl border border-[#E8E8E5] p-2 space-y-1 animate-[fadeIn_150ms_ease-out]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0EB] mb-1">
              <span className="text-[11px] font-semibold text-[#8A8A85] uppercase tracking-wider">
                Select new action
              </span>
              <button
                onClick={() => setActionsOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-[#8A8A85] hover:text-[#181818] hover:bg-[#F0F0EB] transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {[
              { l: 'New sale', p: '/sales/new', icon: Tag, color: 'text-[#1E754C] bg-[#EBF5F0]' },
              { l: 'New purchase', p: '/purchases/new', icon: ShoppingCart, color: 'text-[#1E5075] bg-[#EBF0F5]' },
              { l: 'New production', p: '/production/new', icon: Factory, color: 'text-[#6B21A8] bg-[#F3E8FF]' },
              { l: 'Add expense', p: '/finance/expense', icon: Receipt, color: 'text-[#B7833F] bg-[#FCF9F2]' },
              { l: 'Record payment', p: '/finance/payment', icon: CreditCard, color: 'text-[#181818] bg-[#F0F0ED]' },
            ].map((a) => (
              <button
                key={a.l}
                onClick={() => {
                  setActionsOpen(false)
                  navigate(a.p)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F7F7F5] border border-transparent hover:border-[#E8E8E5] transition-all text-left active:scale-[0.98] cursor-pointer group"
              >
                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105', a.color)}>
                  <a.icon className="w-4 h-4" strokeWidth={2} />
                </span>
                <span className="font-medium text-sm text-[#181818]">{a.l}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
