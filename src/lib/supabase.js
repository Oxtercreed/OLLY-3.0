import { createClient } from '@supabase/supabase-js'

const supabaseUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : undefined
const supabaseAnonKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl || 'https://hjvuyzjgkddkqjnilmtf.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdnV5empna2Rka3FqbmlsbXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTU5OTUsImV4cCI6MjEwNjI3MTk5NX0.t2jSqewjrfA1FVw0qeKMuKBgbxW41dDZ6Q7tq-TyZ5E'
)
