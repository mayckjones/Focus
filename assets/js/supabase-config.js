/*
 * PREENCHA SOMENTE ESTES DOIS VALORES.
 * Use a Project URL e a Publishable key (ou anon public) do Supabase.
 * Nunca use a chave service_role em arquivos do site.
 */
const FOCUS_SUPABASE_URL = 'https://bfkgeptjxjkdxchvypoh.supabase.co';
const FOCUS_SUPABASE_PUBLIC_KEY = 'sb_publishable_bT2ix5gSBa9s33GXw_hSmw_wKDl3cKX';

const FOCUS_SUPABASE_CONFIGURED =
    FOCUS_SUPABASE_URL.startsWith('https://') &&
    !FOCUS_SUPABASE_URL.includes('SUA_URL_AQUI') &&
    FOCUS_SUPABASE_PUBLIC_KEY.length > 20 &&
    !FOCUS_SUPABASE_PUBLIC_KEY.includes('SUA_CHAVE_PUBLICAVEL_AQUI');

window.focusSupabase = FOCUS_SUPABASE_CONFIGURED
    ? window.supabase.createClient(FOCUS_SUPABASE_URL, FOCUS_SUPABASE_PUBLIC_KEY)
    : null;

