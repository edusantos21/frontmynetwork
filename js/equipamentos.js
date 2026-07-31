// js/equipamentos.js - COMPLETO COM FIRMWARE
const auth = firebase.auth();
let apiUrl = '';
let editandoId = null;
let todosEquipamentos = [];
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

// ========== CARREGAR ==========
async function carregarEquipamentos() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL não encontrada');

    let resp = await fetch(apiUrl + '/equipamentos');
    if (!resp.ok) throw new Error('Erro ' + resp.status);

    todosEquipamentos = await resp.json();

    const params = new URLSearchParams(window.location.search);
    const filtroUrl = params.get('filtro');
    if (filtroUrl) {
        document.getElementById('filtroTipo').value = filtroUrl;
    }

    filtrarEquipamentos();
}

// ========== FILTRAR ==========
function filtrarEquipamentos() {
    let busca = document.getElementById('buscarEquipamento').value.toLowerCase();
    let filtro = document.getElementById('filtroTipo').value;

    let filtrados = todosEquipamentos.filter(eq => {
        const nome = (eq.nome || '').toLowerCase();
        const ip = (eq.ip || '').toLowerCase();
        const localidade = (eq.localidade || '').toLowerCase();
        const mac = (eq.mac || '').toLowerCase();
        const ssid = (eq.ssid || '').toLowerCase();
        const buscaMatch = !busca || nome.includes(busca) || ip.includes(busca) || localidade.includes(busca) || mac.includes(busca) || ssid.includes(busca);

        let status = eq.status || '';
        let tipoMatch = true;
        switch (filtro) {
            case 'online': tipoMatch = status.includes('ONLINE'); break;
            case 'offline': tipoMatch = status.includes('OFFLINE'); break;
            case 'p2p': tipoMatch = eq.modo_operacao === 'p2p'; break;
            case 'ap': tipoMatch = eq.modo_operacao === 'p2p' && eq.p2p_tipo === 'ap'; break;
            case 'station': tipoMatch = eq.modo_operacao === 'p2p' && eq.p2p_tipo === 'station'; break;
            case 'painel': tipoMatch = eq.modo_operacao === 'cliente'; break;
        }
        return buscaMatch && tipoMatch;
    });

    if (visualizacao === 'lista') renderizarTabela(filtrados);
    else renderizarCards(filtrados);
}

// ========== ALTERNAR VISUALIZAÇÃO ==========
function alternarVisualizacao() {
    visualizacao = visualizacao === 'lista' ? 'cards' : 'lista';
    document.getElementById('btnVisualizacao').textContent = visualizacao === 'lista' ? '🎴 Cards' : '📋 Lista';
    document.getElementById('cabecalhoTabela').style.display = visualizacao === 'cards' ? 'none' : '';
    filtrarEquipamentos();
}

// ========== FIRMWARE DISPLAY ==========
function getFirmwareDisplay(fw) {
    if (fw === 'ubiquiti') return 'Ubiquiti';
    if (fw === 'bullet') return 'Bullet';
    if (fw === 'mikrotik') return 'MikroTik';
    if (fw === 'mimosa') return 'Mimosa';
    return fw || 'Ubiquiti';
}

// ========== RENDERIZAR TABELA ==========
function renderizarTabela(equipamentos) {
    document.getElementById('cabecalhoTabela').style.display = '';
    let html = '';
    equipamentos.forEach(eq => {
        let status = eq.status || 'N/A';
        let cls = status.includes('ONLINE') ? 'status-online' : 'status-offline';
        let latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-';
        let mac = eq.mac ? eq.mac.toUpperCase() : '-';
        let ssh = eq.ssh_enabled ? 'Sim' : 'Não';
        let clientes = eq.clientes || 0;
        let ssid = eq.ssid ? eq.ssid.substring(0, 20) : '-';
        let modo = eq.modo_operacao === 'p2p' ? 'P2P' : 'Cliente';
        let firmware = getFirmwareDisplay(eq.firmware);
        
        html += `<tr class="border-b border-zinc-800">
            <td><a href="http://${eq.ip}" target="_blank" class="text-emerald-400 hover:underline">${eq.nome || '-'}</a></td>
            <td>${eq.ip || '-'}</td>
            <td>${eq.porta || '80'}</td>
            <td>${eq.localidade || '-'}</td>
            <td>${modo}</td>
            <td>${firmware}</td>
            <td class="text-xs">${mac}</td>
            <td>${ssh}</td>
            <td>${clientes}</td>
            <td class="text-xs">${ssid}</td>
            <td class="${cls}">${status}</td>
            <td>${latencia}</td>
            <td>
                <button onclick="editarEquipamento(${eq.id})" class="text-blue-400 hover:text-blue-300 text-xs mr-1">✏️</button>
                <button onclick="excluirEquipamento(${eq.id}, '${(eq.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 hover:text-red-300 text-xs">🗑️</button>
            </td></tr>`;
    });
    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="13" class="text-center text-zinc-500 py-4">Nenhum equipamento</td></tr>';
}

