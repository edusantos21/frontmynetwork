// js/clientes.js - LIMPO (controle no utils.js)
const auth = firebase.auth();
let apiUrl = '';
let editandoId = null;
let todosClientes = [];
let todosEquipamentos = [];
let todasLocalidades = [];
let visualizacao = 'lista';

// ========== AUTENTICAÇÃO ==========
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = '../index.html'; return; }
    
    document.getElementById('nomeUsuario').textContent = user.displayName || 'Usuário';
    document.getElementById('emailUsuario').textContent = user.email;
    document.getElementById('avatarNome').textContent = (user.displayName || 'U')[0].toUpperCase();
    
    iniciarRelogio();
    await carregarEmpresasSeletor();
    // Não carrega dados automaticamente - o utils.js chama quando selecionar empresa
});

document.getElementById('intervalo').addEventListener('change', function () {
    intervaloAtual = parseInt(this.value) * 1000;
    localStorage.setItem('intervalo', intervaloAtual);
});

// ========== CARREGAR (chamado pelo utils.js) ==========
async function carregarClientes() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL não encontrada');
    
    let [respCli, respEq] = await Promise.all([
        fetch(apiUrl + '/clientes'),
        fetch(apiUrl + '/equipamentos')
    ]);
    
    if (!respCli.ok || !respEq.ok) throw new Error('Erro ao carregar');
    
    todosClientes = await respCli.json();
    todosEquipamentos = await respEq.json();
    todasLocalidades = [...new Set(todosEquipamentos.map(e => e.localidade).filter(Boolean))];
    
    filtrarClientes();
}

// ========== FILTRAR ==========
function filtrarClientes() {
    let busca = document.getElementById('buscarCliente').value.toLowerCase();
    let filtro = document.getElementById('filtroTipo').value;
    
    let filtrados = todosClientes.filter(cli => {
        let nomeMatch = (cli.nome || '').toLowerCase().includes(busca);
        let ipMatch = (cli.ip || '').toLowerCase().includes(busca);
        let status = cli.status || '';
        
        let tipoMatch = true;
        switch(filtro) {
            case 'online': tipoMatch = status.includes('ONLINE'); break;
            case 'offline': tipoMatch = status.includes('OFFLINE'); break;
            case 'radio': tipoMatch = cli.tipo === 'radio'; break;
            case 'fibra': tipoMatch = cli.tipo === 'fibra'; break;
            default: tipoMatch = true;
        }
        
        return (nomeMatch || ipMatch) && tipoMatch;
    });
    
    if (visualizacao === 'lista') renderizarTabela(filtrados);
    else renderizarCards(filtrados);
}

// ========== ALTERNAR VISUALIZAÇÃO ==========
function alternarVisualizacao() {
    visualizacao = visualizacao === 'lista' ? 'cards' : 'lista';
    document.getElementById('btnVisualizacao').textContent = visualizacao === 'lista' ? '🎴 Cards' : '📋 Lista';
    document.getElementById('cabecalhoTabela').style.display = visualizacao === 'cards' ? 'none' : '';
    filtrarClientes();
}

// ========== RENDERIZAR TABELA ==========
function renderizarTabela(clientes) {
    document.getElementById('cabecalhoTabela').style.display = '';
    let html = '';
    clientes.forEach(cli => {
        let status = cli.status || 'N/A';
        let cls = status.includes('ONLINE') ? 'status-online' : 'status-offline';
        let latencia = cli.latencia > 0 ? cli.latencia + 'ms' : '-';
        let tipo = cli.tipo === 'radio' ? '📡 Rádio' : '🔌 Fibra';
        let referencia = cli.tipo === 'radio' ? (cli.painel || '-') : (cli.pon_id || '-');
        let localEndereco = cli.tipo === 'radio' ? (cli.localidade || '-') : (cli.endereco || '-');
        
        html += `<tr class="border-b border-zinc-800">
            <td><a href="http://${cli.ip}" target="_blank" class="text-emerald-400 hover:underline">${cli.nome || '-'}</a></td>
            <td>${cli.ip || '-'}</td><td>${tipo}</td><td>${referencia}</td><td>${localEndereco}</td>
            <td class="${cls}">${status}</td><td>${latencia}</td>
            <td>
                <button onclick="editarCliente(${cli.id})" class="text-blue-400 hover:text-blue-300 text-xs mr-1">✏️</button>
                <button onclick="excluirCliente(${cli.id}, '${(cli.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 hover:text-red-300 text-xs">🗑️</button>
            </td></tr>`;
    });
    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="8" class="text-center text-zinc-500 py-4">Nenhum cliente</td></tr>';
}

