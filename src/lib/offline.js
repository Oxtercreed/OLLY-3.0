/**
 * Offline-first helpers for OLLY.
 * Caches reference data; queues write actions; flushes when online.
 */

import { recordSale } from '../services/salesService'
import { recordPurchase } from '../services/purchaseService'

const DB_NAME = 'olly-offline'
const DB_VER = 1
const QUEUE = 'queue'
const CACHE = 'cache'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export async function cacheSet(key, value) {
  const db = await openDb()
  const tx = db.transaction(CACHE, 'readwrite')
  tx.objectStore(CACHE).put({ key, value, updatedAt: Date.now() })
  await txDone(tx)
}

export async function cacheGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE, 'readonly')
    const req = tx.objectStore(CACHE).get(key)
    req.onsuccess = () => resolve(req.result?.value ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(action) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...action,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).put(item)
  await txDone(tx)
  window.dispatchEvent(new CustomEvent('olly-queue-changed'))
  return item
}

export async function listQueue() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readonly')
    const req = tx.objectStore(QUEUE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function removeFromQueue(id) {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).delete(id)
  await txDone(tx)
  window.dispatchEvent(new CustomEvent('olly-queue-changed'))
}

/**
 * Flush pending offline actions to Supabase.
 * action.shape: { type, payload }
 */
export async function flushQueue(supabase) {
  if (!isOnline()) return { synced: 0, failed: 0 }
  const items = (await listQueue()).filter((i) => i.status === 'pending')
  let synced = 0
  let failed = 0
  for (const item of items) {
    try {
      await applyAction(supabase, item)
      await removeFromQueue(item.id)
      synced++
    } catch (e) {
      console.error('Offline sync failed', item, e)
      failed++
      // keep in queue for retry
    }
  }
  if (synced > 0) {
    window.dispatchEvent(new CustomEvent('olly-sync-done', { detail: { synced, failed } }))
  }
  return { synced, failed }
}

async function applyAction(supabase, item) {
  const { type, payload } = item
  switch (type) {
    case 'sale': {
      const { error } = await recordSale({
        customerId: payload.p_customer_id,
        items: payload.p_items,
        paymentMethod: payload.p_payment_method,
        paidAmount: payload.p_paid_amount,
        notes: payload.p_notes,
      })
      if (error) throw error
      break
    }
    case 'purchase': {
      const { error } = await recordPurchase({
        supplierId: payload.p_supplier_id,
        items: payload.p_items,
        paymentMethod: payload.p_payment_method,
        paidAmount: payload.p_paid_amount,
        invoiceNumber: payload.p_invoice_number,
        notes: payload.p_notes,
      })
      if (error) throw error
      break
    }
    case 'expense': {
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) throw error
      break
    }
    case 'customer': {
      const { error } = await supabase.from('customers').insert(payload)
      if (error) throw error
      break
    }
    case 'stock_adjust': {
      const { error } = await supabase.rpc('adjust_stock', payload)
      if (error) throw error
      break
    }
    case 'payment': {
      const { error } = await supabase.from('payments').insert(payload)
      if (error) throw error
      break
    }
    default:
      throw new Error(`Unknown offline action: ${type}`)
  }
}

export function startOfflineListeners(supabase, onStatus) {
  const sync = async () => {
    onStatus?.({ online: isOnline(), syncing: true })
    try {
      const result = await flushQueue(supabase)
      onStatus?.({ online: isOnline(), syncing: false, ...result })
    } catch {
      onStatus?.({ online: isOnline(), syncing: false })
    }
  }
  window.addEventListener('online', sync)
  // periodic retry
  const interval = setInterval(() => {
    if (isOnline()) sync()
  }, 30000)
  // initial
  if (isOnline()) sync()
  return () => {
    window.removeEventListener('online', sync)
    clearInterval(interval)
  }
}
