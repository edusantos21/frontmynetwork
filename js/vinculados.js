// js/vinculados.js
const db = firebase.firestore();

let empresaAdmin = null;
let todosGrupos = [];
let editandoVinculoId = null;
let permissoesVinculoId = null;

// Módulos disponíveis pra permissão
const MODULOS = [
    { key: 'dashboard',     nome: '📊 Dashboard' },
    { key: 'monitoramento', nome: '📋 Monitoramento' },
    { key: 'equipamentos',  nome: '📡 Equipamentos' },
    { key: 'clientes',      nome: '👥 Clientes' },
    { key: 'servidores',    nome: '🖥️ Servidores' },
    { key: 'energias',      nome: '⚡ Energias' },
    { key: 'servicos',      nome: '🔌 Serviços' },
    { key: 'localidades',   nome: '📍 Localidades' },
    { key: 'configuracoes', nome: '⚙️ Configurações' },
    { key: 'vinculados',    nome: '👤 Vinculados' },
    { key: 'solicitacoes',  nome: '⏳ Solicitações' },
    { key: 'grupos',        nome: '🔧 Grupos' }
];

// ========== CARREGAR (chamado pelo utils.js) ==========
async function carregar() {
    // ✅ Tenta checar o backend, mas NÃO impede a página de carregar
    try {
        let url = await buscarUrlTunel();
        if (url) {
            let resp = await fetch(url + '/');
            atualizarStatusServidor(resp.ok ? 'online' : 'offline');
        } else {
            atualizarStatusServidor('offline');
        }
    } catch (e) {
        console.warn('⚠️ Backend offline, mas seguindo com Firestore:', e.message);
        atualizarStatusServidor('offline');
    }

    // ✅ O que importa: descobrir empresa + listar vinculados (Firestore puro)
    await descobrirEmpresaAdmin();

    if (!empresaAdmin) {
        mostrarMsg('msgUsuario', '⚠️ Você não é admin desta empresa.', 'text-yellow-400');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
        throw new Error('Sem empresa admin');
    }

    let subU = document.getElementById('submenuUsuarios');
    let setaU = document.getElementById('setaUsuarios');
    if (subU) {
        subU.classList.remove('hidden');
        if (setaU) setaU.style.transform = 'rotate(90deg)';
    }

    await carregarGrupos();
    await carregarVinculados();

    return true;
}

// ========== DESCOBRIR EMPRESA ADMIN ==========
async function descobrirEmpresaAdmin() {
    let user = firebase.auth().currentUser;
    if (!user) return;

    let empresaSelecionadaId = localStorage.getItem('empresaSelecionada');

    let vinculos = await db.collection('vinculos')
        .where('userId', '==', user.uid)
        .where('status', '==', 'aprovado')
        .get();

    empresaAdmin = null;

    for (let doc of vinculos.docs) {
        let v = doc.data();
        if (v.role !== 'admin') continue;
        if (empresaSelecionadaId && v.empresaId !== empresaSelecionadaId) continue;

        let empDoc = await db.collection('empresas').doc(v.empresaId).get();
        if (empDoc.exists) {
            empresaAdmin = { id: empDoc.id, nome: empDoc.data().nome };
            break;
        }
    }
}

// ========== CARREGAR GRUPOS ==========
async function carregarGrupos() {
    let snapshot = await db.collection('grupos')
        .where('empresaId', '==', empresaAdmin.id)
        .get();

    todosGrupos = [];
    snapshot.forEach(doc => {
        todosGrupos.push({ id: doc.id, ...doc.data() });
    });

    todosGrupos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
}

