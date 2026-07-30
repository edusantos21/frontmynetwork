// js/monitoramento.js
const auth = firebase.auth();
let apiUrl = '';
let todosDispositivos = [];
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

// ========== PEGA FILTRO DA URL ==========
function getFiltroUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('status') || 'todos';
}

// ========== CARREGAR TUDO ==========
async function carregarMonitoramento() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL não encontrada');

    const [respEq, respCli, respSrv, respEn, respSv] = await Promise.all([
        fetch(apiUrl + '/equipamentos'),
        fetch(apiUrl + '/clientes'),
        fetch(apiUrl + '/servidores'),
        fetch(apiUrl + '/energias'),
        fetch(apiUrl + '/servicos')
    ]);

    const equipamentos = await respEq.json();
    const clientes = await respCli.json();
    const servidores = await respSrv.json();
    const energias = await respEn.json();
    const servicos = await respSv.json();

    // Padroniza todos os dispositivos
    todosDispositivos = [
        ...equipamentos.map(e => ({ ...e, _tipo: 'equipamento' })),
        ...clientes.map(c => ({ ...c, _tipo: 'cliente' })),
        ...servidores.map(s => ({ ...s, _tipo: 'servidor' })),
        ...energias.map(e => ({ ...e, _tipo: 'energia' })),
        ...servicos.map(s => ({ ...s, _tipo: 'servico' }))
    ];

    // Aplica filtro da URL
    const filtroUrl = getFiltroUrl();
    if (filtroUrl !== 'todos') {
        document.getElementById('filtroStatus').value = filtroUrl;
    }

    filtrarMonitoramento();
}

// ========== FILTRAR ==========
function filtrarMonitoramento() {
    const busca = document.getElementById('buscarMonitoramento').value.toLowerCase();
    const filtroStatus = document.getElementById('filtroStatus').value;
    const filtroTipo = document.getElementById('filtroTipo').value;

    let filtrados = todosDispositivos.filter(d => {
        // Busca aprimorada: nome, IP, localidade, MAC
        const nome = (d.nome || '').toLowerCase();
        const ip = (d.ip || '').toLowerCase();
        const localidade = (d.localidade || d.endereco || '').toLowerCase();
        const mac = (d.mac || '').toLowerCase();
        const buscaMatch = !busca || nome.includes(busca) || ip.includes(busca) || localidade.includes(busca) || mac.includes(busca);

        // Filtro status
        const status = d.status || '';
        let statusMatch = true;
        if (filtroStatus === 'online') statusMatch = status.includes('ONLINE');
        else if (filtroStatus === 'offline') statusMatch = status.includes('OFFLINE');

        // Filtro tipo
        let tipoMatch = true;
        if (filtroTipo !== 'todos') tipoMatch = d._tipo === filtroTipo;

        return buscaMatch && statusMatch && tipoMatch;
    });

    if (visualizacao === 'lista') renderizarTabela(filtrados);
    else renderizarCards(filtrados);
}

// ========== ALTERNAR VISUALIZAÇÃO ==========
function alternarVisualizacao() {
    visualizacao = visualizacao === 'lista' ? 'cards' : 'lista';
    document.getElementById('btnVisualizacao').textContent = visualizacao === 'lista' ? '🎴 Cards' : '📋 Lista';
    document.getElementById('cabecalhoTabela').style.display = visualizacao === 'cards' ? 'none' : '';
    filtrarMonitoramento();
}

// ========== RENDERIZAR TABELA ==========
function renderizarTabela(dispositivos) {
    document.getElementById('cabecalhoTabela').style.display = '';
    
    const icones = {
        equipamento: '📡',
        servidor: '🖥️',
        energia: '⚡',
        servico: '🔌',
        cliente: '👥'
    };

    let html = '';
    dispositivos.forEach(d => {
        const status = d.status || 'N/A';
        const cls = status.includes('ONLINE') ? 'status-online' : 'status-offline';
        const latencia = d.latencia > 0 ? d.latencia + 'ms' : '-';
        const mac = d.mac ? d.mac.toUpperCase() : '-';
        const local = d.localidade || d.endereco || '-';

        html += `<tr class="border-b border-zinc-800">
            <td>${icones[d._tipo] || '📌'} ${d._tipo}</td>
            <td><a href="http://${d.ip}" target="_blank" class="text-emerald-400 hover:underline">${d.nome || '-'}</a></td>
            <td>${d.ip || '-'}</td>
            <td>${local}</td>
            <td class="text-xs">${mac}</td>
            <td class="${cls}">${status}</td>
            <td>${latencia}</td>
        </tr>`;
    });

    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="7" class="text-center text-zinc-500 py-4">Nenhum dispositivo encontrado</td></tr>';
}

// ========== RENDERIZAR CARDS ==========
function renderizarCards(dispositivos) {
    document.getElementById('cabecalhoTabela').style.display = 'none';

    const icones = {
        equipamento: '📡',
        servidor: '🖥️',
        energia: '⚡',
        servico: '🔌',
        cliente: '👥'
    };

    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">';
    dispositivos.forEach(d => {
        const status = d.status || 'N/A';
        const cls = status.includes('ONLINE') ? 'text-emerald-400' : 'text-red-400';
        const iconeStatus = status.includes('ONLINE') ? '🟢' : '🔴';
        const latencia = d.latencia > 0 ? d.latencia + 'ms' : '-';
        const local = d.localidade || d.endereco || '-';
        const mac = d.mac ? d.mac.toUpperCase() : '-';

        html += `<div class="bg-zinc-800 p-2 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all">
            <div class="flex justify-between items-start mb-1">
                <span class="text-xs text-zinc-400">${icones[d._tipo] || '📌'} ${d._tipo}</span>
                <span class="${cls} text-xs font-bold ml-1">${iconeStatus}</span>
            </div>
            <a href="http://${d.ip}" target="_blank" class="text-emerald-400 hover:underline font-bold text-xs truncate block">${d.nome || '-'}</a>
            <div class="text-zinc-500 text-xs space-y-0.5 mt-1">
                <div>🌐 ${d.ip || '-'}</div>
                <div>📍 ${local}</div>
                ${mac !== '-' ? `<div>🔧 ${mac}</div>` : ''}
                <div>⏱️ ${latencia}</div>
            </div>
        </div>`;
    });
    html += '</div>';
    document.getElementById('corpoTabela').innerHTML = html || '<p class="text-center text-zinc-500 py-4">Nenhum dispositivo encontrado</p>';
}