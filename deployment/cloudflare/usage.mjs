// The preview worker forwards only this fixed write RPC. No service credential is needed.
export async function collectUsage(request, env, preview) {
  const done = status => new Response(null, {status, headers:{'Cache-Control':'no-store'}});
  if (request.method !== 'POST') return done(405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return done(403);
  if (!request.body) return done(400);
  if (Number(request.headers.get('Content-Length')) > 1024) return done(413);
  const project = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!project || !key) return done(503);
  try {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0, raw = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024) { await reader.cancel(); return done(413); }
      raw += decoder.decode(chunk.value,{stream:true});
    }
    raw += decoder.decode();
    const {page,browser,view,seq,seconds,active} = JSON.parse(raw);
    if (typeof page !== 'string' || !Number.isSafeInteger(seq) || !Number.isSafeInteger(seconds) ||
        typeof active !== 'boolean' || typeof browser !== 'string' || typeof view !== 'string') return done(400);
    const site = page.startsWith('admin-') ? 'admin' : preview ? 'demo' : 'service';
    const result = await fetch(new URL('/rest/v1/rpc/record_site_usage', project), {
      method:'POST', headers:{apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({p_site:site,p_page:page,p_browser:browser,p_view:view,p_seq:seq,p_seconds:seconds,p_active:active})
    });
    return done(result.ok ? 204 : 503);
  } catch { return done(400); }
}
