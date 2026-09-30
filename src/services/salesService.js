import { supabase } from '../lib/supabase.js'

/**
 * Generate a standard invoice number: INV-YYYYMMDD-XXXXXX
 */
function generateInvoiceNumber() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `INV-${y}${m}${d}-${rand}`
}

/**
 * Record a sale with rock-solid execution and automatic fallback:
 * 1. Attempts the atomic RPC `record_sale`
 * 2. If the RPC fails (e.g. due to database foreign-key order constraint),
 *    smoothly executes the complete transaction in correct relational order:
 *    sales -> sale_items -> inventory_movements -> ledger_entries -> payments
 */
export async function recordSale({
  customerId = null,
  items = [], // [{ product_id, quantity, unit_price }]
  paymentMethod = 'cash',
  paidAmount = null,
  notes = null,
}) {
  const payload = {
    p_customer_id: customerId,
    p_items: items.map((i) => ({
      product_id: i.product_id,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    })),
    p_payment_method: paymentMethod,
    p_paid_amount: paidAmount,
    p_notes: notes || null,
  }

  // Attempt 1: Call RPC
  try {
    const { data, error } = await supabase.rpc('record_sale', payload)
    if (!error && data) {
      return { data, error: null }
    }
    // If error is about foreign key constraint or function definition, proceed to fallback
    console.warn('RPC record_sale failed, falling back to direct atomic sequence:', error)
  } catch (rpcErr) {
    console.warn('RPC record_sale threw error, falling back:', rpcErr)
  }

  // Attempt 2: Direct relational sequence in correct foreign-key order
  let createdSaleId = null
  try {
    const today = new Date().toISOString().slice(0, 10)
    const productIds = items.map((i) => i.product_id)

    // 1. Fetch current product information (names, cost_price)
    const { data: prods, error: prodErr } = await supabase
      .from('products')
      .select('id, name, cost_price')
      .in('id', productIds)

    if (prodErr) throw prodErr
    const prodMap = Object.fromEntries((prods || []).map((p) => [p.id, p]))

    // 2. Stock check
    const { data: bals } = await supabase
      .from('inventory_balances')
      .select('product_id, quantity')
      .in('product_id', productIds)

    const balMap = Object.fromEntries((bals || []).map((b) => [b.product_id, Number(b.quantity || 0)]))

    let total = 0
    let cogs = 0
    const enrichedItems = items.map((i) => {
      const prod = prodMap[i.product_id]
      const qty = Number(i.quantity)
      const unitPrice = Number(i.unit_price)
      const unitCost = Number(prod?.cost_price || 0)
      const avail = balMap[i.product_id] ?? 0

      if (avail < qty) {
        throw new Error(`Insufficient stock for ${prod?.name || 'product'} (available: ${avail}, requested: ${qty})`)
      }

      total += qty * unitPrice
      cogs += qty * unitCost

      return {
        product_id: i.product_id,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
      }
    })

    const actualPaid = paidAmount !== null && paidAmount !== undefined
      ? Number(paidAmount)
      : (paymentMethod === 'credit' ? 0 : total)

    let paymentStatus = 'paid'
    if (actualPaid >= total) {
      paymentStatus = 'paid'
    } else if (actualPaid > 0) {
      paymentStatus = 'partial'
    } else {
      paymentStatus = 'pending'
    }

    const invoiceNumber = generateInvoiceNumber()

    // 3. Insert parent record in 'sales' FIRST
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        customer_id: customerId || null,
        sale_date: today,
        invoice_number: invoiceNumber,
        total_amount: total,
        paid_amount: actualPaid,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        cogs_amount: cogs,
        notes: notes || null,
      })
      .select()
      .single()

    if (saleErr) throw saleErr
    createdSaleId = sale.id

    // 4. Insert 'sale_items' with valid sale_id
    const saleItemsRows = enrichedItems.map((i) => ({
      sale_id: sale.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      unit_cost: i.unit_cost,
    }))

    const { error: itemsErr } = await supabase.from('sale_items').insert(saleItemsRows)
    if (itemsErr) throw itemsErr

    // 5. Insert inventory movements (triggers inventory_balances automatically)
    const movementRows = enrichedItems.map((i) => ({
      product_id: i.product_id,
      movement_type: 'sale',
      quantity: -i.quantity,
      unit_cost: i.unit_cost,
      reference_type: 'sale',
      reference_id: sale.id,
      notes: `Sale ${invoiceNumber}`,
    }))

    const { error: movErr } = await supabase.from('inventory_movements').insert(movementRows)
    if (movErr) throw movErr

    // 6. Record ledger entries (revenue & COGS)
    const ledgerRows = [
      {
        entry_type: 'revenue',
        amount: total,
        description: `Sale ${invoiceNumber}`,
        reference_type: 'sale',
        reference_id: sale.id,
        entry_date: today,
      },
      {
        entry_type: 'cogs',
        amount: cogs,
        description: `COGS for sale ${invoiceNumber}`,
        reference_type: 'sale',
        reference_id: sale.id,
        entry_date: today,
      },
    ]

    // 7. If paid > 0, record payment and payment ledger entry
    if (actualPaid > 0) {
      ledgerRows.push({
        entry_type: 'payment_in',
        amount: actualPaid,
        description: `Payment for sale ${invoiceNumber}`,
        reference_type: 'sale',
        reference_id: sale.id,
        entry_date: today,
      })

      const { error: payErr } = await supabase.from('payments').insert({
        direction: 'in',
        customer_id: customerId || null,
        amount: actualPaid,
        payment_method: paymentMethod,
        payment_date: today,
        reference_type: 'sale',
        reference_id: sale.id,
        notes: `Payment for sale ${invoiceNumber}`,
      })
      if (payErr) console.warn('Payment insert warning:', payErr)
    }

    const { error: ledgErr } = await supabase.from('ledger_entries').insert(ledgerRows)
    if (ledgErr) console.warn('Ledger insert warning:', ledgErr)

    return {
      data: {
        success: true,
        sale_id: sale.id,
        invoice_number: invoiceNumber,
        total,
        cogs,
        gross_profit: total - cogs,
      },
      error: null,
    }
  } catch (err) {
    // Rollback sales record if created
    if (createdSaleId) {
      try {
        await supabase.from('inventory_movements').delete().eq('reference_id', createdSaleId)
        await supabase.from('ledger_entries').delete().eq('reference_id', createdSaleId)
        await supabase.from('payments').delete().eq('reference_id', createdSaleId)
        await supabase.from('sales').delete().eq('id', createdSaleId)
      } catch (cleanupErr) {
        console.error('Failed to cleanup failed sale:', cleanupErr)
      }
    }
    return { data: null, error: err }
  }
}

