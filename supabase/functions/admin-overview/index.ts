import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const loginAliasDomain = '@login.haru-han-kan.invalid';
const allowedOrigins = new Set(['https://heethink.github.io']);

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return response({}, 200, origin);
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return response({ error: 'Origin not allowed' }, 403, origin);

  const authorization = request.headers.get('Authorization');
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization || !projectUrl || !publishableKey || !serviceRoleKey) {
    return response({ error: 'Service unavailable' }, 503, origin);
  }

  try {
    const callerClient = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } }
    });
    const { data: callerResult, error: authError } = await callerClient.auth.getUser();
    const caller = callerResult.user;
    if (authError || !caller) return response({ error: 'Authentication required' }, 401, origin);
    if (caller.app_metadata?.role !== 'admin') return response({ error: 'Administrator access required' }, 403, origin);

    const adminClient = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const users = [];
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return response({ error: 'Could not load accounts' }, 500, origin);
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const loginIds = new Map<string, string>();
    const members = users.map(user => {
      const email = user.email || '';
      const loginId = email.toLowerCase().endsWith(loginAliasDomain)
        ? email.slice(0, -loginAliasDomain.length)
        : email || '이메일 계정';
      loginIds.set(user.id, loginId);
      return { loginId, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const { data: notes, error: notesError } = await adminClient
      .from('notes')
      .select('user_id, text, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (notesError) return response({ error: 'Could not load notes' }, 500, origin);

    return response({
      members,
      notes: (notes || []).map(note => ({
        loginId: loginIds.get(note.user_id) || '알 수 없는 계정',
        text: note.text,
        createdAt: note.created_at
      })),
      notesLimitReached: (notes || []).length === 1000
    }, 200, origin);
  } catch {
    return response({ error: 'Unexpected server error' }, 500, origin);
  }
});
