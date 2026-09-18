// js/solicitacoes.js
const db = firebase.firestore();

let empresaAdmin = null;

// ========== CARREGAR (chamado pelo utils.js) ==========
async function carregar() {
    // ✅ Tenta checar o backend, mas NÃO impede a página de carregar
    try {
        let url = await buscarUrlTunel();
        if (url) {
            let resp = await fetch(url + '/');
            if (resp.ok) {
                atualizarStatusServidor('online');
            } else {
                atualizarStatusServidor('offline');
            }
        } else {
            atualizarStatusServidor('offline');
        }
    } catch (e) {
        console.warn('⚠️ Backend offline, mas seguindo com Firestore:', e.message);
        atualizarStatusServidor('offline');
    }

    // ✅ O que importa: descobrir empresa + listar solicitações (Firestore puro)
    await descobrirEmpresaAdmin();

    if (!empresaAdmin) {
        mostrarMsg('msgSolicitacao', '⚠️ Você não é admin desta empresa.', 'text-yellow-400');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
        throw new Error('Sem empresa admin');
    }

    let subU = document.getElementById('submenuUsuarios');
    let setaU = document.getElementById('setaUsuarios');
    if (subU) {
        subU.classList.remove('hidden');
        if (setaU) setaU.style.transform = 'rotate(90deg)';
    }

    await carregarSolicitacoes();

    return true;
}

// ========== DESCOBRIR EMPRESA ADMIN ==========
async function descobrirEmpresaAdmin() {
    let user = firebase.auth().currentUser;
    if (!user) return;

    // ✅ LÊ a empresa selecionada no topo
    let empresaSelecionadaId = localStorage.getItem('empresaSelecionada');

    let vinculos = await db.collection('vinculos')
        .where('userId', '==', user.uid)
        .where('status', '==', 'aprovado')
        .get();

    empresaAdmin = null;

    for (let doc of vinculos.docs) {
        let v = doc.data();
        if (v.role !== 'admin') continue;

        // ✅ SÓ aceita se for a empresa selecionada
        if (empresaSelecionadaId && v.empresaId !== empresaSelecionadaId) continue;

        let empDoc = await db.collection('empresas').doc(v.empresaId).get();
        if (empDoc.exists) {
            empresaAdmin = {
                id: empDoc.id,
                nome: empDoc.data().nome
            };
            break;
        }
    }
}

// ========== CARREGAR SOLICITAÇÕES ==========
async function carregarSolicitacoes() {
    let lista = document.getElementById('listaSolicitacoes');
    try {
        let snapshot = await db.collection('vinculos')
            .where('empresaId', '==', empresaAdmin.id)
            .where('status', '==', 'pendente')
            .get();

        if (snapshot.empty) {
            lista.innerHTML = '<p class="text-zinc-500 text-xs">Nenhuma solicitação pendente.</p>';
            return;
        }

        lista.innerHTML = '';
        snapshot.forEach(doc => {
            let v = doc.data();
            let div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-zinc-800 p-3 rounded-lg';
            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-white text-sm font-medium">👤 ${v.userName || 'Usuário'}</span>
                    <span class="text-zinc-500 text-xs">${v.userEmail || '-'}</span>
                </div>
                <div class="flex gap-1 items-center">
                    <select id="role_${doc.id}" class="bg-zinc-700 text-white text-xs rounded border border-zinc-600 p-1">
                        <option value="user">Usuário</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button class="py-1 px-3 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs rounded" onclick="aprovarSolicitacao('${doc.id}', '${v.userId}')">✅ Aprovar</button>
                    <button class="py-1 px-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded" onclick="recusarSolicitacao('${doc.id}')">❌ Recusar</button>
                </div>`;
            lista.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        lista.innerHTML = '<p class="text-red-400 text-xs">Erro ao carregar.</p>';
    }
}

// ========== APROVAR ==========
async function aprovarSolicitacao(vinculoId, userId) {
    try {
        let vinculoRef = db.collection('vinculos').doc(vinculoId);
        let role = document.getElementById('role_' + vinculoId)?.value || 'user';

        let vinculoDoc = await vinculoRef.get();
        let empId = vinculoDoc.data().empresaId;
        let empDoc = await db.collection('empresas').doc(empId).get();
        let url = empDoc.data()?.url_tunel || (await db.collection('usuarios').doc(firebase.auth().currentUser.uid).get()).data()?.url_tunel || '';

        await vinculoRef.update({
            status: 'aprovado',
            role: role,
            url_tunel: url
        });

        mostrarMsg('msgSolicitacao', '✅ Solicitação aprovada!', 'text-emerald-400');
        carregarSolicitacoes();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgSolicitacao', '❌ Erro ao aprovar', 'text-red-400');
    }
}

// ========== RECUSAR ==========
async function recusarSolicitacao(vinculoId) {
    if (!confirm('Recusar esta solicitação?')) return;
    try {
        await db.collection('vinculos').doc(vinculoId).update({ status: 'recusado' });
        mostrarMsg('msgSolicitacao', '❌ Solicitação recusada.', 'text-red-400');
        carregarSolicitacoes();
    } catch (e) {
        console.error(e);
        mostrarMsg('msgSolicitacao', '❌ Erro ao recusar', 'text-red-400');
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