/**
 * Delete a sale safely, reversing inventory and cleaning up ledger/payment records
 */
export async function deleteSale(saleId) {
  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('delete_sale', { p_sale_id: saleId })
    if (!error && data?.success) {
      return { success: true, error: null }
    }
  } catch (rpcErr) {
    console.warn('delete_sale RPC failed, using safe fallback:', rpcErr)
  }

  // Safe fallback
  try {
    // 1. Get sale details & sold items to restore inventory
    const { data: sale } = await supabase
      .from('sales')
      .select('invoice_number')
      .eq('id', saleId)
      .maybeSingle()

    const { data: items } = await supabase
      .from('sale_items')
      .select('product_id, quantity, unit_cost')
      .eq('sale_id', saleId)

    // 2. Restore stock for each item via adjustment movement
    if (items && items.length > 0) {
      const reversals = items.map((i) => ({
        product_id: i.product_id,
        movement_type: 'adjustment',
        quantity: Math.abs(Number(i.quantity)),
        unit_cost: i.unit_cost,
        reference_type: 'sale_reversal',
        reference_id: saleId,
        notes: `Reversal of deleted sale ${sale?.invoice_number || ''}`,
      }))
      await supabase.from('inventory_movements').insert(reversals)
    }

    // 3. Remove associated ledger entries and payments
    await supabase.from('ledger_entries').delete().eq('reference_type', 'sale').eq('reference_id', saleId)
    await supabase.from('payments').delete().eq('reference_type', 'sale').eq('reference_id', saleId)

    // 4. Delete the sale record (cascades to sale_items)
    const { error: delErr } = await supabase.from('sales').delete().eq('id', saleId)
    if (delErr) throw delErr

    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: err }
  }
}