// ========== RENDERIZAR CARDS ==========
function renderizarCards(equipamentos) {
    document.getElementById('cabecalhoTabela').style.display = 'none';
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">';
    equipamentos.forEach(eq => {
        let status = eq.status || 'N/A', cls = status.includes('ONLINE') ? 'text-emerald-400' : 'text-red-400', icone = status.includes('ONLINE') ? '🟢' : '🔴';
        let latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-', modo = eq.modo_operacao === 'p2p' ? '🔗 P2P' : '📡 Painel';
        let firmware = getFirmwareDisplay(eq.firmware);
        let p2pInfo = '';
        if (eq.modo_operacao === 'p2p') {
            if (eq.p2p_tipo === 'ap') p2pInfo = `<div class="text-zinc-500 text-xs">AP → ${eq.p2p_par || '-'}</div>`;
            else if (eq.p2p_tipo === 'station') p2pInfo = `<div class="text-zinc-500 text-xs">← Station ${eq.p2p_par || '-'}</div>`;
            else p2pInfo = `<div class="text-zinc-500 text-xs">P2P</div>`;
        }
        html += `<div class="bg-zinc-800 p-2 rounded-lg border border-zinc-700"><div class="flex justify-between"><a href="http://${eq.ip}" target="_blank" class="text-emerald-400 hover:underline font-bold text-xs truncate">${eq.nome || '-'}</a><span class="${cls} text-xs font-bold ml-1">${icone}</span></div><div class="text-zinc-500 text-xs">🌐 ${eq.ip || '-'}:${eq.porta || '80'}</div><div class="text-zinc-500 text-xs">📍 ${eq.localidade || '-'}</div><div>${modo} | ${firmware}</div>${p2pInfo}<div>👥 ${eq.clientes || 0} | ⏱️ ${latencia}</div><div class="flex justify-end gap-1 mt-1"><button onclick="editarEquipamento(${eq.id})" class="text-blue-400 text-xs">✏️</button><button onclick="excluirEquipamento(${eq.id}, '${(eq.nome || '').replace(/'/g, "\\'")}')" class="text-red-400 text-xs">🗑️</button></div></div>`;
    });
    html += '</div>';
    document.getElementById('corpoTabela').innerHTML = html || '<p class="text-center text-zinc-500 py-4">Nenhum equipamento</p>';
}

// ========== TOGGLE P2P / SSH ==========
function toggleP2P() {
    document.getElementById('p2pFields').classList.toggle('hidden', document.getElementById('formModo').value !== 'p2p');
    if (document.getElementById('formModo').value === 'p2p') carregarParesP2P();
}

function carregarParesP2P() {
    let p2pTipo = document.querySelector('input[name="p2pTipo"]:checked');
    if (!p2pTipo) {
        document.querySelector('input[name="p2pTipo"][value="ap"]').checked = true;
        p2pTipo = document.querySelector('input[name="p2pTipo"][value="ap"]');
    }
    let tipoOposto = p2pTipo.value === 'ap' ? 'station' : 'ap';
    let pares = todosEquipamentos.filter(e => e.modo_operacao === 'p2p' && e.p2p_tipo === tipoOposto);
    let select = document.getElementById('formP2PPar');
    select.innerHTML = '<option value="">Selecione...</option>';
    pares.forEach(p => { select.innerHTML += `<option value="${p.nome}">${p.nome} (${p.ip})</option>`; });
}

document.addEventListener('change', function (e) {
    if (e.target.name === 'p2pTipo') carregarParesP2P();
});

function toggleSSH() {
    document.getElementById('sshFields').classList.toggle('hidden', !document.getElementById('formSsh').checked);
}

