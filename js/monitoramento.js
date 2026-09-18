// js/monitoramento.js
const auth = firebase.auth();
let apiUrl = '';
let todosDispositivos = [];
let visualizacao = 'lista';
let filtroUrlAplicado = false;

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
    const clientes     = await respCli.json();
    const servidores   = await respSrv.json();
    const energias     = await respEn.json();
    const servicos     = await respSv.json();

    // Padroniza todos os dispositivos
    todosDispositivos = [
        ...equipamentos.map(e => ({ ...e, _tipo: 'equipamento' })),
        ...clientes.map(c     => ({ ...c, _tipo: 'cliente' })),
        ...servidores.map(s   => ({ ...s, _tipo: 'servidor' })),
        ...energias.map(e     => ({ ...e, _tipo: 'energia' })),
        ...servicos.map(s     => ({ ...s, _tipo: 'servico' }))
    ];

    // ✅ Aplica filtro da URL APENAS na primeira carga
    if (!filtroUrlAplicado) {
        const filtroUrl = getFiltroUrl();
        if (filtroUrl !== 'todos') {
            document.getElementById('filtroTipo').value = filtroUrl;
        }
        filtroUrlAplicado = true;
    }

    filtrarMonitoramento();
}

// ========== FILTRAR (COMPLETO - IGUAL EQUIPAMENTOS + TIPOS) ==========
function filtrarMonitoramento() {
    const busca = document.getElementById('buscarMonitoramento').value.toLowerCase();
    const filtro = document.getElementById('filtroTipo').value;

    let filtrados = todosDispositivos.filter(d => {
        // ===== BUSCA =====
        const nome       = (d.nome || '').toLowerCase();
        const ip         = (d.ip || '').toLowerCase();
        const localidade = (d.localidade || d.endereco || '').toLowerCase();
        const mac        = (d.mac || '').toLowerCase();
        const ssid       = (d.ssid || '').toLowerCase();
        const buscaMatch = !busca
            || nome.includes(busca)
            || ip.includes(busca)
            || localidade.includes(busca)
            || mac.includes(busca)
            || ssid.includes(busca);

        // ===== FILTRO =====
        const status = d.status || '';
        let filtroMatch = true;

        switch (filtro) {
            case 'online':
                filtroMatch = status.includes('ONLINE');
                break;
            case 'offline':
                filtroMatch = status.includes('OFFLINE');
                break;

            case 'equipamento':
                filtroMatch = d._tipo === 'equipamento';
                break;
            case 'cliente':
                filtroMatch = d._tipo === 'cliente';
                break;
            case 'servidor':
                filtroMatch = d._tipo === 'servidor';
                break;
            case 'energia':
                filtroMatch = d._tipo === 'energia';
                break;
            case 'servico':
                filtroMatch = d._tipo === 'servico';
                break;

            case 'p2p':
                filtroMatch = d._tipo === 'equipamento' && d.modo_operacao === 'p2p';
                break;
            case 'ap':
                filtroMatch = d._tipo === 'equipamento' && d.modo_operacao === 'p2p' && d.p2p_tipo === 'ap';
                break;
            case 'station':
                filtroMatch = d._tipo === 'equipamento' && d.modo_operacao === 'p2p' && d.p2p_tipo === 'station';
                break;
            case 'painel':
                filtroMatch = d._tipo === 'equipamento' && d.modo_operacao === 'cliente';
                break;

            case 'radio':
                filtroMatch = d._tipo === 'cliente' && d.tipo === 'radio';
                break;
            case 'fibra':
                filtroMatch = d._tipo === 'cliente' && d.tipo === 'fibra';
                break;

            default:
                filtroMatch = true;
        }

        return buscaMatch && filtroMatch;
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

// ========== FIRMWARE DISPLAY ==========
function getFirmwareDisplay(fw) {
    if (fw === 'ubiquiti') return 'Ubiquiti';
    if (fw === 'bullet')   return 'Bullet';
    if (fw === 'mikrotik') return 'MikroTik';
    if (fw === 'mimosa')   return 'Mimosa';
    return fw || 'Ubiquiti';
}

// ========== RENDERIZAR TABELA (IDÊNTICA EQUIPAMENTOS, SEM AÇÕES) ==========
function renderizarTabela(dispositivos) {
    document.getElementById('cabecalhoTabela').style.display = '';

    const icones = {
        equipamento: '📡',
        servidor:    '🖥️',
        energia:     '⚡',
        servico:     '🔌',
        cliente:     '👥'
    };

    let html = '';
    dispositivos.forEach(d => {
        let status   = d.status || 'N/A';
        let cls      = status.includes('ONLINE') ? 'status-online' : 'status-offline';
        let latencia = d.latencia > 0 ? d.latencia + 'ms' : '-';
        let mac      = d.mac ? d.mac.toUpperCase() : '-';
        let ssh      = d.ssh_enabled ? 'Sim' : 'Não';
        let clientes = d.clientes || 0;
        let ssid     = d.ssid ? d.ssid.substring(0, 20) : '-';
        let modo     = d.modo_operacao === 'p2p' ? 'P2P' : 'Cliente';
        let firmware = getFirmwareDisplay(d.firmware);
        let local    = d.localidade || d.endereco || '-';
        let tipoIcone = icones[d._tipo] || '📌';

        html += `<tr class="border-b border-zinc-800">
            <td>${tipoIcone} ${d._tipo}</td>
            <td><a href="http://${d.ip}" target="_blank" class="text-emerald-400 hover:underline">${d.nome || '-'}</a></td>
            <td>${d.ip || '-'}</td>
            <td>${d.porta || '80'}</td>
            <td>${local}</td>
            <td>${modo}</td>
            <td>${firmware}</td>
            <td class="text-xs">${mac}</td>
            <td>${ssh}</td>
            <td>${clientes}</td>
            <td class="text-xs">${ssid}</td>
            <td class="${cls}">${status}</td>
            <td>${latencia}</td>
        </tr>`;
    });

    document.getElementById('corpoTabela').innerHTML = html ||
        '<tr><td colspan="13" class="text-center text-zinc-500 py-4">Nenhum dispositivo encontrado</td></tr>';
}

// ========== RENDERIZAR CARDS ==========
function renderizarCards(dispositivos) {
    document.getElementById('cabecalhoTabela').style.display = 'none';

    const icones = {
        equipamento: '📡',
        servidor:    '🖥️',
        energia:     '⚡',
        servico:     '🔌',
        cliente:     '👥'
    };

    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">';
    dispositivos.forEach(d => {
        let status = d.status || 'N/A', cls = status.includes('ONLINE') ? 'text-emerald-400' : 'text-red-400', icone = status.includes('ONLINE') ? '🟢' : '🔴';
        let latencia = d.latencia > 0 ? d.latencia + 'ms' : '-';
        let local = d.localidade || d.endereco || '-';
        let mac = d.mac ? d.mac.toUpperCase() : '-';

        html += `<div class="bg-zinc-800 p-2 rounded-lg border border-zinc-700">
            <div class="flex justify-between items-start mb-1">
                <span class="text-xs text-zinc-400">${icones[d._tipo] || '📌'} ${d._tipo}</span>
                <span class="${cls} text-xs font-bold ml-1">${icone}</span>
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