// ========== RENDERIZAR CARDS ==========
function renderizarCards(clientes) {
    document.getElementById('cabecalhoTabela').style.display = 'none';
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">';
    clientes.forEach(cli => {
        let status = cli.status || 'N/A';
        let cls = status.includes('ONLINE') ? 'text-emerald-400' : 'text-red-400';
        let icone = status.includes('ONLINE') ? '🟢' : '🔴';
        let latencia = cli.latencia > 0 ? cli.latencia + 'ms' : '-';
        let tipoIcone = cli.tipo === 'radio' ? '📡' : '🔌';
        let tipoNome = cli.tipo === 'radio' ? 'Rádio' : 'Fibra';
        let referencia = cli.tipo === 'radio' ? cli.painel : cli.pon_id;
        let local = cli.tipo === 'radio' ? cli.localidade : cli.endereco;
        html += `<div class="bg-zinc-800 p-2 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all">
            <div class="flex justify-between items-start mb-1"><a href="http://${cli.ip}" target="_blank" class="text-emerald-400 hover:underline font-bold text-xs truncate">${cli.nome || '-'}</a><span class="${cls} text-xs font-bold ml-1">${icone}</span></div>
            <div class="text-zinc-500 text-xs space-y-0.5"><div>🌐 ${cli.ip || '-'}</div><div>${tipoIcone} ${tipoNome}</div>${referencia ? `<div>📌 ${referencia}</div>` : ''}${local ? `<div>📍 ${local}</div>` : ''}<div>⏱️ ${latencia}</div></div>
            <div class="flex justify-end gap-1 mt-1"><button onclick="editarCliente(${cli.id})" class="text-blue-400 text-xs">✏️</button><button onclick="excluirCliente(${cli.id}, '${(cli.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 text-xs">🗑️</button></div></div>`;
    });
    html += '</div>';
    document.getElementById('corpoTabela').innerHTML = html || '<p class="text-center text-zinc-500 py-4">Nenhum cliente</p>';
}

// ========== TOGGLE TIPO CONEXÃO ==========
function toggleTipoConexao() {
    let tipo = document.getElementById('formTipo').value;
    document.getElementById('fieldsRadio').classList.toggle('hidden', tipo !== 'radio');
    document.getElementById('fieldsFibra').classList.toggle('hidden', tipo !== 'fibra');
}

// ========== MODAL ==========
function mostrarFormulario() {
    editandoId = null;
    document.getElementById('tituloModal').textContent = 'Adicionar Cliente';
    document.getElementById('formNome').value = '';
    document.getElementById('formIp').value = '';
    document.getElementById('formTipo').value = 'radio';
    document.getElementById('formPonId').value = '';
    document.getElementById('formEndereco').value = '';
    carregarOpcoesModal();
    toggleTipoConexao();
    document.getElementById('modalCliente').classList.remove('hidden');
}

function carregarOpcoesModal() {
    let selectPainel = document.getElementById('formPainel');
    selectPainel.innerHTML = '<option value="">Selecione...</option>';
    todosEquipamentos.forEach(e => { selectPainel.innerHTML += `<option value="${e.nome}">${e.nome} (${e.ip})</option>`; });
    let selectLocal = document.getElementById('formLocalidade');
    selectLocal.innerHTML = '<option value="">Selecione...</option>';
    todasLocalidades.forEach(l => { selectLocal.innerHTML += `<option value="${l}">${l}</option>`; });
}

function fecharModal() { document.getElementById('modalCliente').classList.add('hidden'); }

async function editarCliente(id) {
    apiUrl = await buscarUrlTunel();
    let cli = todosClientes.find(c => c.id === id);
    if (!cli) return;
    editandoId = id;
    document.getElementById('tituloModal').textContent = 'Editar Cliente';
    document.getElementById('formNome').value = cli.nome || '';
    document.getElementById('formIp').value = cli.ip || '';
    document.getElementById('formTipo').value = cli.tipo || 'radio';
    document.getElementById('formPainel').value = cli.painel || '';
    document.getElementById('formLocalidade').value = cli.localidade || '';
    document.getElementById('formPonId').value = cli.pon_id || '';
    document.getElementById('formEndereco').value = cli.endereco || '';
    carregarOpcoesModal();
    toggleTipoConexao();
    document.getElementById('modalCliente').classList.remove('hidden');
}

async function salvarCliente() {
    apiUrl = await buscarUrlTunel();
    let msg = document.getElementById('msgForm');
    let tipo = document.getElementById('formTipo').value;
    let dados = {
        nome: document.getElementById('formNome').value,
        ip: document.getElementById('formIp').value,
        tipo: tipo,
        painel: tipo === 'radio' ? document.getElementById('formPainel').value : '',
        localidade: tipo === 'radio' ? document.getElementById('formLocalidade').value : '',
        pon_id: tipo === 'fibra' ? document.getElementById('formPonId').value : '',
        endereco: tipo === 'fibra' ? document.getElementById('formEndereco').value : ''
    };
    if (!dados.nome || !dados.ip) { msg.textContent = '⚠️ Nome e IP são obrigatórios!'; msg.className = 'text-xs mt-2 text-yellow-400'; msg.classList.remove('hidden'); return; }
    try {
        let url = editandoId ? apiUrl + '/cliente/' + editandoId : apiUrl + '/cliente';
        let method = editandoId ? 'PUT' : 'POST';
        let resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        if (resp.ok) { msg.textContent = '✅ Salvo!'; msg.className = 'text-xs mt-2 text-emerald-400'; msg.classList.remove('hidden'); setTimeout(() => { fecharModal(); carregarClientes(); }, 1000); }
    } catch(e) { msg.textContent = '❌ Erro'; msg.className = 'text-xs mt-2 text-red-400'; msg.classList.remove('hidden'); }
}

async function excluirCliente(id, nome) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    apiUrl = await buscarUrlTunel();
    try { await fetch(apiUrl + '/cliente/' + id, { method: 'DELETE' }); carregarClientes(); }
    catch(e) { alert('Erro ao excluir'); }
}