const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const htmlFiles = ['index.html', 'organizer.html', 'login.html'];
const errors = [];
const checkedScripts = new Set();

for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);

    for (const reference of references) {
        if (/^(?:https?:|data:|#|mailto:)/i.test(reference)) continue;
        const cleanReference = reference.split(/[?#]/, 1)[0];
        const target = path.resolve(root, cleanReference);
        if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) {
            errors.push(`${htmlFile}: referência local ausente ou inválida: ${reference}`);
        }
        if (target.endsWith('.js') && fs.existsSync(target)) checkedScripts.add(target);
    }
}

for (const directory of ['assets/js']) {
    for (const entry of fs.readdirSync(path.join(root, directory))) {
        if (entry.endsWith('.js')) checkedScripts.add(path.join(root, directory, entry));
    }
}

for (const script of checkedScripts) {
    try {
        new vm.Script(fs.readFileSync(script, 'utf8'), { filename: path.relative(root, script) });
    } catch (error) {
        errors.push(error.message);
    }
}

const sourceFiles = [...htmlFiles, ...[...checkedScripts].map(file => path.relative(root, file))];
for (const sourceFile of sourceFiles) {
    const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');
    if (/sb_secret_|SUPABASE_SERVICE_ROLE/i.test(source)) {
        errors.push(`${sourceFile}: possível chave secreta no código público`);
    }
}

const sql = fs.readFileSync(path.join(root, 'database', 'supabase.sql'), 'utf8');
for (const requiredSql of [
    'alter table public.focus_user_states enable row level security',
    'alter table public.focus_user_state_history enable row level security',
    'create trigger archive_focus_user_state_trigger',
    'revoke all on function public.delete_own_account() from public, anon'
]) {
    if (!sql.toLowerCase().includes(requiredSql.toLowerCase())) {
        errors.push(`database/supabase.sql: proteção ausente: ${requiredSql}`);
    }
}

if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`OK: ${htmlFiles.length} páginas, ${checkedScripts.size} scripts e referências locais válidas.`);
}
