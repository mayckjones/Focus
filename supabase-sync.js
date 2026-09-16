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

    function getLocalJson(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn(`Não foi possível ler ${key} localmente:`, error);
            return null;
        }
    }

    function safeUserMetadata(metadata) {
        return Object.fromEntries(Object.entries(metadata || {}).filter(([key]) => !/(password|token|secret|key)/i.test(key)));
    }

    function readBlobAsDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    async function buildExport(user) {
        let cloudState = null;
        try {
            const { data, error } = await client
                .from('focus_user_states')
                .select('organizer_state, focus_state')
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            cloudState = data;
        } catch (error) {
            console.warn('Não foi possível obter a cópia na nuvem para exportação:', error);
        }

        const avatarPath = user.user_metadata?.avatar_path || null;
        let avatar = null;
        if (avatarPath) {
            try {
                const { data, error } = await client.storage.from('focus-avatars').createSignedUrl(avatarPath, 60);
                if (error) throw error;
                const response = await fetch(data.signedUrl);
                if (!response.ok) throw new Error(`Foto indisponível (${response.status})`);
                const blob = await response.blob();
                avatar = { path: avatarPath, type: blob.type || null, data_url: await readBlobAsDataUrl(blob) };
            } catch (error) {
                console.warn('Não foi possível incluir a foto na exportação:', error);
                avatar = { path: avatarPath, unavailable: true };
            }
        }

        const localOrganizerState = getLocalJson('focusOrganizerState');
        const localFocusState = getLocalJson('focusAppState');
        return {
            format: 'focus-export',
            exported_at: new Date().toISOString(),
            account: { email: user.email || null, metadata: safeUserMetadata(user.user_metadata) },
            organizer_state: localOrganizerState ?? cloudState?.organizer_state ?? null,
            focus_state: localFocusState ?? cloudState?.focus_state ?? null,
            profile_photo: avatar
        };
    }

    function downloadJson(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        anchor.href = url;
        anchor.download = `focus-dados-${date}.json`;
        anchor.hidden = true;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    }

    function taskReportHtml(task) {
        const days = Array.isArray(task.days) && task.days.length
            ? `<span class="days">${task.days.map(escapeHtml).join(' · ')}</span>` : '';
        const subtasks = Array.isArray(task.subtasks) && task.subtasks.length
            ? `<ul class="subtasks">${task.subtasks.map(subtask => `<li class="${subtask.completed ? 'done' : ''}"><span class="check">${subtask.completed ? '✓' : ''}</span>${escapeHtml(subtask.text)}</li>`).join('')}</ul>` : '';
        return `<li class="task ${task.completed ? 'done' : ''}"><div class="task-line"><span class="check">${task.completed ? '✓' : ''}</span><span class="task-text">${escapeHtml(task.text)}</span>${task.important ? '<span class="important" title="Importante">★</span>' : ''}${days}</div>${subtasks}</li>`;
    }

    function taskGroupReportHtml(title, tasks) {
        const list = Array.isArray(tasks) ? tasks : [];
        return `<section class="task-group"><h2>${escapeHtml(title)} <small>${list.length}</small></h2>${list.length ? `<ul class="tasks">${list.map(taskReportHtml).join('')}</ul>` : '<p class="empty">Nenhuma tarefa.</p>'}</section>`;
    }

    function buildReportHtml(exportData) {
        const organizer = exportData.organizer_state || {};
        const blocks = Array.isArray(organizer.blocks) ? organizer.blocks : [];
        const focus = exportData.focus_state || {};
        const photo = exportData.profile_photo?.data_url ? `<img class="avatar" src="${exportData.profile_photo.data_url}" alt="Foto de perfil">` : '';
        const focusSection = Array.isArray(focus.tasks) && focus.tasks.length
            ? `<section class="focus-session"><h2>Modo Foco atual</h2><p>${escapeHtml(focus.blockTitle || 'Sessão de foco')} · ${focus.tasks.length} tarefa(s)</p></section>` : '';
        return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório Focus</title><style>
            :root { color-scheme: light; } * { box-sizing:border-box; } body { max-width:900px; margin:0 auto; padding:42px 28px; color:#172033; background:#fff; font:14px/1.45 Inter,Segoe UI,Arial,sans-serif; } header { display:flex; gap:16px; align-items:center; padding-bottom:24px; border-bottom:2px solid #e5eaf1; } h1 { margin:0; font-size:28px; } header p { margin:4px 0 0; color:#667085; } .avatar { width:52px; height:52px; object-fit:cover; border-radius:50%; } .actions { margin:24px 0; } button { padding:10px 14px; color:#fff; background:#087ed5; border:0; border-radius:8px; font:600 13px inherit; cursor:pointer; } .task-group, .focus-session { margin-top:24px; break-inside:avoid; } h2 { margin:0 0 10px; padding-bottom:8px; font-size:17px; border-bottom:1px solid #e5eaf1; } h2 small { color:#667085; font-size:12px; font-weight:600; } .tasks, .subtasks { margin:0; padding:0; list-style:none; } .task { padding:10px 0; border-bottom:1px solid #edf0f4; } .task-line, .subtasks li { display:flex; align-items:center; gap:8px; } .check { width:18px; height:18px; display:inline-grid; flex:0 0 18px; place-items:center; color:#fff; background:#087ed5; border-radius:50%; font-size:12px; font-weight:700; } .task:not(.done) > .task-line > .check, .subtasks li:not(.done) .check { background:#fff; border:1px solid #98a2b3; } .done .task-text, .subtasks .done { color:#667085; text-decoration:line-through; } .important { color:#d49b18; font-size:16px; } .days { margin-left:auto; color:#475467; font-size:12px; } .subtasks { margin:8px 0 0 27px; } .subtasks li { padding:3px 0; font-size:13px; } .subtasks .check { width:15px; height:15px; flex-basis:15px; font-size:10px; } .empty { color:#667085; font-style:italic; } .focus-session { padding:14px; background:#f5f9fd; border-radius:10px; } .focus-session p { margin:0; color:#475467; } @media print { body { padding:0; } .actions { display:none; } }
        </style></head><body><header>${photo}<div><h1>Focus — Relatório de tarefas</h1><p>${escapeHtml(exportData.account.email || 'Conta Focus')} · Exportado em ${new Date(exportData.exported_at).toLocaleString('pt-BR')}</p></div></header><div class="actions"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button></div>${taskGroupReportHtml('Inbox', organizer.inbox)}${blocks.map(block => taskGroupReportHtml(block.title || 'Bloco sem título', block.tasks)).join('')}${focusSection}</body></html>`;
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
            if (data?.signedUrl) {
                [trigger, avatarPreview].forEach(element => {
                    element.style.backgroundImage = `url("${data.signedUrl}")`;
                    element.style.backgroundSize = 'cover';
                    element.style.backgroundPosition = 'center';
                    element.textContent = '';
                });
            }
        };
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'focus-account-button';
        trigger.textContent = initials;
        trigger.title = 'Abrir perfil';

        const panel = document.createElement('div');
        panel.className = 'focus-account-panel';
        panel.hidden = true;
        panel.innerHTML = `<div class="focus-account-summary"><div class="focus-account-avatar">${initials}</div><div class="focus-account-email">${email}</div></div><div class="focus-account-actions"><button type="button" class="focus-avatar-action">Foto de perfil</button><button type="button" class="focus-avatar-remove" ${user.user_metadata?.avatar_path ? '' : 'disabled'}>Remover foto</button><button type="button" class="focus-password-action">Trocar senha</button><button type="button" class="focus-export-action">Baixar dados</button><button type="button" class="focus-report-action">Relatório visual</button></div>`;
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp'; fileInput.hidden = true;
        const avatarAction = panel.querySelector('.focus-avatar-action');
        const removeAvatar = panel.querySelector('.focus-avatar-remove');
        const avatarPreview = panel.querySelector('.focus-account-avatar');
        const exportAction = panel.querySelector('.focus-export-action');
        const reportAction = panel.querySelector('.focus-report-action');
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
        exportAction.addEventListener('click', async () => {
            exportAction.disabled = true;
            exportAction.textContent = 'Preparando dados…';
            try {
                downloadJson(await buildExport(user));
                showCloudStatus('Download dos seus dados iniciado', 'success');
            } catch (error) {
                console.error('Erro ao exportar dados:', error);
                showCloudStatus('Não foi possível preparar o download', 'error');
            } finally {
                exportAction.disabled = false;
                exportAction.textContent = 'Baixar dados';
            }
        });
        reportAction.addEventListener('click', async () => {
            const reportWindow = window.open('', '_blank');
            if (!reportWindow) {
                showCloudStatus('Permita pop-ups para abrir o relatório', 'warning');
                return;
            }
            reportWindow.opener = null;
            reportWindow.document.write('<title>Preparando relatório…</title><p style="font:14px system-ui;padding:24px">Preparando relatório…</p>');
            reportWindow.document.close();
            reportAction.disabled = true;
            try {
                reportWindow.document.open();
                reportWindow.document.write(buildReportHtml(await buildExport(user)));
                reportWindow.document.close();
            } catch (error) {
                console.error('Erro ao preparar relatório:', error);
                reportWindow.close();
                showCloudStatus('Não foi possível preparar o relatório', 'error');
            } finally {
                reportAction.disabled = false;
            }
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
                [trigger, avatarPreview].forEach(element => {
                    element.style.backgroundImage = '';
                    element.style.backgroundPosition = '';
                    element.textContent = initials;
                });
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