// ========== VINCULADOS ==========
async function carregarVinculados() {
    let lista = document.getElementById('listaVinculados');
    try {
        let snapshot = await db.collection('vinculos')
            .where('empresaId', '==', empresaAdmin.id)
            .where('status', '==', 'aprovado')
            .get();

        if (snapshot.empty) {
            lista.innerHTML = '<p class="text-zinc-500 text-xs">Nenhum.</p>';
            return;
        }

        lista.innerHTML = '';
        snapshot.forEach(doc => {
            let v = doc.data();
            if (v.userId === firebase.auth().currentUser.uid) return;

            let grupoAtualId = v.grupoId || encontrarGrupoPorPermissoes(v.permissoes);
            let options = montarOptionsGrupos(grupoAtualId);

            let div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-zinc-800 p-3 rounded-lg';
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-white text-sm font-medium">👤 ${v.userName || '-'}</span>
                    <span class="text-zinc-500 text-xs">${v.userEmail || '-'}</span>
                </div>
                <div class="flex items-center gap-1">
                    <select onchange="aplicarGrupoNaLista('${doc.id}', this.value)" class="bg-zinc-700 text-white text-xs rounded border border-zinc-600 p-1">
                        ${options}
                    </select>
                    <button onclick="abrirEditarUsuario('${doc.id}')" class="py-1 px-3 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs rounded">✏️</button>
                    <button onclick="abrirPermissoes('${doc.id}')" class="py-1 px-3 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs rounded">🔐</button>
                    <button onclick="removerVinculo('${doc.id}')" class="py-1 px-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded">🗑️</button>
                </div>`;
            lista.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<p class="text-red-400 text-xs">Erro.</p>';
    }
}

// Monta as options do select
function montarOptionsGrupos(selecionadoId) {
    let html = '<option value="">— Selecione —</option>';

    let admin   = todosGrupos.find(g => g.nome === 'Admin');
    let user    = todosGrupos.find(g => g.nome === 'Usuário');
    let leitor  = todosGrupos.find(g => g.nome === 'Leitor');
    let outros  = todosGrupos.filter(g => !['Admin', 'Usuário', 'Leitor'].includes(g.nome));

    if (admin)  html += `<option value="${admin.id}"  ${selecionadoId === admin.id  ? 'selected' : ''}>👑 Admin</option>`;
    if (user)   html += `<option value="${user.id}"   ${selecionadoId === user.id   ? 'selected' : ''}>👤 Usuário</option>`;
    if (leitor) html += `<option value="${leitor.id}" ${selecionadoId === leitor.id ? 'selected' : ''}>👁️ Leitor</option>`;

    if (outros.length > 0) {
        html += '<option disabled>──────────</option>';
        outros.forEach(g => {
            html += `<option value="${g.id}" ${selecionadoId === g.id ? 'selected' : ''}>${g.icone || '🔧'} ${g.nome}</option>`;
        });
    }

    return html;
}

// Descobre qual grupo tá aplicado baseado nas permissões salvas
function encontrarGrupoPorPermissoes(permissoes) {
    if (!permissoes) return '';

    for (let g of todosGrupos) {
        if (permissoesIguais(permissoes, g.permissoes)) {
            return g.id;
        }
    }
    return '';
}

// Compara 2 objetos de permissões
function permissoesIguais(p1, p2) {
    if (!p1 || !p2) return false;
    for (let m of MODULOS) {
        let a = p1[m.key] || {};
        let b = p2[m.key] || {};
        if (a.ver !== b.ver || a.adicionar !== b.adicionar || a.editar !== b.editar || a.excluir !== b.excluir) {
            return false;
        }
    }
    return true;
}

// ✅ Aplica o grupo selecionado direto na lista (com role correto + grupoId)
async function aplicarGrupoNaLista(vinculoId, grupoId) {
    if (!grupoId) return;

    let grupo = todosGrupos.find(g => g.id === grupoId);
    if (!grupo) return;

    let updateData = {
        grupoId: grupo.id,
        permissoes: grupo.permissoes,
        role: (grupo.nome === 'Admin') ? 'admin' : 'user'
    };

    try {
        await db.collection('vinculos').doc(vinculoId).update(updateData);

        if (typeof limparCachePermissoes === 'function') limparCachePermissoes();

        mostrarMsg('msgUsuario', `✅ Grupo "${grupo.nome}" aplicado!`, 'text-emerald-400');
    } catch (e) {
        console.error(e);
        mostrarMsg('msgUsuario', '❌ Erro ao aplicar', 'text-red-400');
    }
}

async function removerVinculo(vinculoId) {
    if (!confirm('Remover este usuário?')) return;
    try {
        await db.collection('vinculos').doc(vinculoId).delete();
        mostrarMsg('msgUsuario', '✅ Removido!', 'text-emerald-400');
        carregarVinculados();
    } catch (e) {
        console.error(e);
    }
}

// ============================================================
// MODAL: EDITAR USUÁRIO
// ============================================================
async function abrirEditarUsuario(vinculoId) {
    try {
        let doc = await db.collection('vinculos').doc(vinculoId).get();
        if (!doc.exists) return;
        let v = doc.data();

        editandoVinculoId = vinculoId;
        document.getElementById('editNome').value = v.userName || '';
        document.getElementById('editEmail').value = v.userEmail || '';

        let grupoAtualId = v.grupoId || encontrarGrupoPorPermissoes(v.permissoes);
        let options = montarOptionsGrupos(grupoAtualId);
        let selectEditGrupo = document.getElementById('editGrupo');
        if (selectEditGrupo) {
            selectEditGrupo.innerHTML = options;
        }

        document.getElementById('modalEditarUsuario').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        mostrarMsg('msgUsuario', '❌ Erro ao abrir edição', 'text-red-400');
    }
}

function fecharModalEditarUsuario() {
    document.getElementById('modalEditarUsuario').classList.add('hidden');
    editandoVinculoId = null;
}

// ✅ Salva edição com role correto + grupoId
async function salvarEditarUsuario() {
    if (!editandoVinculoId) return;
    let nome = document.getElementById('editNome').value.trim();
    let email = document.getElementById('editEmail').value.trim();
    let grupoId = document.getElementById('editGrupo')?.value || '';

    if (!nome || !email) {
        mostrarMsg('msgUsuario', '⚠️ Nome e email obrigatórios', 'text-yellow-400');
        return;
    }

    let updateData = {
        userName: nome,
        userEmail: email
    };

    if (grupoId) {
        let grupo = todosGrupos.find(g => g.id === grupoId);
        if (grupo) {
            updateData.role = (grupo.nome === 'Admin') ? 'admin' : 'user';
            updateData.permissoes = grupo.permissoes;
            updateData.grupoId = grupo.id;
        }
    }

    try {
        await db.collection('vinculos').doc(editandoVinculoId).update(updateData);

        if (typeof limparCachePermissoes === 'function') limparCachePermissoes();

        mostrarMsg('msgUsuario', '✅ Atualizado!', 'text-emerald-400');
        fecharModalEditarUsuario();
        carregarVinculados();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgUsuario', '❌ Erro ao salvar', 'text-red-400');
    }
}

// ============================================================
// MODAL: PERMISSÕES
// ============================================================
async function abrirPermissoes(vinculoId) {
    try {
        let doc = await db.collection('vinculos').doc(vinculoId).get();
        if (!doc.exists) return;
        let v = doc.data();

        permissoesVinculoId = vinculoId;
        document.getElementById('tituloPermissoes').textContent = '🔐 Permissões de ' + (v.userName || 'Usuário');

        let selectGrupo = document.getElementById('selectGrupo');
        let grupoAtualId = v.grupoId || encontrarGrupoPorPermissoes(v.permissoes);
        selectGrupo.innerHTML = montarOptionsGrupos(grupoAtualId);

        let tbody = document.getElementById('tabelaPermissoes');
        tbody.innerHTML = '';

        let thead = document.querySelector('#tabelaPermissoes').parentElement.querySelector('thead tr');
        if (thead) {
            thead.innerHTML = `
                <th class="text-left py-2 px-1">Módulo</th>
                <th class="text-center py-2 px-2 w-14">
                    <div class="flex flex-col items-center">
                        <span class="text-[10px] text-zinc-400 mb-1">Ver</span>
                        <input type="checkbox" onchange="toggleColunaPerm('ver', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                    </div>
                </th>
                <th class="text-center py-2 px-2 w-14">
                    <div class="flex flex-col items-center">
                        <span class="text-[10px] text-zinc-400 mb-1">Add</span>
                        <input type="checkbox" onchange="toggleColunaPerm('adicionar', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                    </div>
                </th>
                <th class="text-center py-2 px-2 w-14">
                    <div class="flex flex-col items-center">
                        <span class="text-[10px] text-zinc-400 mb-1">Edit</span>
                        <input type="checkbox" onchange="toggleColunaPerm('editar', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                    </div>
                </th>
                <th class="text-center py-2 px-2 w-14">
                    <div class="flex flex-col items-center">
                        <span class="text-[10px] text-zinc-400 mb-1">Del</span>
                        <input type="checkbox" onchange="toggleColunaPerm('excluir', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                    </div>
                </th>
            `;
        }

        let p = v.permissoes || {};

        MODULOS.forEach(mod => {
            let perm = p[mod.key] || { ver: false, adicionar: false, editar: false, excluir: false };
            let tr = document.createElement('tr');
            tr.className = 'border-b border-zinc-800';
            tr.innerHTML = `
                <td class="py-2 text-xs text-zinc-300">${mod.nome}</td>
                <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="ver" ${perm.ver ? 'checked' : ''} class="accent-emerald-500 w-4 h-4"></td>
                <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="adicionar" ${perm.adicionar ? 'checked' : ''} class="accent-emerald-500 w-4 h-4"></td>
                <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="editar" ${perm.editar ? 'checked' : ''} class="accent-emerald-500 w-4 h-4"></td>
                <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="excluir" ${perm.excluir ? 'checked' : ''} class="accent-emerald-500 w-4 h-4"></td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('modalPermissoes').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        mostrarMsg('msgUsuario', '❌ Erro ao abrir permissões', 'text-red-400');
    }
}

// ✅ Marca/desmarca TODA uma coluna no modal Permissões
function toggleColunaPerm(acao, marcar) {
    document.querySelectorAll(`#tabelaPermissoes input[data-acao="${acao}"]`).forEach(cb => {
        cb.checked = marcar;
    });
}

function aplicarGrupoSelecionado() {
    let grupoId = document.getElementById('selectGrupo').value;
    if (!grupoId) return;

    let grupo = todosGrupos.find(g => g.id === grupoId);
    if (!grupo) return;

    let perm = grupo.permissoes || {};

    document.querySelectorAll('#tabelaPermissoes input[type="checkbox"]').forEach(cb => {
        let mod = cb.getAttribute('data-mod');
        let acao = cb.getAttribute('data-acao');
        if (mod && acao) {
            cb.checked = perm[mod] && perm[mod][acao] === true;
        }
    });

    mostrarMsg('msgUsuario', `✅ Grupo "${grupo.nome}" aplicado!`, 'text-emerald-400');
}

function limparPermissoes() {
    document.querySelectorAll('#tabelaPermissoes input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('selectGrupo').value = '';
    mostrarMsg('msgUsuario', '🧹 Limpo!', 'text-blue-400');
}

function fecharModalPermissoes() {
    document.getElementById('modalPermissoes').classList.add('hidden');
    permissoesVinculoId = null;
}

async function salvarPermissoes() {
    if (!permissoesVinculoId) return;

    let permissoes = {};
    MODULOS.forEach(mod => {
        permissoes[mod.key] = { ver: false, adicionar: false, editar: false, excluir: false };
    });

    document.querySelectorAll('#tabelaPermissoes input[type="checkbox"]').forEach(cb => {
        let mod = cb.getAttribute('data-mod');
        let acao = cb.getAttribute('data-acao');
        if (mod && acao && cb.checked) permissoes[mod][acao] = true;
    });

    let grupoId = document.getElementById('selectGrupo').value;

    let updateData = { permissoes };

    if (grupoId) {
        let grupo = todosGrupos.find(g => g.id === grupoId);
        if (grupo) {
            updateData.role = (grupo.nome === 'Admin') ? 'admin' : 'user';
            updateData.grupoId = grupo.id;
        }
    }

    try {
        await db.collection('vinculos').doc(permissoesVinculoId).update(updateData);

        if (typeof limparCachePermissoes === 'function') limparCachePermissoes();

        mostrarMsg('msgUsuario', '✅ Permissões salvas!', 'text-emerald-400');
        fecharModalPermissoes();
        carregarVinculados();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgUsuario', '❌ Erro ao salvar', 'text-red-400');
    }
}

// ========== UTILITÁRIOS ==========
function mostrarMsg(id, texto, classe) {
    let el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto;
    el.className = 'text-xs mt-2 ' + classe;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
}

function criarUsuarioFuturo() {
    alert('🚧 Criar usuário será implementado na próxima etapa!');
}

// ========== LISTENER DO INTERVALO ==========
document.addEventListener('DOMContentLoaded', function() {
    let selectIntervalo = document.getElementById('intervalo');
    if (selectIntervalo) {
        let valorSalvo = (intervaloAtual / 1000);
        for (let opt of selectIntervalo.options) {
            if (opt.value == valorSalvo) { opt.selected = true; break; }
        }
        selectIntervalo.addEventListener('change', function() {
            intervaloAtual = parseInt(this.value) * 1000;
            localStorage.setItem('intervalo', intervaloAtual);
        });
    }
});