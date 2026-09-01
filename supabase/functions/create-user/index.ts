import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verificar que el caller está autenticado y es admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear cliente con el JWT del caller para verificar su identidad
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: callerUser }, error: callerError } =
      await supabaseCaller.auth.getUser()

    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar rol admin desde user_metadata
    const callerRole = callerUser.user_metadata?.role
    if (callerRole !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden crear usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parsear body del request
    const { email, password, nombre, rol } = await req.json()

    if (!email || !password || !nombre || !rol) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: email, password, nombre, rol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['admin', 'compras', 'ventas', 'finanzas', 'comercial', 'diseno', 'auditor', 'trade_marketing'].includes(rol)) {
      return new Response(
        JSON.stringify({ error: 'Rol inválido. Debe ser: admin, compras, ventas, finanzas, comercial, diseno, auditor o trade_marketing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Crear usuario en auth.users usando service_role (admin API)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: rol, nombre }
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Crear perfil en tabla usuarios
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        auth_id: authData.user.id,
        email,
        nombre,
        rol,
        activo: true
      })
      .select()

    if (profileError) {
      // Rollback: eliminar el usuario de auth si falla el perfil
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return new Response(
        JSON.stringify({ error: 'Error creando perfil: ' + profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        user: profileData[0],
        message: 'Usuario creado exitosamente'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
