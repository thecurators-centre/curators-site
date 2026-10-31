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

    const body = await req.json()
    const { 
      login, password, full_name, role, teacher_id, 
      surname, name, patronymic, age, grade, 
      subjects, level, hourly_rate, about_student,
      schedule_month, schedule_year, schedule_days,
      tests, topics, iom
    } = body

    if (!login || !password) throw new Error('Не передан логин или пароль')

    let email = login;
    if (role === 'student') email = `${login}@student.curators.local`;

    // 1. Создаем пользователя в Auth
    const { data: user, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    })

    if (authError) {
      return new Response(JSON.stringify({ error: `Auth Error: ${authError.message}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Создаем профиль
    const { error: profileError } = await supabaseAdmin.from('profiles').insert([{
      id: user.user.id, role: role, full_name: full_name || `${surname} ${name}`, login: login
    }])

    if (profileError) {
      // Откат: удаляем пользователя из Auth
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      return new Response(JSON.stringify({ error: `Profile Error: ${profileError.message}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Если ученик, создаем запись в students
    if (role === 'student') {
      const { error: studentError } = await supabaseAdmin.from('students').insert([{
        id: user.user.id,
        login: login,
        password: password,
        surname: surname || '',
        name: name || '',
        patronymic: patronymic || '', // Передаем отчество
        age: age ? parseInt(age) : null,
        grade: grade || '',
        subjects: subjects || '',
        level: level ? parseInt(level) : 3,
        hourly_rate: hourly_rate ? parseInt(hourly_rate) : null,
        about_student: about_student || '',
        schedule_month: schedule_month || '0',
        schedule_year: schedule_year || '2026',
        schedule_days: schedule_days || '',
        tests: tests || '',
        topics: topics || '',
        iom: iom || '',
        teacher_id: teacher_id || null
      }])

      if (studentError) {
        // Откат: удаляем профиль и пользователя из Auth
        await supabaseAdmin.from('profiles').delete().eq('id', user.user.id);
        await supabaseAdmin.auth.admin.deleteUser(user.user.id);
        return new Response(JSON.stringify({ error: `Student Error: ${studentError.message}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: `General Error: ${error.message}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