// ========== MODAL ==========
function mostrarFormulario() {
    editandoId = null;
    document.getElementById('tituloModal').textContent = 'Adicionar Equipamento';
    document.getElementById('formNome').value = '';
    document.getElementById('formIp').value = '';
    document.getElementById('formLocalidade').value = '';
    document.getElementById('formPorta').value = '80';
    document.getElementById('formModo').value = 'cliente';
    document.getElementById('formSsh').checked = true;
    document.getElementById('formSshUser').value = 'ubnt';
    document.getElementById('formSshPass').value = '';
    document.getElementById('formSshPort').value = '22';
    document.querySelector('input[name="p2pTipo"][value="ap"]').checked = true;
    document.getElementById('formP2PPar').value = '';
    // Firmware padrão
    let radioFw = document.querySelector('input[name="formFirmware"][value="ubiquiti"]');
    if (radioFw) radioFw.checked = true;
    toggleP2P();
    toggleSSH();
    document.getElementById('modalEquipamento').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('modalEquipamento').classList.add('hidden');
}

async function editarEquipamento(id) {
    apiUrl = await buscarUrlTunel();
    let eq = todosEquipamentos.find(e => e.id === id);
    if (!eq) return;
    editandoId = id;
    document.getElementById('tituloModal').textContent = 'Editar Equipamento';
    document.getElementById('formNome').value = eq.nome || '';
    document.getElementById('formIp').value = eq.ip || '';
    document.getElementById('formLocalidade').value = eq.localidade || '';
    document.getElementById('formPorta').value = eq.porta || '80';
    document.getElementById('formModo').value = eq.modo_operacao || 'cliente';
    if (eq.p2p_tipo) {
        let radio = document.querySelector(`input[name="p2pTipo"][value="${eq.p2p_tipo}"]`);
        if (radio) radio.checked = true;
    }
    document.getElementById('formP2PPar').value = eq.p2p_par || '';
    document.getElementById('formSsh').checked = eq.ssh_enabled || false;
    document.getElementById('formSshUser').value = eq.ssh_usuario || 'ubnt';
    document.getElementById('formSshPass').value = eq.ssh_senha || '';
    document.getElementById('formSshPort').value = eq.ssh_porta || '22';
    // Firmware
    let fw = eq.firmware || 'ubiquiti';
    let radioFw = document.querySelector(`input[name="formFirmware"][value="${fw}"]`);
    if (radioFw) radioFw.checked = true;
    toggleP2P();
    toggleSSH();
    document.getElementById('modalEquipamento').classList.remove('hidden');
}

async function salvarEquipamento() {
    apiUrl = await buscarUrlTunel();
    let msg = document.getElementById('msgForm');
    let modo = document.getElementById('formModo').value;
    let p2pTipo = '', p2pPar = '';
    if (modo === 'p2p') {
        let radio = document.querySelector('input[name="p2pTipo"]:checked');
        p2pTipo = radio ? radio.value : 'ap';
        p2pPar = document.getElementById('formP2PPar').value;
    }
    // Pega firmware selecionado
    let fwRadio = document.querySelector('input[name="formFirmware"]:checked');
    let firmware = fwRadio ? fwRadio.value : 'ubiquiti';
    
    let dados = {
        nome: document.getElementById('formNome').value,
        ip: document.getElementById('formIp').value,
        localidade: document.getElementById('formLocalidade').value,
        modo_operacao: modo,
        tipo: 'equipamento',
        firmware: firmware,
        porta: document.getElementById('formPorta').value || '80',
        p2p_tipo: p2pTipo,
        p2p_par: p2pPar,
        ssh_enabled: document.getElementById('formSsh').checked,
        ssh_usuario: document.getElementById('formSshUser').value || 'ubnt',
        ssh_senha: document.getElementById('formSshPass').value,
        ssh_porta: parseInt(document.getElementById('formSshPort').value) || 22,
        dados_snmp: {}
    };
    if (!dados.nome || !dados.ip) {
        msg.textContent = '⚠️ Nome e IP são obrigatórios!';
        msg.className = 'text-xs mt-2 text-yellow-400';
        msg.classList.remove('hidden');
        return;
    }
    try {
        let url = editandoId ? apiUrl + '/equipamento/' + editandoId : apiUrl + '/equipamento';
        let resp = await fetch(url, {
            method: editandoId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (resp.ok) {
            msg.textContent = '✅ Salvo!';
            msg.className = 'text-xs mt-2 text-emerald-400';
            msg.classList.remove('hidden');
            setTimeout(() => { fecharModal(); carregarEquipamentos(); }, 1000);
        }
    } catch (e) {
        msg.textContent = '❌ Erro';
        msg.className = 'text-xs mt-2 text-red-400';
        msg.classList.remove('hidden');
    }
}

async function excluirEquipamento(id, nome) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    apiUrl = await buscarUrlTunel();
    try {
        await fetch(apiUrl + '/equipamento/' + id, { method: 'DELETE' });
        carregarEquipamentos();
    } catch (e) {
        alert('Erro ao excluir');
    }
}