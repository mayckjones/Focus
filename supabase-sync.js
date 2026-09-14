(function () {
    'use strict';

    const client = window.focusSupabase;
    let currentUser = null;
    let organizerSaveTimer = null;
    let focusSaveTimer = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function showCloudStatus(message, type) {
        let badge = document.getElementById('focus-cloud-status');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'focus-cloud-status';
            badge.className = 'focus-cloud-status';
            document.body.appendChild(badge);
        }
        badge.textContent = message;
        badge.dataset.type = type || 'info';
        badge.hidden = false;

        if (type === 'success') {
            window.clearTimeout(showCloudStatus.timer);
            showCloudStatus.timer = window.setTimeout(() => {
                badge.hidden = true;
            }, 2200);
        }
    }

    async function getUser() {
        if (!client) return null;
        if (currentUser) return currentUser;

        // getSession() retorna session=null normalmente quando o visitante ainda
        // não entrou. getUser() produziria AuthSessionMissingError nesse cenário.
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        currentUser = data.session?.user || null;
        return currentUser;
    }

    async function requireUser() {
        if (!client) {
            showCloudStatus('Modo local: configure o Supabase', 'warning');
            return null;
        }

        try {
            const user = await getUser();
            if (!user) {
                const returnTo = encodeURIComponent(location.pathname.split('/').pop() + location.search);
                location.replace(`login.html?returnTo=${returnTo}`);
                return null;
            }
            installAccountButton(user);
            return user;
        } catch (error) {
            console.error('Erro ao verificar usuário:', error);
            showCloudStatus('Não foi possível verificar sua conta', 'error');
            return null;
        }
    }

    async function loadColumn(column) {
        const user = await getUser();
        if (!user) return null;

        const { data, error } = await client
            .from('focus_user_states')
            .select(column)
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        return data ? data[column] : null;
    }

    async function saveColumns(values) {
        const user = await getUser();
        if (!user) return;

        const { error } = await client
            .from('focus_user_states')
            .upsert({
                user_id: user.id,
                ...values,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;
        showCloudStatus('Salvo no Supabase', 'success');
    }

    function scheduleOrganizerSave(state) {
        if (!client || !currentUser) return;
        const snapshot = clone(state);
        window.clearTimeout(organizerSaveTimer);
        organizerSaveTimer = window.setTimeout(async () => {
            try {
                await saveColumns({ organizer_state: snapshot });
            } catch (error) {
                console.error('Erro ao salvar organizador no Supabase:', error);
                showCloudStatus('Salvo localmente; nuvem indisponível', 'error');
            }
        }, 450);
    }

    function scheduleFocusSave(state) {
        if (!client || !currentUser) return;
        const snapshot = clone(state);
        window.clearTimeout(focusSaveTimer);
        focusSaveTimer = window.setTimeout(async () => {
            try {
                await saveColumns({ focus_state: snapshot });
            } catch (error) {
                console.error('Erro ao salvar sessão de foco no Supabase:', error);
                showCloudStatus('Salvo localmente; nuvem indisponível', 'error');
            }
        }, 250);
    }

    async function clearFocusState() {
        if (!client || !currentUser) return;
        window.clearTimeout(focusSaveTimer);
        try {
            await saveColumns({ focus_state: {} });
        } catch (error) {
            console.error('Erro ao limpar sessão de foco no Supabase:', error);
        }
    }

    function installAccountButton(user) {
        if (document.getElementById('focus-account-menu')) return;

        const menu = document.createElement('div');
        menu.id = 'focus-account-menu';
        menu.className = 'focus-account-menu';

        const email = document.createElement('span');
        email.textContent = user.email || 'Conta Focus';
        email.title = user.email || '';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Sair';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                await client.auth.signOut({ scope: 'local' });
                location.replace('login.html');
            } catch (error) {
                console.error('Erro ao sair:', error);
                button.disabled = false;
                showCloudStatus('Não foi possível sair', 'error');
            }
        });

        menu.append(email, button);
        document.body.appendChild(menu);
    }

    if (client) {
        client.auth.onAuthStateChange((_event, session) => {
            currentUser = session?.user || null;
        });
    }

    window.FocusCloud = {
        configured: Boolean(client),
        requireUser,
        loadOrganizerState: () => loadColumn('organizer_state'),
        loadFocusState: () => loadColumn('focus_state'),
        scheduleOrganizerSave,
        scheduleFocusSave,
        clearFocusState,
        showStatus: showCloudStatus
    };
})();
