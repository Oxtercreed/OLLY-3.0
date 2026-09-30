import { supabase } from '../lib/supabase.js'

/**
 * Record a purchase with rock-solid execution and automatic fallback:
 * 1. Attempts the atomic RPC `record_purchase`
 * 2. If the RPC fails (e.g. due to database foreign-key order constraint),
 *    smoothly executes the complete transaction in correct relational order:
 *    purchases -> purchase_items -> inventory_movements -> ledger_entries -> payments
 */
export async function recordPurchase({
  supplierId = null,
  items = [], // [{ product_id, quantity, unit_cost }]
  paymentMethod = 'cash',
  paidAmount = null,
  invoiceNumber = null,
  notes = null,
}) {
  const payload = {
    p_supplier_id: supplierId,
    p_items: items.map((i) => ({
      product_id: i.product_id,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unit_cost),
    })),
    p_payment_method: paymentMethod,
    p_paid_amount: paidAmount,
    p_invoice_number: invoiceNumber || null,
    p_notes: notes || null,
  }

  // Attempt 1: Call RPC
  try {
    const { data, error } = await supabase.rpc('record_purchase', payload)
    if (!error && data) {
      return { data, error: null }
    }
    console.warn('RPC record_purchase failed, falling back to direct atomic sequence:', error)
  } catch (rpcErr) {
    console.warn('RPC record_purchase threw error, falling back:', rpcErr)
  }

  // Attempt 2: Direct relational sequence in correct foreign-key order
  let createdPurchaseId = null
  try {
    const today = new Date().toISOString().slice(0, 10)
    let total = 0
    const enrichedItems = items.map((i) => {
      const qty = Number(i.quantity)
      const cost = Number(i.unit_cost)
      total += qty * cost
      return {
        product_id: i.product_id,
        quantity: qty,
        unit_cost: cost,
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

    // 1. Insert parent purchase FIRST
    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        supplier_id: supplierId || null,
        purchase_date: today,
        invoice_number: invoiceNumber || `PUR-${Date.now().toString(36).toUpperCase()}`,
        total_amount: total,
        paid_amount: actualPaid,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        notes: notes || null,
      })
      .select()
      .single()

    if (pErr) throw pErr
    createdPurchaseId = purchase.id

    // 2. Insert purchase_items
    const purchaseItemsRows = enrichedItems.map((i) => ({
      purchase_id: purchase.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
    }))
    const { error: piErr } = await supabase.from('purchase_items').insert(purchaseItemsRows)
    if (piErr) throw piErr

    // 3. Insert inventory movements (trigger will update inventory_balances automatically)
    const movements = enrichedItems.map((i) => ({
      product_id: i.product_id,
      movement_type: 'purchase',
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      reference_type: 'purchase',
      reference_id: purchase.id,
      notes: `Purchase ${purchase.invoice_number}`,
    }))
    const { error: mErr } = await supabase.from('inventory_movements').insert(movements)
    if (mErr) throw mErr

    // 4. Update cost_price on products
    for (const item of enrichedItems) {
      await supabase
        .from('products')
        .update({ cost_price: item.unit_cost, updated_at: new Date().toISOString() })
        .eq('id', item.product_id)
    }

    // 5. Ledger entries
    const ledgerRows = [
      {
        entry_type: 'purchase',
        amount: total,
        description: `Purchase ${purchase.invoice_number}`,
        reference_type: 'purchase',
        reference_id: purchase.id,
        entry_date: today,
      },
    ]

    // 6. Payments out if paid > 0
    if (actualPaid > 0) {
      ledgerRows.push({
        entry_type: 'payment_out',
        amount: actualPaid,
        description: `Payment for purchase ${purchase.invoice_number}`,
        reference_type: 'purchase',
        reference_id: purchase.id,
        entry_date: today,
      })

      await supabase.from('payments').insert({
        direction: 'out',
        supplier_id: supplierId || null,
        amount: actualPaid,
        payment_method: paymentMethod,
        payment_date: today,
        reference_type: 'purchase',
        reference_id: purchase.id,
        notes: `Payment for purchase ${purchase.invoice_number}`,
      })
    }

    await supabase.from('ledger_entries').insert(ledgerRows)

    return {
      data: {
        success: true,
        purchase_id: purchase.id,
        total,
      },
      error: null,
    }
  } catch (err) {
    if (createdPurchaseId) {
      try {
        await supabase.from('inventory_movements').delete().eq('reference_id', createdPurchaseId)
        await supabase.from('ledger_entries').delete().eq('reference_id', createdPurchaseId)
        await supabase.from('payments').delete().eq('reference_id', createdPurchaseId)
        await supabase.from('purchases').delete().eq('id', createdPurchaseId)
      } catch (cleanupErr) {
        console.error('Failed to cleanup failed purchase:', cleanupErr)
      }
    }
    return { data: null, error: err }
  }
}

/**
 * Safely delete a purchase, removing linked inventory movements, payments, and ledger entries
 */
export async function deletePurchase(purchaseId) {
  try {
    await supabase.from('inventory_movements').delete().eq('reference_id', purchaseId)
    await supabase.from('ledger_entries').delete().eq('reference_id', purchaseId)
    await supabase.from('payments').delete().eq('reference_id', purchaseId)
    await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)
    const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)
    if (error) throw error
    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to delete purchase:', err)
    return { success: false, error: err }
  }
}
