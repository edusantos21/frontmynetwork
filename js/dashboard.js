// js/dashboard.js - COMPLETO E CORRIGIDO
const auth = firebase.auth();
const db = firebase.firestore();
let apiUrl = '';
let graficoPizza = null;

// ========== AUTENTICAÇÃO ==========
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = '../index.html'; return; }

    document.getElementById('nomeUsuario').textContent = user.displayName || 'Usuário';
    document.getElementById('emailUsuario').textContent = user.email;
    document.getElementById('avatarNome').textContent = (user.displayName || 'U')[0].toUpperCase();

    iniciarRelogio();

    if (typeof iniciarListenerUrlTunel === 'function') {
        iniciarListenerUrlTunel();
    }

    let select = document.getElementById('intervalo');
    let valorSalvo = (intervaloAtual / 1000);
    for (let opt of select.options) {
        if (opt.value == valorSalvo) {
            opt.selected = true;
            break;
        }
    }

    await carregarEmpresasSeletor();
    // Não carrega dados automaticamente - o utils.js chama quando selecionar empresa
});

document.getElementById('intervalo').addEventListener('change', function () {
    intervaloAtual = parseInt(this.value) * 1000;
    localStorage.setItem('intervalo', intervaloAtual);
});

// ========== CARREGAR DADOS (chamado pelo utils.js) ==========
let primeiraCarga = true;

async function carregarDashboard() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL do túnel não encontrada');

    let [respEq, respSrv, respEn, respSv, respCli] = await Promise.all([
        fetch(apiUrl + '/equipamentos'),
        fetch(apiUrl + '/servidores'),
        fetch(apiUrl + '/energias'),
        fetch(apiUrl + '/servicos'),
        fetch(apiUrl + '/clientes')
    ]);

    for (let resp of [respEq, respSrv, respEn, respSv, respCli]) {
        if (!resp.ok) throw new Error('Resposta não-OK do servidor: ' + resp.status);
    }

    let equipamentos = await respEq.json();
    let servidores = await respSrv.json();
    let energias = await respEn.json();
    let servicos = await respSv.json();
    let clientes = await respCli.json();

    let todos = [...equipamentos, ...servidores, ...energias, ...servicos];

    let online = todos.filter(e => e.status && e.status.includes('ONLINE')).length;
    let offline = todos.filter(e => e.status && e.status.includes('OFFLINE')).length;

    document.getElementById('dashOnline').textContent = online;
    document.getElementById('dashOffline').textContent = offline;
    document.getElementById('dashEquip').textContent = equipamentos.length;
    document.getElementById('dashServ').textContent = servidores.length;
    document.getElementById('dashEnergia').textContent = energias.length;
    document.getElementById('dashClientes').textContent = clientes.length;

    atualizarGraficoPizza(online, offline);

    let user = auth.currentUser;
    let doc = await db.collection('usuarios').doc(user.uid).get();
    let pref = doc.exists ? (doc.data().graficos || {}) : {};
    let ordem = doc.exists ? (doc.data().ordem || ['p2p', 'paineis', 'servidores', 'energias']) : ['p2p', 'paineis', 'servidores', 'energias'];

    let cards = {
        'p2p': { element: document.getElementById('cardP2P'), update: () => atualizarTabelaP2P(equipamentos) },
        'paineis': { element: document.getElementById('cardPaineis'), update: () => atualizarTabelaPaineis(equipamentos) },
        'servidores': { element: document.getElementById('cardServidores'), update: () => atualizarTabelaServidores(servidores) },
        'energias': { element: document.getElementById('cardEnergias'), update: () => atualizarTabelaEnergias(energias) },
        'servicos': { element: document.getElementById('cardServicos'), update: () => atualizarTabelaServicos(servicos) },
        'clientes': { element: document.getElementById('cardClientes'), update: () => atualizarTabelaClientes(clientes) }
    };

    if (primeiraCarga) {
        let grid = document.querySelector('.grid-2x2');
        ordem.forEach(key => { if (cards[key]) grid.appendChild(cards[key].element); });
        primeiraCarga = false;
    }

    ordem.forEach(key => {
        if (cards[key]) {
            if (pref[key] !== false) { cards[key].element.style.display = ''; cards[key].update(); }
            else { cards[key].element.style.display = 'none'; }
        }
    });
}

// ========== GRÁFICOS ==========
function atualizarGraficoPizza(online, offline) {
    if (graficoPizza) { graficoPizza.data.datasets[0].data = [online, offline]; graficoPizza.update(); }
    else {
        let ctx = document.getElementById('graficoPizza').getContext('2d');
        graficoPizza = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Online', 'Offline'], datasets: [{ data: [online, offline], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }] },
            options: { cutout: '65%', plugins: { legend: { display: false } } }
        });
    }
}

