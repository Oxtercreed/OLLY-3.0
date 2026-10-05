import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { requestNotificationPermission, subscribePush, showLocalNotification } from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { formatMoney, formatNumber } from '../../utils/format'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { cn } from '../../utils/cn'

export default function SettingsPage() {
  const { addToast } = useToast()
  const { signOut, user } = useAuth()
  const { lang, setLang, t } = useLanguage()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [recipes, setRecipes] = useState([])
  const [allMaterials, setAllMaterials] = useState([])
  const [tab, setTab] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [editRecipe, setEditRecipe] = useState(null)
  const [recipeItems, setRecipeItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', type: 'finished_good', unit: 'pcs', selling_price: '', cost_price: '', reorder_level: '', opening_stock: '' })
  const [profile, setProfile] = useState({ full_name: '', business_name: 'OLLY', phone: '' })
  const [editProduct, setEditProduct] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: r }, { data: mats }] = await Promise.all([
      supabase.from('products').select('id, name, type, unit, selling_price, cost_price, reorder_level, is_active').eq('is_active', true).order('type').order('name'),
      supabase.from('recipes').select('id, product_id, name, yield_quantity, recipe_items(id, product_id, quantity, products(name, unit))'),
      supabase.from('products').select('id, name, unit, type').in('type', ['raw_material', 'packaging']).eq('is_active', true).order('name'),
    ])
    setProducts(p || [])
    setRecipes(r || [])
    setAllMaterials(mats || [])
    if (user) {
      const { data: prof } = await supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (prof) setProfile({ full_name: prof.full_name || '', business_name: prof.business_name || 'OLLY', phone: prof.phone || '' })
      else if (user.user_metadata?.full_name) setProfile((pr) => ({ ...pr, full_name: user.user_metadata.full_name }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: user.id,
        full_name: profile.full_name,
        business_name: profile.business_name,
        phone: profile.phone,
        language: lang,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      addToast(lang === 'sw' ? 'Wasifu umehifadhiwa' : 'Profile saved')
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    if (e) e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      addToast(lang === 'sw' ? 'Nenosiri lazima liwe na herufi 6 au zaidi' : 'Password must be at least 6 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      addToast(lang === 'sw' ? 'Manenosiri hayafanani' : 'Passwords do not match', 'error')
      return
    }
    setPasswordLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      addToast(lang === 'sw' ? 'Nenosiri limesasishwa kikamilifu!' : 'Password updated successfully!', 'success')
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch (err) {
      addToast(err.message || 'Failed to update password', 'error')
    } finally {
      setPasswordLoading(false)
    }
  }

  function openRecipe(recipe) {
    setEditRecipe(recipe)
    setRecipeItems(
      (recipe.recipe_items || []).map((ri) => ({
        product_id: ri.product_id,
        quantity: Number(ri.quantity),
        name: ri.products?.name,
        unit: ri.products?.unit,
      }))
    )
  }

  function openNewRecipe(product) {
    const existing = recipes.find((r) => r.product_id === product.id)
    if (existing) { openRecipe(existing); return }
    setEditRecipe({ id: null, product_id: product.id, name: `${product.name} Recipe`, yield_quantity: 1 })
    setRecipeItems([])
  }

  async function saveRecipe() {
    if (!editRecipe) return
    setSaving(true)
    try {
      let recipeId = editRecipe.id
      if (!recipeId) {
        const { data, error } = await supabase.from('recipes').insert({ product_id: editRecipe.product_id, name: editRecipe.name, yield_quantity: 1 }).select().single()
        if (error) throw error
        recipeId = data.id
      }
      await supabase.from('recipe_items').delete().eq('recipe_id', recipeId)
      const validItems = recipeItems.filter((i) => i.product_id && Number(i.quantity) > 0)
      if (validItems.length > 0) {
        const { error } = await supabase.from('recipe_items').insert(
          validItems.map((i) => ({ recipe_id: recipeId, product_id: i.product_id, quantity: Number(i.quantity) }))
        )
        if (error) throw error
      }
      addToast(lang === 'sw' ? 'Kichocheo kimehifadhiwa' : 'Recipe saved')
      setEditRecipe(null)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function addProduct() {
    if (!newProduct.name.trim()) return
    setSaving(true)
    try {
      const { data: prod, error } = await supabase.from('products').insert({
        name: newProduct.name.trim(),
        type: newProduct.type,
        unit: newProduct.unit.trim() || 'pcs',
        cost_price: Number(newProduct.cost_price) || 0,
        selling_price: newProduct.type === 'finished_good' ? (Number(newProduct.selling_price) || 0) : 0,
        reorder_level: Number(newProduct.reorder_level) || 0,
        is_active: true,
      }).select().single()
      if (error) throw error

      if (Number(newProduct.opening_stock) > 0) {
        await supabase.from('inventory_balances').upsert({
          product_id: prod.id,
          quantity: Number(newProduct.opening_stock),
        })
        await supabase.from('inventory_movements').insert({
          product_id: prod.id,
          movement_type: 'adjustment',
          quantity: Number(newProduct.opening_stock),
          unit_cost: Number(newProduct.cost_price) || 0,
          notes: 'Opening stock',
        })
      }

      addToast(lang === 'sw' ? 'Bidhaa imeongezwa' : 'Product added')
      setShowAddProduct(false)
      setNewProduct({ name: '', type: 'finished_good', unit: 'pcs', selling_price: '', cost_price: '', reorder_level: '', opening_stock: '' })
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveEditProduct() {
    if (!editProduct) return
    setSaving(true)
    try {
      const { error } = await supabase.from('products').update({
        name: editProduct.name,
        cost_price: Number(editProduct.cost_price) || 0,
        selling_price: Number(editProduct.selling_price) || 0,
        reorder_level: Number(editProduct.reorder_level) || 0,
        unit: editProduct.unit,
      }).eq('id', editProduct.id)
      if (error) throw error
      addToast(lang === 'sw' ? 'Bidhaa imesasishwa' : 'Product updated')
      setEditProduct(null)
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(id) {
    if (!confirm(lang === 'sw' ? 'Futa bidhaa hii?' : 'Delete this product?')) return
    try {
      const { error } = await supabase.rpc('soft_delete_product', { p_product_id: id })
      if (error) throw error
      addToast(lang === 'sw' ? 'Bidhaa imefutwa' : 'Product deleted')
      await load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const tabs = [
    { id: 'profile', label: t('profile') },
    { id: 'products', label: t('products') },
    { id: 'recipes', label: t('recipes') },
    { id: 'business', label: t('business') },
  ]

  const byType = {
    raw_material: products.filter((p) => p.type === 'raw_material'),
    packaging: products.filter((p) => p.type === 'packaging'),
    finished_good: products.filter((p) => p.type === 'finished_good'),
  }
  const finishedGoods = products.filter((p) => p.type === 'finished_good')

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('settings')}</h1>
          <p className="text-sm text-[#707070] mt-0.5">Profile, language, products & recipes</p>
        </div>
        {tab === 'products' && (
          <Button onClick={() => setShowAddProduct(true)}><Plus className="w-4 h-4" /> Add product</Button>
        )}
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={cn('px-4 py-2 rounded-full text-sm whitespace-nowrap',
              tab === tb.id ? 'bg-[#181818] text-white' : 'bg-white border border-[#E8E8E5]')}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-4 max-w-md">
          <Card className="space-y-3">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-16 h-16 rounded-full bg-[#181818] text-white flex items-center justify-center text-xl font-semibold">
                {(profile.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium">{profile.full_name || 'Your name'}</p>
                <p className="text-sm text-[#707070]">{user?.email}</p>
              </div>
            </div>
            <Input label={lang === 'sw' ? 'Jina' : 'Full name'} value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            <Input label={lang === 'sw' ? 'Jina la biashara' : 'Business name'} value={profile.business_name}
              onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} />
            <Input label={lang === 'sw' ? 'Simu' : 'Phone'} value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            <Button loading={saving} onClick={saveProfile}>{t('save')}</Button>
          </Card>

          <Card>
            <p className="font-medium mb-3">{t('language')} / Lugha</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setLang('en')}
                className={cn('flex-1 py-3 rounded-xl border-2 text-sm font-medium',
                  lang === 'en' ? 'border-[#181818] bg-[#181818] text-white' : 'border-[#E8E8E5]')}>
                English
              </button>
              <button type="button" onClick={() => setLang('sw')}
                className={cn('flex-1 py-3 rounded-xl border-2 text-sm font-medium',
                  lang === 'sw' ? 'border-[#181818] bg-[#181818] text-white' : 'border-[#E8E8E5]')}>
                Kiswahili
              </button>
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-[#707070]" />
              <p className="font-medium">{lang === 'sw' ? 'Badili Nenosiri' : 'Change Password'}</p>
            </div>
            <p className="text-xs text-[#707070]">
              {lang === 'sw'
                ? 'Weka nenosiri jipya lenye herufi zisizopungua 6'
                : 'Enter a new password with at least 6 characters'}
            </p>
            <div className="relative">
              <Input
                label={lang === 'sw' ? 'Nenosiri jipya' : 'New password'}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
              />
              <button
                type="button"
                className="absolute right-3 top-[34px] text-[#707070] hover:text-[#181818] transition-colors p-1"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input
              label={lang === 'sw' ? 'Thibitisha nenosiri' : 'Confirm password'}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
            />
            <Button
              loading={passwordLoading}
              onClick={handleChangePassword}
              disabled={!newPassword || !confirmPassword}
            >
              {lang === 'sw' ? 'Sasisha Nenosiri' : 'Update Password'}
            </Button>
          </Card>
        </div>
      )}

      {tab === 'business' && (
        <div className="space-y-4 max-w-md">
          <Card>
            <h3 className="font-semibold mb-2">{profile.business_name || 'OLLY'}</h3>
            <p className="text-sm text-[#707070]">Food-processing business system</p>
            <p className="text-sm text-[#707070] mt-4">Currency: TZS</p>
            {user && <p className="text-sm text-[#707070] mt-1">{user.email}</p>}
          </Card>
          <Button variant="secondary" className="w-full" onClick={async () => {
            try {
              await subscribePush(user?.id)
              await showLocalNotification('Olly', 'Push notifications are on for this device')
              addToast('Notifications enabled on this device')
            } catch (e) {
              addToast(e.message || 'Could not enable notifications', 'error')
            }
          }}>
            Enable notifications
          </Button>
          <Button variant="secondary" className="w-full" onClick={async () => { await signOut(); navigate('/login') }}>
            {t('signOut')}
          </Button>
        </div>
      )}

      {tab === 'recipes' && (
        loading ? <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-20" />)}</div>
        : (
          <div className="space-y-3">
            {finishedGoods.map((p) => {
              const recipe = recipes.find((r) => r.product_id === p.id)
              return (
                <Card key={p.id} className="!p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      {recipe ? (
                        <ul className="mt-2 space-y-1">
                          {(recipe.recipe_items || []).map((ri, i) => (
                            <li key={i} className="text-sm text-[#707070]">
                              {ri.products?.name}: {formatNumber(ri.quantity, 3)} {ri.products?.unit}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-[#B7833F] mt-1">No recipe</p>
                      )}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openNewRecipe(p)}>
                      <Pencil className="w-3.5 h-3.5" /> {recipe ? t('edit') : 'Create'}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      )}

      {tab === 'products' && (
        loading ? <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="skeleton h-16" />)}</div>
        : (
          <div className="space-y-6">
            {[
              { key: 'finished_good', label: 'Finished goods' },
              { key: 'raw_material', label: 'Raw materials' },
              { key: 'packaging', label: 'Packaging' },
            ].map((section) => (
              <div key={section.key}>
                <h3 className="text-sm font-medium text-[#707070] mb-2 uppercase tracking-wider">{section.label}</h3>
                <div className="space-y-2">
                  {byType[section.key].map((p) => (
                    <Card key={p.id} className="!p-4 flex justify-between items-center gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-[#707070] mt-0.5">
                          {p.unit} · Cost {formatMoney(p.cost_price)}
                          {p.type === 'finished_good' ? ` · Sell ${formatMoney(p.selling_price)}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" className="p-2 rounded-lg hover:bg-[#F7F7F5]" onClick={() => setEditProduct({ ...p })}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" className="p-2 rounded-lg hover:bg-[#B4534A]/10 text-[#B4534A]" onClick={() => deleteProduct(p.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={!!editRecipe} onClose={() => setEditRecipe(null)} title={editRecipe?.name || 'Edit recipe'} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-[#707070]">Ingredients per 1 unit of output</p>
          {recipeItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-[#707070]">Material</label>
                <select className="w-full h-11 px-3 rounded-xl border border-[#E8E8E5] text-sm"
                  value={item.product_id || ''}
                  onChange={(e) => {
                    const mat = allMaterials.find((m) => m.id === e.target.value)
                    setRecipeItems((items) => items.map((it, i) =>
                      i === idx ? { ...it, product_id: e.target.value, name: mat?.name, unit: mat?.unit } : it
                    ))
                  }}>
                    <option value="">Select...</option>
                    {allMaterials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                    ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-xs text-[#707070]">Qty</label>
                <input type="number" step="0.001" className="w-full h-11 px-3 rounded-xl border border-[#E8E8E5] tabular-nums text-sm"
                  value={item.quantity} onChange={(e) => setRecipeItems((items) =>
                    items.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it)
                  )} />
              </div>
              <button className="h-11 px-3 text-sm text-[#B4534A]" onClick={() => setRecipeItems((items) => items.filter((_, i) => i !== idx))}>
                Remove
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setRecipeItems((items) => [...items, { product_id: '', quantity: 0 }])}>
            <Plus className="w-4 h-4" /> Add ingredient
          </Button>
          <Button className="w-full" loading={saving} onClick={saveRecipe}>{t('save')}</Button>
        </div>
      </Modal>

      <Modal open={showAddProduct} onClose={() => setShowAddProduct(false)} title="Add product">
        <div className="space-y-3">
          <Input label="Name" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
          <div>
            <label className="text-sm text-[#707070]">Type</label>
            <select className="mt-1 w-full h-11 px-3 rounded-xl border border-[#E8E8E5]"
              value={newProduct.type} onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value })}>
              <option value="finished_good">Finished good</option>
              <option value="raw_material">Raw material</option>
              <option value="packaging">Packaging</option>
            </select>
          </div>
          <Input label="Unit" value={newProduct.unit} onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })} />
          {newProduct.type === 'finished_good' && (
            <Input label="Selling price" type="number" value={newProduct.selling_price}
              onChange={(e) => setNewProduct({ ...newProduct, selling_price: e.target.value })} />
          )}
          <Input label="Cost price" type="number" value={newProduct.cost_price}
            onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })} />
          <Input label="Reorder level" type="number" value={newProduct.reorder_level}
            onChange={(e) => setNewProduct({ ...newProduct, reorder_level: e.target.value })} />
          <Button className="w-full" loading={saving} disabled={!newProduct.name.trim()} onClick={addProduct}>{t('save')}</Button>
        </div>
      </Modal>

      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title={t('edit')}>
        {editProduct && (
          <div className="space-y-3">
            <Input label="Name" value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} />
            <Input label="Unit" value={editProduct.unit} onChange={(e) => setEditProduct({ ...editProduct, unit: e.target.value })} />
            <Input label="Cost price" type="number" value={editProduct.cost_price}
              onChange={(e) => setEditProduct({ ...editProduct, cost_price: e.target.value })} />
            {editProduct.type === 'finished_good' && (
              <Input label="Selling price" type="number" value={editProduct.selling_price}
                onChange={(e) => setEditProduct({ ...editProduct, selling_price: e.target.value })} />
            )}
            <Input label="Reorder level" type="number" value={editProduct.reorder_level}
              onChange={(e) => setEditProduct({ ...editProduct, reorder_level: e.target.value })} />
            <Button className="w-full" loading={saving} onClick={saveEditProduct}>{t('save')}</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
