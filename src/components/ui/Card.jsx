import { useState, useRef } from 'react'
import { cn } from '../../utils/cn'

export function Card({ children, className, padding = true, spotlight = false }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const cardRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!spotlight || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative bg-white border border-[#E8E8E5] rounded-2xl transition-all duration-300 ease-out',
        spotlight && 'overflow-hidden group hover:border-[#D0D0CB] hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.08)] hover:-translate-y-0.5',
        padding && 'p-5',
        className
      )}
    >
      {spotlight && isHovered && (
        <>
          <div
            className="pointer-events-none absolute -inset-px transition-opacity duration-200"
            style={{
              background: `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, rgba(24, 24, 24, 0.04), transparent 75%)`,
            }}
          />
          <div
            className="pointer-events-none absolute -inset-px transition-opacity duration-150"
            style={{
              background: `radial-gradient(100px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 0, 0, 0.04), transparent 70%)`,
            }}
          />
        </>
      )}
      <div className="relative z-10 w-full">{children}</div>
    </div>
  )
}

export function KPICard({ label, value, change, changeLabel, icon: Icon, subtext, className }) {
  const isUp = change > 0
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

  // Parse formatted currency string (e.g. "TZS 100,000,000", "TZS -50,000", or "$1,000")
  let rawStr = String(value ?? '')
  let currency = ''
  let numStr = rawStr
  let isNegative = false

  if (rawStr.startsWith('TZS ')) {
    currency = 'TZS'
    numStr = rawStr.slice(4).trim()
  } else if (rawStr.startsWith('$')) {
    currency = '$'
    numStr = rawStr.slice(1).trim()
  }

  if (numStr.startsWith('-')) {
    isNegative = true
  }

  const charLength = numStr.length

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative bg-white border border-[#E8E8E5] rounded-2xl p-4 sm:p-5 overflow-hidden group select-none',
        'transition-all duration-300 ease-out hover:-translate-y-1',
        'hover:border-[#D0D0CA] hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.08),0_4px_10px_-4px_rgba(0,0,0,0.03)]',
        className
      )}
    >
      {/* Interactive Cursor Spotlight Glow */}
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

      <div className="relative z-10 flex flex-col justify-between h-full min-h-[96px]">
        {/* Top Header: Label + Context Icon */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs sm:text-sm font-medium text-[#707070] tracking-wide truncate">
            {label}
          </p>
          {Icon && (
            <div className="w-8 h-8 rounded-xl bg-[#F7F7F5] border border-[#ECECE8] flex items-center justify-center text-[#707070] shrink-0 transition-all duration-300 group-hover:bg-[#181818] group-hover:text-white group-hover:border-[#181818] group-hover:scale-105">
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Value Display with Dynamic Font Size Scaling for Massive Numbers */}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          {currency && (
            <span className="text-[11px] sm:text-xs font-semibold text-[#8E8E89] uppercase tracking-wider select-none">
              {currency}
            </span>
          )}
          <span
            className={cn(
              'font-semibold tabular-nums tracking-tight leading-none transition-colors duration-200',
              charLength >= 14
                ? 'text-lg sm:text-xl lg:text-[22px]'
                : charLength >= 10
                ? 'text-xl sm:text-2xl lg:text-[25px]'
                : 'text-2xl sm:text-[28px]',
              isNegative ? 'text-[#B4534A]' : 'text-[#181818]'
            )}
          >
            {numStr}
          </span>
        </div>

        {/* Change Indicator / Trend */}
        {change != null ? (
          <div className="mt-2.5 flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center text-[11px] sm:text-xs font-medium px-1.5 py-0.5 rounded-md tabular-nums',
                change === 0
                  ? 'bg-[#F2F2EF] text-[#707070]'
                  : isUp
                  ? 'bg-[#EBF5F0] text-[#2F6B50]'
                  : 'bg-[#FAECEB] text-[#A3382F]'
              )}
            >
              {change === 0 ? '—' : isUp ? '↑' : '↓'} {Math.abs(change)}%
            </span>
            <span className="text-[11px] sm:text-xs text-[#8E8E89] truncate">
              {changeLabel || 'vs previous'}
            </span>
          </div>
        ) : subtext ? (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[#8E8E89]">
            <span>{subtext}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
