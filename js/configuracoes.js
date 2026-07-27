// js/configuracoes.js - COMPLETO FINAL CORRIGIDO E ORGANIZADO
const auth = firebase.auth();
const db = firebase.firestore();

let isAdmin = false;
let minhasEmpresas = [];
let empresaAdmin = null;

// ========== INICIALIZAÇÃO ==========
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }

    document.getElementById('nomeUsuario').textContent = user.displayName || 'Usuário';
    document.getElementById('emailUsuario').textContent = user.email;
    document.getElementById('avatarNome').textContent = (user.displayName || 'U')[0].toUpperCase();

    iniciarRelogio();
    await carregarEmpresasSeletor();
    await carregarEstado();

    if (empresaSelecionada && empresaSelecionada.url_tunel) {
        iniciarPrimeiraCarga(verificarStatus);
    } else {
        atualizarStatusServidor('offline');
        iniciarReconexaoGlobal(verificarStatus);
    }

    carregarPreferencias();
    carregarOrdem();
    configurarSelectsInteligentes();
});

// ========== CALLBACK PARA O UTILS.JS ==========
function carregar() {
    return verificarStatus();
}

async function verificarStatus() {
    let url = await obterUrlAtual();
    if (!url) throw new Error('URL não encontrada');
    let resp = await fetch(url + '/');
    if (!resp.ok) throw new Error('Offline');
}

// ========== ESTADO DA EMPRESA ==========
async function carregarEstado() {
    let user = auth.currentUser;
    if (!user) return;

    minhasEmpresas = [];
    isAdmin = false;
    empresaAdmin = null;

    let vinculos = await db.collection('vinculos')
        .where('userId', '==', user.uid)
        .where('status', '==', 'aprovado')
        .get();

    for (let doc of vinculos.docs) {
        let v = doc.data();
        let empDoc = await db.collection('empresas').doc(v.empresaId).get();
        if (empDoc.exists) {
            let emp = {
                id: empDoc.id,
                nome: empDoc.data().nome,
                role: v.role,
                vinculoId: doc.id,
                url_tunel: v.url_tunel || empDoc.data().url_tunel || ''
            };
            minhasEmpresas.push(emp);
            if (v.role === 'admin') {
                isAdmin = true;
                empresaAdmin = emp;
            }
        }
    }

    let pendentes = await db.collection('vinculos')
        .where('userId', '==', user.uid)
        .where('status', '==', 'pendente')
        .get();

    for (let doc of pendentes.docs) {
        let v = doc.data();
        let empDoc = await db.collection('empresas').doc(v.empresaId).get();
        if (empDoc.exists) {
            minhasEmpresas.push({
                id: empDoc.id,
                nome: empDoc.data().nome,
                role: 'pendente',
                vinculoId: doc.id
            });
        }
    }

    atualizarInterface();
}

function atualizarInterface() {
    document.getElementById('blocoCriarEmpresa').classList.toggle('hidden', isAdmin);
    renderizarMinhasEmpresas();

    if (empresaAdmin) {
        document.getElementById('cardUsuarios').style.display = '';
        carregarUsuarios();
    } else {
        document.getElementById('cardUsuarios').style.display = 'none';
    }
}

// ========== RENDERIZAR EMPRESAS ==========
function renderizarMinhasEmpresas() {
    let lista = document.getElementById('listaMinhasEmpresas');
    if (!lista) return;

    if (minhasEmpresas.length === 0) {
        lista.innerHTML = '<p class="text-zinc-500 text-xs">Nenhuma empresa.</p>';
        return;
    }

    lista.innerHTML = minhasEmpresas.map(emp => {
        let badge = '', botoes = '', infoExtra = '';

        if (emp.role === 'admin') {
            badge = '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 ml-1">Admin</span>';
            infoExtra = `<span class="text-zinc-500 text-xs ml-1">ID: <span class="text-emerald-400 font-mono text-xs">${emp.id}</span></span>
                <button onclick="copiarId('${emp.id}')" class="text-xs text-blue-400 hover:text-blue-300 ml-1">📋</button>`;
            botoes = `<div class="flex gap-1">
                <button onclick="editarNomeEmpresa('${emp.id}', '${emp.nome.replace(/'/g, "\\'")}')" class="py-1 px-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs rounded whitespace-nowrap">✏️</button>
                <button onclick="excluirEmpresa('${emp.id}')" class="py-1 px-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded whitespace-nowrap">🗑️ Excluir</button>
            </div>`;
        } else if (emp.role === 'user') {
            badge = '<span class="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-1">Vinculado</span>';
            infoExtra = `<span class="text-zinc-500 text-xs ml-1">ID: <span class="text-zinc-500 font-mono text-xs">${emp.id}</span></span>`;
            botoes = `<button onclick="sairDaEmpresa('${emp.vinculoId}')" class="py-1 px-2 bg-zinc-600 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 text-xs rounded whitespace-nowrap">🚪 Sair</button>`;
        } else {
            badge = '<span class="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 ml-1">Pendente</span>';
            infoExtra = `<span class="text-zinc-500 text-xs ml-1">ID: <span class="text-zinc-500 font-mono text-xs">${emp.id}</span></span>`;
        }

        return `<div class="flex items-center justify-between bg-zinc-800 p-2 rounded">
            <div class="flex items-center gap-1 flex-wrap">🏢 <span class="text-white text-xs font-medium">${emp.nome}</span>${badge}${infoExtra}</div>
            ${botoes}
        </div>`;
    }).join('');
}

