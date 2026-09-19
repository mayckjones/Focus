(function () {
    'use strict';

    const client = window.focusSupabase;
    let currentUser = null;
    let organizerSaveTimer = null;
    let focusSaveTimer = null;
    let cloudWriteQueue = Promise.resolve();
    let cloudRowExists = false;
    let knownRemoteUpdatedAt = null;

    const LOCAL_STATE_KEYS = ['focusOrganizerState', 'focusAppState'];
    const MAX_LOCAL_BACKUPS = 5;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function storageKey(baseKey, userId = currentUser?.id) {
        return userId ? `${baseKey}:${userId}` : baseKey;
    }

    function storageMetadataKey(baseKey, userId = currentUser?.id) {
        return `${storageKey(baseKey, userId)}:metadata`;
    }

    function storageBackupsKey(baseKey, userId = currentUser?.id) {
        return `${storageKey(baseKey, userId)}:backups`;
    }

    function migrateLegacyLocalState(user) {
        if (!user?.id) return;
        LOCAL_STATE_KEYS.forEach(baseKey => {
            const legacyValue = localStorage.getItem(baseKey);
            const scopedKey = storageKey(baseKey, user.id);
            if (legacyValue && !localStorage.getItem(scopedKey)) {
                localStorage.setItem(scopedKey, legacyValue);
                localStorage.setItem(storageMetadataKey(baseKey, user.id), JSON.stringify({
                    savedAt: null,
                    source: 'legacy-migration'
                }));
            }
            localStorage.removeItem(baseKey);
        });
    }

    function readLocalRecord(baseKey) {
        try {
            const raw = localStorage.getItem(storageKey(baseKey));
            const metadataRaw = localStorage.getItem(storageMetadataKey(baseKey));
            return {
                state: raw ? JSON.parse(raw) : null,
                savedAt: metadataRaw ? JSON.parse(metadataRaw).savedAt || null : null
            };
        } catch (error) {
            console.warn(`NÃ£o foi possÃ­vel ler ${baseKey} localmente:`, error);
            return { state: null, savedAt: null };
        }
    }

    function readLocalBackups(baseKey) {
        try {
            const raw = localStorage.getItem(storageBackupsKey(baseKey));
            return raw ? JSON.parse(raw) : [];
        } catch (error) {
            console.warn(`NÃ£o foi possÃ­vel ler os backups de ${baseKey}:`, error);
            return [];
        }
    }

    function writeLocalState(baseKey, value, options = {}) {
        const key = storageKey(baseKey);
        const serialized = JSON.stringify(value);
        const backupsKey = storageBackupsKey(baseKey);
        const metadataKey = storageMetadataKey(baseKey);
        try {
            const previous = localStorage.getItem(key);
            if (previous && previous !== serialized && options.backup !== false) {
                const backups = readLocalBackups(baseKey);
                backups.unshift({
                    savedAt: new Date().toISOString(),
                    reason: options.reason || 'before-change',
                    state: JSON.parse(previous)
                });
                try {
                    localStorage.setItem(backupsKey, JSON.stringify(backups.slice(0, MAX_LOCAL_BACKUPS)));
                } catch (backupError) {
                    // O estado atual tem prioridade quando o limite do navegador Ã© atingido.
                    console.warn(`NÃ£o foi possÃ­vel criar um backup local de ${baseKey}:`, backupError);
                }
            }
            try {
                localStorage.setItem(key, serialized);
            } catch (saveError) {
                // Libera somente backups derivados e tenta preservar o estado atual.
                localStorage.removeItem(backupsKey);
                localStorage.setItem(key, serialized);
            }
            localStorage.setItem(metadataKey, JSON.stringify({
                savedAt: options.savedAt || new Date().toISOString(),
                source: options.source || 'local'
            }));
            return true;
        } catch (error) {
            console.error(`NÃ£o foi possÃ­vel salvar ${baseKey} localmente:`, error);
            return false;
        }
    }

    function removeLocalState(baseKey) {
        localStorage.removeItem(storageKey(baseKey));
        localStorage.removeItem(storageMetadataKey(baseKey));
        localStorage.removeItem(storageBackupsKey(baseKey));
    }

    function cancelPendingSaves() {
        window.clearTimeout(organizerSaveTimer);
        window.clearTimeout(focusSaveTimer);
        organizerSaveTimer = null;
        focusSaveTimer = null;
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

        window.clearTimeout(showCloudStatus.timer);
        const hideAfter = type === 'success' ? 2200 : type === 'warning' ? 8000 : 10000;
        showCloudStatus.timer = window.setTimeout(() => {
            badge.hidden = true;
        }, hideAfter);
    }

    async function getUser() {
        if (!client) return null;
        if (currentUser) return currentUser;

        // getSession() retorna session=null normalmente quando o visitante ainda
        // nÃ£o entrou. getUser() produziria AuthSessionMissingError nesse cenÃ¡rio.
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
            migrateLegacyLocalState(user);
            installAccountButton(user);
            return user;
        } catch (error) {
            console.error('Erro ao verificar usuÃ¡rio:', error);
            showCloudStatus('NÃ£o foi possÃ­vel verificar sua conta', 'error');
            return null;
        }
    }

    async function loadColumnRecord(column) {
        const user = await getUser();
        if (!user) return { state: null, updatedAt: null, exists: false };
        const requestedUserId = user.id;

        const { data, error } = await client
            .from('focus_user_states')
            .select(`${column}, updated_at`)
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        if (currentUser?.id !== requestedUserId) {
            throw new Error('A conta mudou durante o carregamento dos dados.');
        }
        cloudRowExists = Boolean(data);
        knownRemoteUpdatedAt = data?.updated_at || null;
        return { state: data ? data[column] : null, updatedAt: data?.updated_at || null, exists: Boolean(data) };
    }

    async function saveColumns(values, expectedUserId) {
        const user = await getUser();
        if (!user || user.id !== expectedUserId) {
            throw new Error('Salvamento cancelado porque a conta ativa mudou.');
        }

        const nextUpdatedAt = new Date().toISOString();
        let data;
        let error;
        if (cloudRowExists && knownRemoteUpdatedAt) {
            ({ data, error } = await client
                .from('focus_user_states')
                .update({ ...values, updated_at: nextUpdatedAt })
                .eq('user_id', expectedUserId)
                .eq('updated_at', knownRemoteUpdatedAt)
                .select('updated_at')
                .maybeSingle());
            if (!error && !data) {
                const conflict = new Error('A nuvem possui uma versÃ£o mais recente. A cÃ³pia local foi preservada.');
                conflict.code = 'FOCUS_SYNC_CONFLICT';
                throw conflict;
            }
        } else {
            ({ data, error } = await client
                .from('focus_user_states')
                .insert({ user_id: expectedUserId, ...values, updated_at: nextUpdatedAt })
                .select('updated_at')
                .single());
            if (error?.code === '23505') {
                const conflict = new Error('Outra aba criou uma versÃ£o na nuvem. A cÃ³pia local foi preservada.');
                conflict.code = 'FOCUS_SYNC_CONFLICT';
                throw conflict;
            }
        }

        if (error) throw error;
        if (currentUser?.id !== expectedUserId) {
            throw new Error('A conta mudou durante o salvamento.');
        }
        cloudRowExists = true;
        knownRemoteUpdatedAt = data?.updated_at || nextUpdatedAt;
        // Salvamentos bem-sucedidos acontecem em silÃªncio para nÃ£o interromper o fluxo.
    }

    function enqueueCloudSave(values, expectedUserId) {
        const operation = cloudWriteQueue.then(() => saveColumns(values, expectedUserId));
        cloudWriteQueue = operation.catch(() => undefined);
        return operation;
    }

    function handleSaveError(label, error) {
        console.error(`Erro ao salvar ${label} no Supabase:`, error);
        showCloudStatus(
            error?.code === 'FOCUS_SYNC_CONFLICT'
                ? 'Conflito detectado: sua cÃ³pia local foi preservada'
                : 'Salvo localmente; nuvem indisponÃ­vel',
            error?.code === 'FOCUS_SYNC_CONFLICT' ? 'warning' : 'error'
        );
    }

    function scheduleOrganizerSave(state) {
        if (!client || !currentUser) return;
        const snapshot = clone(state);
        const expectedUserId = currentUser.id;
        window.clearTimeout(organizerSaveTimer);
        organizerSaveTimer = window.setTimeout(async () => {
            try {
                await enqueueCloudSave({ organizer_state: snapshot }, expectedUserId);
            } catch (error) {
                handleSaveError('organizador', error);
            }
        }, 450);
    }

    function scheduleFocusSave() {
        // Sessao de foco temporaria: nao persistir na nuvem.
    }

    async function clearFocusState() {
        // Sessao de foco temporaria: nao persistir na nuvem.
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
            console.warn('NÃ£o foi possÃ­vel obter a cÃ³pia na nuvem para exportaÃ§Ã£o:', error);
        }

        const avatarPath = user.user_metadata?.avatar_path || null;
        let avatar = null;
        if (avatarPath) {
            try {
                const { data, error } = await client.storage.from('focus-avatars').createSignedUrl(avatarPath, 60);
                if (error) throw error;
                const response = await fetch(data.signedUrl);
                if (!response.ok) throw new Error(`Foto indisponÃ­vel (${response.status})`);
                const blob = await response.blob();
                avatar = { path: avatarPath, type: blob.type || null, data_url: await readBlobAsDataUrl(blob) };
            } catch (error) {
                console.warn('NÃ£o foi possÃ­vel incluir a foto na exportaÃ§Ã£o:', error);
                avatar = { path: avatarPath, unavailable: true };
            }
        }

        const localOrganizerState = readLocalRecord('focusOrganizerState').state;
        const localFocusState = readLocalRecord('focusAppState').state;
        return {
            format: 'focus-export',
            exported_at: new Date().toISOString(),
            account: { email: user.email || null, metadata: safeUserMetadata(user.user_metadata) },
            organizer_state: localOrganizerState ?? cloudState?.organizer_state ?? null,
            focus_state: localFocusState ?? cloudState?.focus_state ?? null,
            local_backups: {
                organizer: readLocalBackups('focusOrganizerState'),
                focus: readLocalBackups('focusAppState')
            },
            profile_photo: avatar
        };
    }

    function downloadJson(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        anchor.href = url;
        anchor.download = `foque-em-checks-dados-${date}.json`;
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
            ? `<span class="days">${task.days.map(escapeHtml).join(' Â· ')}</span>` : '';
        const subtasks = Array.isArray(task.subtasks) && task.subtasks.length
            ? `<ul class="subtasks">${task.subtasks.map(subtask => `<li class="${subtask.completed ? 'done' : ''}"><span class="check">${subtask.completed ? 'âœ“' : ''}</span>${escapeHtml(subtask.text)}</li>`).join('')}</ul>` : '';
        return `<li class="task ${task.completed ? 'done' : ''}"><div class="task-line"><span class="check">${task.completed ? 'âœ“' : ''}</span><span class="task-text">${escapeHtml(task.text)}</span>${task.important ? '<span class="important" title="Importante">â˜…</span>' : ''}${days}</div>${subtasks}</li>`;
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
            ? `<section class="focus-session"><h2>Modo Foco atual</h2><p>${escapeHtml(focus.blockTitle || 'SessÃ£o de foco')} Â· ${focus.tasks.length} tarefa(s)</p></section>` : '';
        return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RelatÃ³rio Foque em Checks</title><style>
            :root { color-scheme: light; } * { box-sizing:border-box; } body { max-width:900px; margin:0 auto; padding:42px 28px; color:#172033; background:#fff; font:14px/1.45 Inter,Segoe UI,Arial,sans-serif; } header { display:flex; gap:16px; align-items:center; padding-bottom:24px; border-bottom:2px solid #e5eaf1; } h1 { margin:0; font-size:28px; } header p { margin:4px 0 0; color:#667085; } .avatar { width:52px; height:52px; object-fit:cover; border-radius:50%; } .actions { margin:24px 0; } button { padding:10px 14px; color:#fff; background:#087ed5; border:0; border-radius:8px; font:600 13px inherit; cursor:pointer; } .task-group, .focus-session { margin-top:24px; break-inside:avoid; } h2 { margin:0 0 10px; padding-bottom:8px; font-size:17px; border-bottom:1px solid #e5eaf1; } h2 small { color:#667085; font-size:12px; font-weight:600; } .tasks, .subtasks { margin:0; padding:0; list-style:none; } .task { padding:10px 0; border-bottom:1px solid #edf0f4; } .task-line, .subtasks li { display:flex; align-items:center; gap:8px; } .check { width:18px; height:18px; display:inline-grid; flex:0 0 18px; place-items:center; color:#fff; background:#087ed5; border-radius:50%; font-size:12px; font-weight:700; } .task:not(.done) > .task-line > .check, .subtasks li:not(.done) .check { background:#fff; border:1px solid #98a2b3; } .done .task-text, .subtasks .done { color:#667085; text-decoration:line-through; } .important { color:#d49b18; font-size:16px; } .days { margin-left:auto; color:#475467; font-size:12px; } .subtasks { margin:8px 0 0 27px; } .subtasks li { padding:3px 0; font-size:13px; } .subtasks .check { width:15px; height:15px; flex-basis:15px; font-size:10px; } .empty { color:#667085; font-style:italic; } .focus-session { padding:14px; background:#f5f9fd; border-radius:10px; } .focus-session p { margin:0; color:#475467; } @media print { body { padding:0; } .actions { display:none; } }
        </style></head><body><header>${photo}<div><h1>Foque em Checks â€” RelatÃ³rio de tarefas</h1><p>${escapeHtml(exportData.account.email || 'Conta Foque em Checks')} Â· Exportado em ${new Date(exportData.exported_at).toLocaleString('pt-BR')}</p></div></header><div class="actions"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button></div>${taskGroupReportHtml('Inbox', organizer.inbox)}${blocks.map(block => taskGroupReportHtml(block.title || 'Bloco sem tÃ­tulo', block.tasks)).join('')}${focusSection}</body></html>`;
    }

    function installAccountButton(user) {
        if (document.getElementById('focus-account-menu')) return;

        const menu = document.createElement('div');
        menu.id = 'focus-account-menu';
        menu.className = 'focus-account-menu';

        const email = user.email || 'Conta Foque em Checks';
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
        panel.innerHTML = '<div class="focus-account-summary"><div class="focus-account-avatar"></div><div class="focus-account-email"></div></div><div class="focus-account-actions"><button type="button" class="focus-avatar-action">Foto de perfil</button><button type="button" class="focus-avatar-remove">Remover foto</button><button type="button" class="focus-password-action">Trocar senha</button><button type="button" class="focus-export-action">Baixar dados</button><button type="button" class="focus-report-action">RelatÃ³rio visual</button><button type="button" class="focus-delete-action danger">Excluir conta</button></div>';
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp'; fileInput.hidden = true;
        const avatarAction = panel.querySelector('.focus-avatar-action');
        const removeAvatar = panel.querySelector('.focus-avatar-remove');
        const avatarPreview = panel.querySelector('.focus-account-avatar');
        avatarPreview.textContent = initials;
        panel.querySelector('.focus-account-email').textContent = email;
        removeAvatar.disabled = !user.user_metadata?.avatar_path;
        const exportAction = panel.querySelector('.focus-export-action');
        const reportAction = panel.querySelector('.focus-report-action');
        const deleteAction = panel.querySelector('.focus-delete-action');
        const passwordAction = panel.querySelector('.focus-password-action');
        passwordAction.addEventListener('click', () => {
            if (panel.querySelector('.focus-password-form')) return;
            const form = document.createElement('form');
            form.className = 'focus-password-form';
            form.innerHTML = '<input required type="password" name="current" autocomplete="current-password" placeholder="Senha atual"><input required minlength="8" type="password" name="next" autocomplete="new-password" placeholder="Nova senha (mÃ­n. 8)"><input required minlength="8" type="password" name="confirm" autocomplete="new-password" placeholder="Confirmar nova senha"><button type="button" class="focus-toggle-passwords" aria-pressed="false">Mostrar senhas</button><button type="submit">Salvar senha</button><p aria-live="polite"></p>';
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
                    setStatus('As senhas nÃ£o coincidem.', 'error');
                    return;
                }

                submit.disabled = true;
                submit.textContent = 'Confirmandoâ€¦';
                try {
                    const { error } = await client.auth.updateUser({
                        password: next,
                        current_password: data.get('current')
                    });
                    if (error) {
                        console.error('Falha ao atualizar a senha:', error);
                        setStatus(
                            /password|credential|invalid/i.test(error.message || '')
                                ? 'A senha atual nÃ£o foi validada. A senha nÃ£o foi alterada.'
                                : 'NÃ£o foi possÃ­vel alterar a senha. Tente novamente.',
                            'error'
                        );
                        return;
                    }
                    setStatus('Senha alterada com sucesso.', 'success');
                    form.reset();
                } catch (error) {
                    console.error('Erro ao alterar senha:', error);
                    setStatus('NÃ£o foi possÃ­vel concluir a alteraÃ§Ã£o agora. Tente novamente.', 'error');
                } finally {
                    submit.disabled = false;
                    submit.textContent = 'Salvar senha';
                }
            });
            panel.querySelector('.focus-account-actions').appendChild(form);
        });
        exportAction.addEventListener('click', async () => {
            exportAction.disabled = true;
            exportAction.textContent = 'Preparando dadosâ€¦';
            try {
                downloadJson(await buildExport(user));
                showCloudStatus('Download dos seus dados iniciado', 'success');
            } catch (error) {
                console.error('Erro ao exportar dados:', error);
                showCloudStatus('NÃ£o foi possÃ­vel preparar o download', 'error');
            } finally {
                exportAction.disabled = false;
                exportAction.textContent = 'Baixar dados';
            }
        });
        reportAction.addEventListener('click', async () => {
            const reportWindow = window.open('', '_blank');
            if (!reportWindow) {
                showCloudStatus('Permita pop-ups para abrir o relatÃ³rio', 'warning');
                return;
            }
            reportWindow.opener = null;
            reportWindow.document.write('<title>Preparando relatÃ³rioâ€¦</title><p style="font:14px system-ui;padding:24px">Preparando relatÃ³rioâ€¦</p>');
            reportWindow.document.close();
            reportAction.disabled = true;
            try {
                reportWindow.document.open();
                reportWindow.document.write(buildReportHtml(await buildExport(user)));
                reportWindow.document.close();
            } catch (error) {
                console.error('Erro ao preparar relatÃ³rio:', error);
                reportWindow.close();
                showCloudStatus('NÃ£o foi possÃ­vel preparar o relatÃ³rio', 'error');
            } finally {
                reportAction.disabled = false;
            }
        });
        deleteAction.addEventListener('click', () => {
            if (panel.querySelector('.focus-delete-form')) return;
            const form = document.createElement('form');
            form.className = 'focus-delete-form';
            form.innerHTML = '<p><strong>Esta aÃ§Ã£o Ã© irreversÃ­vel.</strong> A foto, tarefas, blocos e sua conta serÃ£o excluÃ­dos.</p><label>Digite <strong>EXCLUIR MINHA CONTA</strong> para confirmar.</label><input required name="confirmation" autocomplete="off"><button type="submit">Excluir conta definitivamente</button><p aria-live="polite"></p>';
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const status = form.querySelector('p[aria-live]');
                const submit = form.querySelector('button[type="submit"]');
                if (new FormData(form).get('confirmation').trim() !== 'EXCLUIR MINHA CONTA') {
                    status.textContent = 'Digite a frase de confirmaÃ§Ã£o exatamente como mostrada.';
                    return;
                }
                submit.disabled = true;
                submit.textContent = 'Excluindoâ€¦';
                try {
                    const { error } = await client.rpc('delete_own_account');
                    if (error) throw error;
                    removeLocalState('focusOrganizerState');
                    removeLocalState('focusAppState');
                    localStorage.removeItem('focusOrganizerTheme');
                    try { await client.auth.signOut({ scope: 'local' }); } catch (signOutError) { console.warn('SessÃ£o jÃ¡ foi invalidada:', signOutError); }
                    location.replace('login.html?deleted=1');
                } catch (error) {
                    console.error('Erro ao excluir conta:', error);
                    status.textContent = 'NÃ£o foi possÃ­vel excluir a conta. Confirme a configuraÃ§Ã£o do Supabase e tente novamente.';
                    submit.disabled = false;
                    submit.textContent = 'Excluir conta definitivamente';
                }
            });
            panel.querySelector('.focus-account-actions').appendChild(form);
        });
        avatarAction.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0]; if (!file) return;
            if (file.size > 2 * 1024 * 1024) { showCloudStatus('A foto deve ter no mÃ¡ximo 2 MB', 'warning'); return; }
            const allowedImageTypes = new Map([
                ['image/jpeg', 'jpg'],
                ['image/png', 'png'],
                ['image/webp', 'webp']
            ]);
            const safeExtension = allowedImageTypes.get(file.type);
            if (!safeExtension) {
                showCloudStatus('Use uma imagem JPG, PNG ou WebP', 'warning');
                fileInput.value = '';
                return;
            }
            avatarAction.disabled = true;
            try {
                const path = `${user.id}/avatar.${safeExtension}`;
                const { error } = await client.storage.from('focus-avatars').upload(path, file, { upsert: true, contentType: file.type });
                if (error) throw error;
                const previousPath = user.user_metadata?.avatar_path;
                if (previousPath && previousPath !== path) await client.storage.from('focus-avatars').remove([previousPath]);
                const { error: metadataError } = await client.auth.updateUser({ data: { avatar_path: path } });
                if (metadataError) throw metadataError;
                user.user_metadata.avatar_path = path;
                await applyAvatar(path);
                removeAvatar.disabled = false;
            } catch (error) { console.error('Erro ao enviar avatar:', error); showCloudStatus('NÃ£o foi possÃ­vel enviar a foto', 'error'); }
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
            } catch (error) { console.error('Erro ao remover avatar:', error); showCloudStatus('NÃ£o foi possÃ­vel remover a foto', 'error'); }
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
                showCloudStatus('NÃ£o foi possÃ­vel sair', 'error');
            }
        });

        menu.append(trigger, panel, fileInput);
        const accountArea = document.querySelector('.header-actions, .top-actions');
        (accountArea || document.body).appendChild(menu);
        applyAvatar(user.user_metadata?.avatar_path);
    }

    if (client) {
        client.auth.onAuthStateChange((_event, session) => {
            const nextUser = session?.user || null;
            if (currentUser?.id && currentUser.id !== nextUser?.id) {
                cancelPendingSaves();
                cloudWriteQueue = Promise.resolve();
                cloudRowExists = false;
                knownRemoteUpdatedAt = null;
            }
            currentUser = nextUser;
        });
    }

    window.FocusCloud = {
        configured: Boolean(client),
        requireUser,
        loadOrganizerRecord: () => loadColumnRecord('organizer_state'),
        loadFocusRecord: () => loadColumnRecord('focus_state'),
        loadOrganizerState: async () => (await loadColumnRecord('organizer_state')).state,
        loadFocusState: async () => (await loadColumnRecord('focus_state')).state,
        scheduleOrganizerSave,
        scheduleFocusSave,
        clearFocusState,
        readLocalRecord,
        readLocalBackups,
        writeLocalState,
        removeLocalState,
        storageKey,
        showStatus: showCloudStatus
    };
})();





