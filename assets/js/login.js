const form = document.getElementById('auth-form');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const confirmationField = document.getElementById('confirmation-field');
const confirmationInput = document.getElementById('password-confirmation');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submit-button');
const message = document.getElementById('message');
let mode = 'login';

function setMode(nextMode) {
    mode = nextMode;
    const login = mode === 'login';
    loginTab.classList.toggle('active', login);
    signupTab.classList.toggle('active', !login);
    confirmationField.classList.toggle('hidden', login);
    confirmationInput.required = !login;
    confirmationInput.value = '';
    passwordInput.minLength = login ? 6 : 8;
    passwordInput.autocomplete = login ? 'current-password' : 'new-password';
    passwordInput.placeholder = login ? 'Sua senha' : 'Mínimo de 8 caracteres';
    submitButton.textContent = login ? 'Entrar' : 'Criar conta';
    document.getElementById('title').textContent = login ? 'Acesse sua conta' : 'Crie sua conta';
    message.className = 'message hidden';
}

function showMessage(text, type) {
    message.textContent = text;
    message.className = `message ${type}`;
}

function friendlyError(error) {
    const text = (error?.message || '').toLowerCase();
    if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (text.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
    if (text.includes('user already registered')) return 'Este e-mail já possui uma conta.';
    return error?.message || 'Não foi possível concluir. Tente novamente.';
}

loginTab.addEventListener('click', () => setMode('login'));
signupTab.addEventListener('click', () => setMode('signup'));

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.focusSupabase) {
        showMessage('Preencha a URL e a chave pública em assets/js/supabase-config.js.', 'error');
        return;
    }

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (mode === 'signup' && password.length < 8) {
        showMessage('Use uma senha com pelo menos 8 caracteres.', 'error');
        return;
    }

    if (mode === 'signup' && password !== confirmationInput.value) {
        showMessage('As senhas não são iguais.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === 'login' ? 'Entrando...' : 'Criando...';

    try {
        if (mode === 'login') {
            const { error } = await window.focusSupabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            const params = new URLSearchParams(location.search);
            const requestedPage = params.get('returnTo') || '';
            const destination = requestedPage.startsWith('index.html')
                ? requestedPage
                : 'organizer.html';
            location.replace(destination);
        } else {
            const { data, error } = await window.focusSupabase.auth.signUp({ email, password });
            if (error) throw error;
            if (data.session) {
                location.replace('organizer.html');
            } else {
                form.reset();
                showMessage('Conta criada! Confira seu e-mail e clique no link de confirmação.', 'success');
            }
        }
    } catch (error) {
        console.error('Erro de autenticação:', error);
        showMessage(friendlyError(error), 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
    }
});

if (window.focusSupabase) {
    window.focusSupabase.auth.getSession().then(({ data }) => {
        if (data.session) location.replace('organizer.html');
    });
} else {
    showMessage('Falta apenas configurar a URL e a chave pública do Supabase.', 'info');
}
