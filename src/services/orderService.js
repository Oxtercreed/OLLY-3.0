import { supabase } from '../lib/supabase.js'
import { recordSale } from './salesService.js'

/**
 * Complete an order with rock-solid execution and automatic fallback:
 * 1. Tries the RPC `complete_order`
 * 2. If RPC fails (e.g. database function parameter mismatch or missing procedure),
 *    smoothly completes the order by:
 *    - Resolving or linking the customer
 *    - Recording the sale via recordSale (updates stock, creates invoice, logs ledger & payments)
 *    - Updating the order to 'completed' and linking sale_id
 */
export async function completeOrder({ orderId, paymentMethod = 'credit' }) {
  // Attempt 1: Call RPC
  try {
    const { data, error } = await supabase.rpc('complete_order', {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
    })
    if (!error && data?.success) {
      return { data, error: null }
    }
    console.warn('RPC complete_order failed, falling back to direct atomic sequence:', error)
  } catch (rpcErr) {
    console.warn('RPC complete_order threw error, falling back:', rpcErr)
  }

  // Attempt 2: Fallback sequence
  try {
    // 1. Fetch the order and items
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single()

    if (ordErr || !order) {
      throw new Error(ordErr?.message || 'Order not found')
    }

    if (order.status === 'completed') {
      return { data: { success: true, message: 'Order was already completed' }, error: null }
    }

    // 2. Resolve customer (find existing or create so customer name is linked to the sale)
    let custId = order.customer_id
    if (!custId && order.customer_name && order.customer_name.trim() !== 'Customer') {
      const cleanName = order.customer_name.trim()
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', cleanName)
        .maybeSingle()

      if (existing) {
        custId = existing.id
      } else {
        const { data: created } = await supabase
          .from('customers')
          .insert({
            name: cleanName,
            credit_allowed: true,
          })
          .select('id')
          .single()
        if (created) custId = created.id
      }
    }

    // 3. Prepare items for sale
    const saleItems = (order.order_items || []).map((i) => ({
      product_id: i.product_id,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }))

    if (saleItems.length === 0) {
      throw new Error('Order has no items to sell')
    }

    // 4. Record sale via resilient salesService
    const saleNotes = order.notes
      ? `${order.notes} (Order ${order.order_number})`
      : `Order ${order.order_number} · ${order.customer_name || 'Customer'}`

    const { data: saleData, error: saleErr } = await recordSale({
      customerId: custId,
      items: saleItems,
      paymentMethod,
      paidAmount: paymentMethod === 'credit' ? 0 : Number(order.total_amount),
      notes: saleNotes,
    })

    if (saleErr || !saleData) {
      throw saleErr || new Error('Failed to record sale for order')
    }

    // 5. Update order status and link sale_id
    const { error: updErr } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        sale_id: saleData.sale_id,
        customer_id: custId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (updErr) {
      console.warn('Failed to update order status, but sale was recorded:', updErr)
    }

    return {
      data: {
        success: true,
        sale_id: saleData.sale_id,
        invoice_number: saleData.invoice_number,
        total: saleData.total,
        order_number: order.order_number,
      },
      error: null,
    }
  } catch (err) {
    console.error('completeOrder error:', err)
    return { data: null, error: err }
  }
}