// ========== AÇÕES DE EMPRESA ==========
function copiarId(id) {
    navigator.clipboard.writeText(id);
    mostrarMsg('msgEmpresa', '✅ ID copiado!', 'text-emerald-400');
}

function editarNomeEmpresa(id, nomeAtual) {
    let novoNome = prompt('Novo nome da empresa:', nomeAtual);
    if (!novoNome || novoNome.trim() === '' || novoNome === nomeAtual) return;

    db.collection('empresas').doc(id).update({ nome: novoNome.trim() })
        .then(() => {
            mostrarMsg('msgEmpresa', '✅ Nome atualizado!', 'text-emerald-400');
            carregarEstado();
        })
        .catch(e => {
            console.error(e);
            mostrarMsg('msgEmpresa', '❌ Erro.', 'text-red-400');
        });
}

async function criarEmpresa() {
    if (isAdmin) {
        mostrarMsg('msgEmpresa', 'Você já é admin de uma empresa.', 'text-amber-400');
        return;
    }

    let nome = document.getElementById('inputCriarEmpresa').value.trim();
    if (!nome) {
        mostrarMsg('msgEmpresa', 'Informe o nome.', 'text-red-400');
        return;
    }

    let user = auth.currentUser;
    let id = gerarIdEmpresa();
    let userDoc = await db.collection('usuarios').doc(user.uid).get();
    let urlAtual = userDoc.data()?.url_tunel || '';

    try {
        await db.collection('empresas').doc(id).set({
            nome,
            proprietario: user.email,
            url_tunel: urlAtual,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('vinculos').add({
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName || 'Usuário',
            empresaId: id,
            status: 'aprovado',
            role: 'admin',
            url_tunel: urlAtual,
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('usuarios').doc(user.uid).set({
            email: user.email,
            empresaId: id,
            url_tunel: urlAtual
        }, { merge: true });

        mostrarMsg('msgEmpresa', '✅ Empresa criada!', 'text-emerald-400');
        document.getElementById('inputCriarEmpresa').value = '';
        await carregarEstado();
    } catch (e) {
        console.error('ERRO AO CRIAR:', e);
        mostrarMsg('msgEmpresa', '❌ Erro: ' + e.message, 'text-red-400');
    }
}

async function solicitarVinculo() {
    let empresaId = document.getElementById('inputVincularEmpresa').value.trim().toUpperCase();
    if (!empresaId) {
        mostrarMsg('msgEmpresa', 'Informe o ID.', 'text-red-400');
        return;
    }

    let user = auth.currentUser;
    try {
        let empDoc = await db.collection('empresas').doc(empresaId).get();
        if (!empDoc.exists) {
            mostrarMsg('msgEmpresa', 'Empresa não encontrada.', 'text-red-400');
            return;
        }

        let existente = await db.collection('vinculos')
            .where('userId', '==', user.uid)
            .where('empresaId', '==', empresaId)
            .get();

        if (!existente.empty) {
            let status = existente.docs[0].data().status;
            mostrarMsg('msgEmpresa', status === 'aprovado' ? 'Já vinculado.' : 'Solicitação já existe.', 'text-amber-400');
            return;
        }

        await db.collection('vinculos').add({
            userId: user.uid,
            userEmail: user.email,
            userName: user.displayName || 'Usuário',
            empresaId,
            status: 'pendente',
            role: 'user',
            criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        mostrarMsg('msgEmpresa', '✅ Solicitação enviada!', 'text-emerald-400');
        document.getElementById('inputVincularEmpresa').value = '';
        await carregarEstado();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgEmpresa', '❌ Erro.', 'text-red-400');
    }
}

async function sairDaEmpresa(vinculoId) {
    if (!confirm('Sair desta empresa?')) return;
    try {
        await db.collection('vinculos').doc(vinculoId).delete();
        mostrarMsg('msgEmpresa', '✅ Você saiu.', 'text-emerald-400');
        await carregarEstado();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgEmpresa', '❌ Erro.', 'text-red-400');
    }
}

async function excluirEmpresa(empresaId) {
    if (!confirm('EXCLUIR esta empresa? TODOS os vínculos serão perdidos!')) return;
    if (!confirm('Tem certeza?')) return;

    try {
        let vinculos = await db.collection('vinculos')
            .where('empresaId', '==', empresaId)
            .get();
        for (let doc of vinculos.docs) await doc.ref.delete();

        await db.collection('empresas').doc(empresaId).delete();
        await db.collection('usuarios').doc(auth.currentUser.uid).set({
            email: auth.currentUser.email,
            empresaId: firebase.firestore.FieldValue.delete()
        }, { merge: true });

        mostrarMsg('msgEmpresa', '✅ Empresa excluída!', 'text-emerald-400');
        await carregarEstado();
    } catch (e) {
        console.error('ERRO AO EXCLUIR:', e);
        mostrarMsg('msgEmpresa', '❌ Erro: ' + e.message, 'text-red-400');
    }
}

function gerarIdEmpresa() {
    return `EMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// ========== USUÁRIOS ==========
async function carregarUsuarios() {
    if (!empresaAdmin) return;
    await carregarSolicitacoes();
    await carregarVinculados();
}

async function carregarSolicitacoes() {
    let lista = document.getElementById('listaSolicitacoes');
    try {
        let snapshot = await db.collection('vinculos')
            .where('empresaId', '==', empresaAdmin.id)
            .where('status', '==', 'pendente')
            .get();

        if (snapshot.empty) {
            lista.innerHTML = '<p class="text-zinc-500 text-xs">Nenhuma.</p>';
            return;
        }

        lista.innerHTML = '';
        snapshot.forEach(doc => {
            let v = doc.data();
            let div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-zinc-800 p-2 rounded-lg';
            div.innerHTML = `<div><span class="text-white text-xs font-medium">👤 ${v.userName}</span><span class="text-zinc-500 text-xs ml-1">${v.userEmail}</span></div>
                <div class="flex gap-1">
                    <select id="role_${doc.id}" class="bg-zinc-700 text-white text-xs rounded border border-zinc-600 p-0.5 mr-1">
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button class="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1" onclick="gerenciarVinculo('${doc.id}','aprovado','${v.userId}')">✅</button>
                    <button class="text-red-400 hover:text-red-300 text-xs px-2 py-1" onclick="gerenciarVinculo('${doc.id}','recusado')">❌</button>
                </div>`;
            lista.appendChild(div);
        });
    } catch (e) {
        lista.innerHTML = '<p class="text-red-400 text-xs">Erro.</p>';
    }
}

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
            if (v.userId === auth.currentUser.uid) return;

            let div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-zinc-800 p-2 rounded-lg';
            div.innerHTML = `<div><span class="text-white text-xs font-medium">👤 ${v.userName}</span><span class="text-zinc-500 text-xs ml-1">${v.userEmail}</span></div>
                <div class="flex items-center gap-2">
                    <select onchange="alterarRole('${doc.id}', this.value)" class="bg-zinc-700 text-white text-xs rounded border border-zinc-600 p-0.5">
                        <option value="admin" ${v.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="user" ${v.role === 'user' ? 'selected' : ''}>Usuário</option>
                    </select>
                    <button onclick="removerVinculo('${doc.id}')" class="text-red-400 hover:text-red-300 text-xs">🗑️</button>
                </div>`;
            lista.appendChild(div);
        });
    } catch (e) {
        lista.innerHTML = '<p class="text-red-400 text-xs">Erro.</p>';
    }
}

async function gerenciarVinculo(vinculoId, status, userId) {
    try {
        let vinculoRef = db.collection('vinculos').doc(vinculoId);
        if (status === 'aprovado' && userId) {
            let role = document.getElementById('role_' + vinculoId)?.value || 'user';
            let vinculoDoc = await vinculoRef.get();
            let empId = vinculoDoc.data().empresaId;
            let empDoc = await db.collection('empresas').doc(empId).get();
            let url = empDoc.data()?.url_tunel || (await db.collection('usuarios').doc(auth.currentUser.uid).get()).data()?.url_tunel || '';
            await vinculoRef.update({ status: 'aprovado', role, url_tunel: url });
            mostrarMsg('msgEmpresa', '✅ Vinculado!', 'text-emerald-400');
        } else {
            await vinculoRef.update({ status });
            mostrarMsg('msgEmpresa', '❌ Recusado.', 'text-red-400');
        }
        carregarUsuarios();
    } catch (e) {
        console.error('Erro:', e);
    }
}

async function alterarRole(vinculoId, novoRole) {
    try {
        await db.collection('vinculos').doc(vinculoId).update({ role: novoRole });
        mostrarMsg('msgEmpresa', '✅ Alterado!', 'text-emerald-400');
    } catch (e) {
        console.error(e);
    }
}

async function removerVinculo(vinculoId) {
    if (!confirm('Remover?')) return;
    try {
        await db.collection('vinculos').doc(vinculoId).delete();
        mostrarMsg('msgEmpresa', '✅ Removido!', 'text-emerald-400');
        carregarUsuarios();
    } catch (e) {
        console.error(e);
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

// ========== ORDEM DOS GRÁFICOS ==========
function configurarSelectsInteligentes() {
    ['ordem1', 'ordem2', 'ordem3', 'ordem4'].forEach(id => {
        document.getElementById(id).addEventListener('change', atualizarOrdens);
    });
    atualizarOrdens();
}

function atualizarOrdens() {
    let selects = ['ordem1', 'ordem2', 'ordem3', 'ordem4'];
    let valores = selects.map(id => document.getElementById(id).value);
    selects.forEach((id, index) => {
        let select = document.getElementById(id);
        for (let opt of select.options) {
            opt.disabled = valores.some((v, i) => i !== index && v === opt.value);
        }
    });
}

// ========== PREFERÊNCIAS ==========
async function carregarPreferencias() {
    let user = auth.currentUser;
    if (!user) return;
    let doc = await db.collection('usuarios').doc(user.uid).get();
    if (doc.exists) {
        let pref = doc.data().graficos || {
            p2p: true, paineis: true, servidores: true,
            energias: true, servicos: true, clientes: true
        };
        document.getElementById('chkP2P').checked = pref.p2p !== false;
        document.getElementById('chkPaineis').checked = pref.paineis !== false;
        document.getElementById('chkServidores').checked = pref.servidores !== false;
        document.getElementById('chkEnergias').checked = pref.energias !== false;
        document.getElementById('chkServicos').checked = pref.servicos !== false;
        document.getElementById('chkClientes').checked = pref.clientes !== false;
    }
}

async function salvarVisibilidade() {
    let user = auth.currentUser;
    let pref = {
        p2p: document.getElementById('chkP2P').checked,
        paineis: document.getElementById('chkPaineis').checked,
        servidores: document.getElementById('chkServidores').checked,
        energias: document.getElementById('chkEnergias').checked,
        servicos: document.getElementById('chkServicos').checked,
        clientes: document.getElementById('chkClientes').checked
    };
    try {
        await db.collection('usuarios').doc(user.uid).set({ graficos: pref }, { merge: true });
        mostrarMsg('msgVisibilidade', '✅ Salvo!', 'text-emerald-400');
    } catch (e) {
        mostrarMsg('msgVisibilidade', '❌ Erro', 'text-red-400');
    }
}

async function carregarOrdem() {
    let user = auth.currentUser;
    if (!user) return;
    let doc = await db.collection('usuarios').doc(user.uid).get();
    if (doc.exists && doc.data().ordem) {
        document.getElementById('ordem1').value = doc.data().ordem[0] || 'p2p';
        document.getElementById('ordem2').value = doc.data().ordem[1] || 'paineis';
        document.getElementById('ordem3').value = doc.data().ordem[2] || 'servidores';
        document.getElementById('ordem4').value = doc.data().ordem[3] || 'energias';
    }
}

async function salvarOrdem() {
    let user = auth.currentUser;
    let ordem = [
        document.getElementById('ordem1').value,
        document.getElementById('ordem2').value,
        document.getElementById('ordem3').value,
        document.getElementById('ordem4').value
    ];
    try {
        await db.collection('usuarios').doc(user.uid).set({ ordem }, { merge: true });
        mostrarMsg('msgOrdem', '✅ Salvo!', 'text-emerald-400');
    } catch (e) {
        mostrarMsg('msgOrdem', '❌ Erro', 'text-red-400');
    }
}