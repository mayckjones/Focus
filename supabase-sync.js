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
        // Salvamentos bem-sucedidos acontecem em silêncio para não interromper o fluxo.
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

        const email = user.email || 'Conta Focus';
        const initials = email.slice(0, 2).toUpperCase();
        const applyAvatar = async (path) => {
            if (!path) return;
            const { data } = await client.storage.from('focus-avatars').createSignedUrl(path, 3600);
            if (data?.signedUrl) { trigger.style.backgroundImage = `url("${data.signedUrl}")`; trigger.style.backgroundSize = 'cover'; trigger.textContent = ''; }
        };
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'focus-account-button';
        trigger.textContent = initials;
        trigger.title = 'Abrir perfil';

        const panel = document.createElement('div');
        panel.className = 'focus-account-panel';
        panel.hidden = true;
        panel.innerHTML = `<div class="focus-account-summary"><div class="focus-account-avatar">${initials}</div><div class="focus-account-email">${email}</div></div><div class="focus-account-actions"><button type="button" class="focus-avatar-action">Foto de perfil</button><button type="button" class="focus-avatar-remove" ${user.user_metadata?.avatar_path ? '' : 'disabled'}>Remover foto</button><button type="button" class="focus-password-action">Trocar senha</button><button type="button" disabled>Baixar dados</button></div>`;
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp'; fileInput.hidden = true;
        const avatarAction = panel.querySelector('.focus-avatar-action');
        const removeAvatar = panel.querySelector('.focus-avatar-remove');
        const passwordAction = panel.querySelector('.focus-password-action');
        passwordAction.addEventListener('click', () => {
            if (panel.querySelector('.focus-password-form')) return;
            const form = document.createElement('form');
            form.className = 'focus-password-form';
            form.innerHTML = '<input required type="password" name="current" placeholder="Senha atual"><input required minlength="6" type="password" name="next" placeholder="Nova senha (mín. 6)"><input required minlength="6" type="password" name="confirm" placeholder="Confirmar nova senha"><button type="button" class="focus-toggle-passwords" aria-pressed="false">Mostrar senhas</button><button type="submit">Salvar senha</button><p aria-live="polite"></p>';
            form.querySelector('.focus-toggle-passwords').addEventListener('click', (toggle) => {
                const visible = toggle.currentTarget.getAttribute('aria-pressed') !== 'true';
                form.querySelectorAll('input').forEach(input => { input.type = visible ? 'text' : 'password'; });
                toggle.currentTarget.setAttribute('aria-pressed', String(visible));
                toggle.currentTarget.textContent = visible ? 'Ocultar senhas' : 'Mostrar senhas';
            });
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const next = data.get('next');
                const status = form.querySelector('p');
                const submit = form.querySelector('button[type="submit"]');
                const setStatus = (message, type) => {
                    status.textContent = message;
                    status.dataset.type = type;
                };

                if (next !== data.get('confirm')) {
                    setStatus('As senhas não coincidem.', 'error');
                    return;
                }

                submit.disabled = true;
                submit.textContent = 'Confirmando…';
                try {
                    const accountEmail = currentUser?.email || email;
                    const { error: authError } = await client.auth.signInWithPassword({ email: accountEmail, password: data.get('current') });
                    if (authError) {
                        console.error('Falha ao reautenticar:', authError);
                        setStatus('Não foi possível validar a senha atual. A senha não foi alterada.', 'error');
                        return;
                    }
                    const { error } = await client.auth.updateUser({ password: next });
                    if (error) {
                        console.error('Falha ao atualizar a senha:', error);
                        setStatus('Não foi possível alterar a senha. Tente novamente.', 'error');
                        return;
                    }
                    setStatus('Senha alterada com sucesso.', 'success');
                    form.reset();
                } catch (error) {
                    console.error('Erro ao alterar senha:', error);
                    setStatus('Não foi possível concluir a alteração agora. Tente novamente.', 'error');
                } finally {
                    submit.disabled = false;
                    submit.textContent = 'Salvar senha';
                }
            });
            panel.querySelector('.focus-account-actions').appendChild(form);
        });
        avatarAction.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0]; if (!file) return;
            if (file.size > 2 * 1024 * 1024) { showCloudStatus('A foto deve ter no máximo 2 MB', 'warning'); return; }
            avatarAction.disabled = true;
            try {
                const path = `${user.id}/avatar.${file.name.split('.').pop().toLowerCase()}`;
                const { error } = await client.storage.from('focus-avatars').upload(path, file, { upsert: true, contentType: file.type });
                if (error) throw error;
                const previousPath = user.user_metadata?.avatar_path;
                if (previousPath && previousPath !== path) await client.storage.from('focus-avatars').remove([previousPath]);
                const { error: metadataError } = await client.auth.updateUser({ data: { avatar_path: path } });
                if (metadataError) throw metadataError;
                user.user_metadata.avatar_path = path;
                await applyAvatar(path);
                removeAvatar.disabled = false;
            } catch (error) { console.error('Erro ao enviar avatar:', error); showCloudStatus('Não foi possível enviar a foto', 'error'); }
            finally { avatarAction.disabled = false; fileInput.value = ''; }
        });
        removeAvatar.addEventListener('click', async () => {
            const path = user.user_metadata?.avatar_path;
            if (!path) return;
            removeAvatar.disabled = true;
            try {
                const { error } = await client.storage.from('focus-avatars').remove([path]);
                if (error) throw error;
                const { error: metadataError } = await client.auth.updateUser({ data: { avatar_path: null } });
                if (metadataError) throw metadataError;
                trigger.style.backgroundImage = '';
                trigger.textContent = initials;
                user.user_metadata.avatar_path = null;
            } catch (error) { console.error('Erro ao remover avatar:', error); showCloudStatus('Não foi possível remover a foto', 'error'); }
        });
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Sair';
        panel.querySelector('.focus-account-actions').appendChild(button);
        trigger.addEventListener('click', () => { panel.hidden = !panel.hidden; });
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

        menu.append(trigger, panel, fileInput);
        const accountArea = document.querySelector('.header-actions, .top-actions');
        (accountArea || document.body).appendChild(menu);
        applyAvatar(user.user_metadata?.avatar_path);
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