function atualizarTabelaP2P(equipamentos) {
    let scrollEl = document.getElementById('tabelaP2P').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let aps = equipamentos.filter(e => e.modo_operacao === 'p2p' && e.p2p_tipo === 'ap');
    let html = '';
    aps.forEach(ap => {
        let nome = ap.nome || ap.ip, ip = ap.ip || '', parNome = ap.p2p_par || '-';
        let station = equipamentos.find(e => e.modo_operacao === 'p2p' && e.p2p_tipo === 'station' && (e.nome === parNome || e.ip === parNome));
        let stationNome = station ? station.nome : parNome, stationIp = station ? station.ip : '-';
        let stationUp = station && station.status && station.status.includes('ONLINE');
        let apUp = ap.status && ap.status.includes('ONLINE');
        let apTag = apUp ? '<span class="text-emerald-400 text-xs">UP</span>' : '<span class="text-red-400 text-xs">DOWN</span>';
        let stTag = stationUp ? '<span class="text-emerald-400 text-xs">UP</span>' : '<span class="text-red-400 text-xs">DOWN</span>';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><div>${apTag} - <a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></div><div class="text-zinc-500 text-xs">IP: ${ip}</div></td><td class="text-center text-zinc-600 py-2">→</td><td class="py-2 pr-2 text-right"><div><a href="http://${stationIp}" target="_blank" class="text-blue-400 hover:underline">${stationNome}</a> - ${stTag}</div><div class="text-zinc-500 text-xs">IP: ${stationIp}</div></td></tr>`;
    });
    document.getElementById('qtdP2P').textContent = `(${aps.length})`;
    document.getElementById('tabelaP2P').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}

function atualizarTabelaPaineis(equipamentos) {
    let scrollEl = document.getElementById('tabelaPaineis').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let paineis = equipamentos.filter(e => e.modo_operacao === 'cliente');
    let html = '';
    paineis.forEach(eq => {
        let nome = eq.nome || eq.ip, ip = eq.ip || '', local = eq.localidade || '-', clientes = eq.clientes || 0, latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><div><a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></div><div class="text-zinc-500 text-xs">IP: ${ip}</div></td><td class="text-center text-zinc-600 py-2">→</td><td class="py-2 pr-2 text-right"><div class="text-zinc-300">${local}</div><div class="text-zinc-500 text-xs">${clientes} Clientes | ${latencia}</div></td></tr>`;
    });
    document.getElementById('qtdPaineis').textContent = `(${paineis.length})`;
    document.getElementById('tabelaPaineis').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}

function atualizarTabelaServidores(servidores) {
    let scrollEl = document.getElementById('tabelaServidores').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let html = '';
    servidores.forEach(eq => {
        let nome = eq.nome || eq.ip, ip = eq.ip || '', up = eq.status && eq.status.includes('ONLINE');
        let status = up ? '<span class="text-emerald-400">ONLINE</span>' : '<span class="text-red-400">OFFLINE</span>';
        let latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><div><a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></div><div class="text-zinc-500 text-xs">IP: ${ip}</div></td><td class="py-2 pr-2 text-right"><div>${status}</div><div class="text-zinc-500 text-xs">${latencia}</div></td></tr>`;
    });
    document.getElementById('qtdServidores').textContent = `(${servidores.length})`;
    document.getElementById('tabelaServidores').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}

function atualizarTabelaEnergias(energias) {
    let scrollEl = document.getElementById('tabelaEnergias').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let html = '';
    energias.forEach(eq => {
        let nome = eq.nome || eq.ip, ip = eq.ip || '', up = eq.status && eq.status.includes('ONLINE');
        let status = up ? '<span class="text-emerald-400">ONLINE</span>' : '<span class="text-red-400">OFFLINE</span>';
        let latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><div><a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></div><div class="text-zinc-500 text-xs">IP: ${ip}</div></td><td class="py-2 pr-2 text-right"><div>${status}</div><div class="text-zinc-500 text-xs">${latencia}</div></td></tr>`;
    });
    document.getElementById('qtdEnergias').textContent = `(${energias.length})`;
    document.getElementById('tabelaEnergias').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}

function atualizarTabelaServicos(servicos) {
    let scrollEl = document.getElementById('tabelaServicos').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let html = '';
    servicos.forEach(eq => {
        let nome = eq.nome || eq.ip, ip = eq.ip || '', up = eq.status && eq.status.includes('ONLINE');
        let status = up ? '<span class="text-emerald-400">ONLINE</span>' : '<span class="text-red-400">OFFLINE</span>';
        let latencia = eq.latencia > 0 ? eq.latencia + 'ms' : '-';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><div><a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></div><div class="text-zinc-500 text-xs">IP: ${ip}</div></td><td class="py-2 pr-2 text-right"><div>${status}</div><div class="text-zinc-500 text-xs">${latencia}</div></td></tr>`;
    });
    document.getElementById('qtdServicos').textContent = `(${servicos.length})`;
    document.getElementById('tabelaServicos').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}

function atualizarTabelaClientes(clientes) {
    let scrollEl = document.getElementById('tabelaClientes').parentElement;
    let scrollTop = scrollEl.scrollTop;
    let html = '';
    clientes.forEach(cli => {
        let nome = cli.nome || cli.ip, ip = cli.ip || '';
        let tipo = cli.tipo === 'radio' ? '📡 Rádio' : '🔌 Fibra';
        let up = cli.status && cli.status.includes('ONLINE');
        let status = up ? '<span class="text-emerald-400">ONLINE</span>' : '<span class="text-red-400">OFFLINE</span>';
        let latencia = cli.latencia > 0 ? cli.latencia + 'ms' : '-';
        html += `<tr class="border-b border-zinc-800"><td class="py-2 pl-2"><a href="http://${ip}" target="_blank" class="text-emerald-400 hover:underline">${nome}</a></td><td class="py-2">${ip}</td><td class="py-2 text-center text-xs">${tipo}</td><td class="py-2 pr-2 text-right"><div>${status}</div><div class="text-zinc-500 text-xs">${latencia}</div></td></tr>`;
    });
    document.getElementById('qtdClientes').textContent = `(${clientes.length})`;
    document.getElementById('tabelaClientes').innerHTML = html;
    scrollEl.scrollTop = scrollTop;
}