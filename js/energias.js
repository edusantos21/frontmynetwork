// js/energias.js - LIMPO (controle no utils.js)
const auth = firebase.auth();
let apiUrl = '';
let editandoId = null;
let todosEnergias = [];
let visualizacao = 'lista';

// ========== AUTENTICAÇÃO ==========
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = '../index.html'; return; }
    
    document.getElementById('nomeUsuario').textContent = user.displayName || 'Usuário';
    document.getElementById('emailUsuario').textContent = user.email;
    document.getElementById('avatarNome').textContent = (user.displayName || 'U')[0].toUpperCase();
    
    iniciarRelogio();
    await carregarEmpresasSeletor();
});

document.getElementById('intervalo').addEventListener('change', function () {
    intervaloAtual = parseInt(this.value) * 1000;
    localStorage.setItem('intervalo', intervaloAtual);
});

// ========== CARREGAR (chamado pelo utils.js) ==========
async function carregar() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL não encontrada');

    let resp = await fetch(apiUrl + '/energias');
    if (!resp.ok) throw new Error('Erro ' + resp.status);
    
    todosEnergias = await resp.json();
    filtrar();
}

// ========== FILTRAR ==========
function filtrar() {
    let busca = document.getElementById('buscar').value.toLowerCase();
    let filtro = document.getElementById('filtroTipo').value;
    
    let filtrados = todosEnergias.filter(en => {
        let nomeMatch = (en.nome || '').toLowerCase().includes(busca);
        let ipMatch = (en.ip || '').toLowerCase().includes(busca);
        let status = en.status || '';
        let tipoMatch = true;
        if (filtro === 'online') tipoMatch = status.includes('ONLINE');
        else if (filtro === 'offline') tipoMatch = status.includes('OFFLINE');
        return (nomeMatch || ipMatch) && tipoMatch;
    });
    
    if (visualizacao === 'lista') renderizarTabela(filtrados);
    else renderizarCards(filtrados);
}

function alternarVisualizacao() {
    visualizacao = visualizacao === 'lista' ? 'cards' : 'lista';
    document.getElementById('btnVisualizacao').textContent = visualizacao === 'lista' ? '🎴 Cards' : '📋 Lista';
    document.getElementById('cabecalhoTabela').style.display = visualizacao === 'cards' ? 'none' : '';
    filtrar();
}

function renderizarTabela(energias) {
    document.getElementById('cabecalhoTabela').style.display = '';
    let html = '';
    energias.forEach(en => {
        let status = en.status || 'N/A', cls = status.includes('ONLINE') ? 'status-online' : 'status-offline';
        html += `<tr class="border-b border-zinc-800"><td><a href="http://${en.ip}" target="_blank" class="text-emerald-400 hover:underline">${en.nome || '-'}</a></td><td>${en.ip || '-'}</td><td>${en.localidade || '-'}</td><td class="${cls}">${status}</td><td>${en.latencia > 0 ? en.latencia + 'ms' : '-'}</td><td><button onclick="editar(${en.id})" class="text-blue-400 text-xs mr-1">✏️</button><button onclick="excluir(${en.id}, '${(en.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 text-xs">🗑️</button></td></tr>`;
    });
    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="6" class="text-center text-zinc-500 py-4">Nenhuma energia</td></tr>';
}

function renderizarCards(energias) {
    document.getElementById('cabecalhoTabela').style.display = 'none';
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">';
    energias.forEach(en => {
        let status = en.status || 'N/A', cls = status.includes('ONLINE') ? 'text-emerald-400' : 'text-red-400', icone = status.includes('ONLINE') ? '🟢' : '🔴';
        html += `<div class="bg-zinc-800 p-2 rounded-lg border border-zinc-700"><div class="flex justify-between"><a href="http://${en.ip}" target="_blank" class="text-emerald-400 hover:underline font-bold text-xs truncate">${en.nome || '-'}</a><span class="${cls} text-xs font-bold ml-1">${icone}</span></div><div class="text-zinc-500 text-xs">🌐 ${en.ip || '-'}</div><div class="text-zinc-500 text-xs">📍 ${en.localidade || '-'}</div><div class="text-zinc-500 text-xs">⏱️ ${en.latencia > 0 ? en.latencia + 'ms' : '-'}</div><div class="flex justify-end gap-1 mt-1"><button onclick="editar(${en.id})" class="text-blue-400 text-xs">✏️</button><button onclick="excluir(${en.id}, '${(en.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 text-xs">🗑️</button></div></div>`;
    });
    html += '</div>';
    document.getElementById('corpoTabela').innerHTML = html || '<p class="text-center text-zinc-500 py-4">Nenhuma energia</p>';
}

function mostrarFormulario() { editandoId = null; document.getElementById('tituloModal').textContent = 'Adicionar Energia'; document.getElementById('formNome').value = ''; document.getElementById('formIp').value = ''; document.getElementById('formLocalidade').value = ''; document.getElementById('modal').classList.remove('hidden'); }
function fecharModal() { document.getElementById('modal').classList.add('hidden'); }
async function editar(id) { apiUrl = await buscarUrlTunel(); let en = todosEnergias.find(e => e.id === id); if (!en) return; editandoId = id; document.getElementById('tituloModal').textContent = 'Editar Energia'; document.getElementById('formNome').value = en.nome || ''; document.getElementById('formIp').value = en.ip || ''; document.getElementById('formLocalidade').value = en.localidade || ''; document.getElementById('modal').classList.remove('hidden'); }
async function salvar() { apiUrl = await buscarUrlTunel(); let msg = document.getElementById('msgForm'); let dados = { nome: document.getElementById('formNome').value, ip: document.getElementById('formIp').value, localidade: document.getElementById('formLocalidade').value, tipo: 'energia' }; if (!dados.nome || !dados.ip) { msg.textContent = '⚠️ Nome e IP são obrigatórios!'; msg.className = 'text-xs mt-2 text-yellow-400'; msg.classList.remove('hidden'); return; } try { let url = editandoId ? apiUrl + '/equipamento/' + editandoId : apiUrl + '/equipamento'; let resp = await fetch(url, { method: editandoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }); if (resp.ok) { msg.textContent = '✅ Salvo!'; msg.className = 'text-xs mt-2 text-emerald-400'; msg.classList.remove('hidden'); setTimeout(() => { fecharModal(); carregar(); }, 1000); } } catch(e) { msg.textContent = '❌ Erro'; msg.className = 'text-xs mt-2 text-red-400'; msg.classList.remove('hidden'); } }
async function excluir(id, nome) { if (!confirm(`Excluir "${nome}"?`)) return; apiUrl = await buscarUrlTunel(); try { await fetch(apiUrl + '/equipamento/' + id, { method: 'DELETE' }); carregar(); } catch(e) { alert('Erro ao excluir'); } }