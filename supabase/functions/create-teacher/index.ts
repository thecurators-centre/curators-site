import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { login, password, full_name, role, teacher_id } = await req.json()

    // Если это ученик, формируем фейковый email
    let email = login;
    if (role === 'student') {
      email = `${login}@student.curators.local`;
    }

    // 1. Создаем пользователя в Auth
    const { data: user, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    })

    if (authError) throw authError

    // 2. Создаем профиль в profiles
    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
      id: user.user.id,
      role: role,
      full_name: full_name,
      login: login // Сохраняем чистый логин без домена
    }])

    if (profileError) throw profileError

    // 3. Если это ученик, создаем запись в таблице students
    if (role === 'student') {
      const { error: studentError } = await supabaseAdmin.from('students').insert([{
        id: user.user.id, // Связываем ID ученика с ID в Auth
        login: login,
        password: password, // Временно оставляем для обратной совместимости, но лучше потом убрать
        name: full_name.split(' ')[1] || '', // Грубое разделение ФИО
        surname: full_name.split(' ')[0] || '',
        teacher_id: teacher_id || null
      }])

      if (studentError) throw studentError
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
