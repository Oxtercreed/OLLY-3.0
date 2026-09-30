export function formatMoney(amount, currency = 'TZS') {
  const n = Number(amount) || 0
  return `${currency} ${n.toLocaleString('en-TZ', { maximumFractionDigits: 0 })}`
}

export function formatNumber(n, decimals = 0) {
  return Number(n || 0).toLocaleString('en-TZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function getProductStock(product) {
  if (!product) return 0
  const bal = product.inventory_balances
  if (Array.isArray(bal)) {
    return Number(bal[0]?.quantity ?? 0)
  }
  if (bal && typeof bal === 'object') {
    return Number(bal.quantity ?? 0)
  }
  if (typeof product.quantity === 'number') {
    return product.quantity
  }
  return 0
}
