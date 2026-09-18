// js/grupos.js
const db = firebase.firestore();

let empresaAdmin = null;
let todosGrupos = [];
let editandoGrupoId = null;

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

// Ícones disponíveis
const ICONES = ['👑', '👤', '👁️', '🔧', '⚙️', '🛠️', '🔑', '🛡️', '⭐', '💼', '📋', '🔒', '🚀', '🎯', '💡', '📌'];

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

    // ✅ O que importa: descobrir empresa + listar grupos (Firestore puro)
    await descobrirEmpresaAdmin();

    if (!empresaAdmin) {
        mostrarMsg('msgGrupo', '⚠️ Você não é admin desta empresa.', 'text-yellow-400');
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

// ========== LISTAR GRUPOS ==========
async function carregarGrupos() {
    let lista = document.getElementById('listaGrupos');
    try {
        let snapshot = await db.collection('grupos')
            .where('empresaId', '==', empresaAdmin.id)
            .get();

        if (snapshot.empty) {
            todosGrupos = [];
            lista.innerHTML = '<p class="text-zinc-500 text-xs">Nenhum grupo cadastrado.</p>';
            return;
        }

        todosGrupos = [];
        snapshot.forEach(doc => {
            todosGrupos.push({ id: doc.id, ...doc.data() });
        });

        todosGrupos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

        lista.innerHTML = '';
        todosGrupos.forEach(g => {
            let div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-zinc-800 p-3 rounded-lg';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${g.icone || '🔧'}</span>
                    <div class="flex flex-col">
                        <span class="text-white text-sm font-medium">${g.nome || '-'}</span>
                        <span class="text-zinc-500 text-[10px]">${resumoPermissoes(g.permissoes)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="abrirModalGrupo('${g.id}')" class="py-1 px-3 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs rounded">✏️ Editar</button>
                    <button onclick="excluirGrupo('${g.id}', '${(g.nome || '').replace(/'/g, "\\'")}')" class="py-1 px-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded">🗑️</button>
                </div>`;
            lista.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<p class="text-red-400 text-xs">Erro ao carregar.</p>';
    }
}

function resumoPermissoes(perm) {
    if (!perm) return 'sem permissões';
    let modulosVer = Object.keys(perm).filter(k => perm[k].ver === true).length;
    let temAcoes = Object.keys(perm).some(k => perm[k].adicionar || perm[k].editar || perm[k].excluir);
    return `${modulosVer} módulos visíveis${temAcoes ? ' + ações' : ''}`;
}

// ========== MODAL GRUPO ==========
function abrirModalGrupo(grupoId) {
    editandoGrupoId = grupoId || null;
    document.getElementById('tituloModalGrupo').textContent = grupoId ? '✏️ Editar Grupo' : '➕ Criar Grupo';

    document.getElementById('grupoNome').value = '';

    montarSelectIcones();
    montarTabelaPermissoes();

    if (grupoId) {
        let g = todosGrupos.find(x => x.id === grupoId);
        if (g) {
            document.getElementById('grupoNome').value = g.nome || '';
            document.getElementById('grupoIcone').value = g.icone || '🔧';
            preencherPermissoes(g.permissoes || {});
        }
    }

    document.getElementById('modalGrupo').classList.remove('hidden');
}

function montarSelectIcones() {
    let select = document.getElementById('grupoIcone');
    select.innerHTML = '';
    ICONES.forEach(ic => {
        let opt = document.createElement('option');
        opt.value = ic;
        opt.textContent = ic;
        select.appendChild(opt);
    });
    select.value = '🔧';
}

function fecharModalGrupo() {
    document.getElementById('modalGrupo').classList.add('hidden');
    editandoGrupoId = null;
}

function montarTabelaPermissoes() {
    let tbody = document.getElementById('tabelaPermissoesGrupo');
    tbody.innerHTML = '';

    let thead = document.querySelector('#tabelaPermissoesGrupo').parentElement.querySelector('thead tr');
    if (thead) {
        thead.innerHTML = `
            <th class="text-left py-2 px-1">Módulo</th>
            <th class="text-center py-2 px-2 w-14">
                <div class="flex flex-col items-center">
                    <span class="text-[10px] text-zinc-400 mb-1">Ver</span>
                    <input type="checkbox" onchange="toggleColuna('ver', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                </div>
            </th>
            <th class="text-center py-2 px-2 w-14">
                <div class="flex flex-col items-center">
                    <span class="text-[10px] text-zinc-400 mb-1">Add</span>
                    <input type="checkbox" onchange="toggleColuna('adicionar', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                </div>
            </th>
            <th class="text-center py-2 px-2 w-14">
                <div class="flex flex-col items-center">
                    <span class="text-[10px] text-zinc-400 mb-1">Edit</span>
                    <input type="checkbox" onchange="toggleColuna('editar', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                </div>
            </th>
            <th class="text-center py-2 px-2 w-14">
                <div class="flex flex-col items-center">
                    <span class="text-[10px] text-zinc-400 mb-1">Del</span>
                    <input type="checkbox" onchange="toggleColuna('excluir', this.checked)" class="accent-emerald-500 w-4 h-4 cursor-pointer">
                </div>
            </th>
        `;
    }

    MODULOS.forEach(mod => {
        let tr = document.createElement('tr');
        tr.className = 'border-b border-zinc-800';
        tr.innerHTML = `
            <td class="py-2 text-xs text-zinc-300">${mod.nome}</td>
            <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="ver" class="accent-emerald-500 w-4 h-4"></td>
            <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="adicionar" class="accent-emerald-500 w-4 h-4"></td>
            <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="editar" class="accent-emerald-500 w-4 h-4"></td>
            <td class="text-center"><input type="checkbox" data-mod="${mod.key}" data-acao="excluir" class="accent-emerald-500 w-4 h-4"></td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleColuna(acao, marcar) {
    document.querySelectorAll(`#tabelaPermissoesGrupo input[data-acao="${acao}"]`).forEach(cb => {
        cb.checked = marcar;
    });
}

function preencherPermissoes(perm) {
    document.querySelectorAll('#tabelaPermissoesGrupo input[type="checkbox"]').forEach(cb => {
        let mod = cb.getAttribute('data-mod');
        let acao = cb.getAttribute('data-acao');
        if (mod && acao) {
            cb.checked = perm[mod] && perm[mod][acao] === true;
        }
    });
}

// ✅ Salva o grupo E propaga as permissões pros vínculos
async function salvarGrupo() {
    let icone = document.getElementById('grupoIcone').value || '🔧';
    let nome = document.getElementById('grupoNome').value.trim();

    if (!nome) {
        mostrarMsg('msgGrupo', '⚠️ Nome obrigatório', 'text-yellow-400');
        return;
    }

    let permissoes = {};
    MODULOS.forEach(mod => {
        permissoes[mod.key] = { ver: false, adicionar: false, editar: false, excluir: false };
    });

    document.querySelectorAll('#tabelaPermissoesGrupo input[type="checkbox"]').forEach(cb => {
        let mod = cb.getAttribute('data-mod');
        let acao = cb.getAttribute('data-acao');
        if (mod && acao && cb.checked) permissoes[mod][acao] = true;
    });

    let novoRole = (nome === 'Admin') ? 'admin' : 'user';

    try {
        let grupoId = editandoGrupoId;

        if (editandoGrupoId) {
            await db.collection('grupos').doc(editandoGrupoId).update({
                nome, icone, permissoes
            });
        } else {
            let ref = await db.collection('grupos').add({
                nome,
                icone,
                empresaId: empresaAdmin.id,
                permissoes,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            grupoId = ref.id;
        }

        let atualizados = 0;
        if (grupoId) {
            let vinculosSnap = await db.collection('vinculos')
                .where('grupoId', '==', grupoId)
                .get();

            if (!vinculosSnap.empty) {
                let docs = vinculosSnap.docs;
                for (let i = 0; i < docs.length; i += 500) {
                    let batch = db.batch();
                    let lote = docs.slice(i, i + 500);
                    lote.forEach(doc => {
                        batch.update(doc.ref, {
                            permissoes: permissoes,
                            role: novoRole
                        });
                    });
                    await batch.commit();
                    atualizados += lote.length;
                }
            }
        }

        if (typeof limparCachePermissoes === 'function') limparCachePermissoes();

        let msg = editandoGrupoId
            ? `✅ Grupo atualizado! ${atualizados} usuário(s) sincronizado(s).`
            : `✅ Grupo criado!`;
        mostrarMsg('msgGrupo', msg, 'text-emerald-400');

        fecharModalGrupo();
        carregarGrupos();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgGrupo', '❌ Erro ao salvar', 'text-red-400');
    }
}

async function excluirGrupo(grupoId, nome) {
    let vinculosSnap = await db.collection('vinculos')
        .where('grupoId', '==', grupoId)
        .get();

    let qtdUsers = vinculosSnap.size;
    let aviso = qtdUsers > 0
        ? `Excluir o grupo "${nome}"?\n\n⚠️ ${qtdUsers} usuário(s) usam esse grupo e ficarão SEM permissão.`
        : `Excluir o grupo "${nome}"?`;

    if (!confirm(aviso)) return;

    try {
        if (qtdUsers > 0) {
            let docs = vinculosSnap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                let batch = db.batch();
                let lote = docs.slice(i, i + 500);
                lote.forEach(doc => {
                    batch.update(doc.ref, {
                        grupoId: firebase.firestore.FieldValue.delete(),
                        role: 'user'
                    });
                });
                await batch.commit();
            }
        }

        await db.collection('grupos').doc(grupoId).delete();

        if (typeof limparCachePermissoes === 'function') limparCachePermissoes();

        mostrarMsg('msgGrupo', `✅ Grupo excluído! ${qtdUsers} vínculo(s) limpo(s).`, 'text-emerald-400');
        carregarGrupos();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgGrupo', '❌ Erro ao excluir', 'text-red-400');
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