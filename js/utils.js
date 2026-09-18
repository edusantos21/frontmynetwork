// js/utils.js - COMPLETO FINAL (COM SUBMENUS EQUIPAMENTOS E USUÁRIOS)
// ========== FORÇAR URL DO TÚNEL EM TODAS AS REQUISIÇÕES ==========
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    let url = typeof args[0] === 'string' ? args[0] : args[0].url;

    if (url.includes('firestore') || url.includes('firebase') || url.includes('googleapis')) {
        return originalFetch.apply(this, args);
    }

    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        throw new Error('Localhost não disponível');
    }

    try {
        let response = await originalFetch.apply(this, args);
        return response;
    } catch(e) {
        throw e;
    }
};

// ========== RELÓGIO ==========
function iniciarRelogio() {
    function atualizar() {
        let agora = new Date();
        let h = String(agora.getHours()).padStart(2, '0');
        let m = String(agora.getMinutes()).padStart(2, '0');
        let s = String(agora.getSeconds()).padStart(2, '0');
        let el = document.getElementById('relogio');
        if (el) el.textContent = `${h}:${m}:${s}`;
    }
    atualizar();
    setInterval(atualizar, 1000);
}

// ========== DATA ==========
function atualizarData() {
    let el = document.getElementById('dataHoje');
    if (el) {
        let agora = new Date();
        el.textContent = agora.toLocaleDateString('pt-BR');
    }
}

// ========== URL DO TÚNEL ==========
let urlTunelCache = null;
let urlTunelTimestamp = 0;
const CACHE_TUNEL_MS = 5 * 60 * 1000;

async function buscarUrlTunel() {
    if (empresaSelecionada) {
        if (empresaSelecionada.url_tunel && empresaSelecionada.url_tunel.trim() !== '') {
            urlTunelCache = empresaSelecionada.url_tunel;
            urlTunelTimestamp = Date.now();
            return urlTunelCache;
        }
        return null;
    }

    if (urlTunelCache && (Date.now() - urlTunelTimestamp) < CACHE_TUNEL_MS) {
        return urlTunelCache;
    }

    let user = firebase.auth().currentUser;
    if (!user) {
        return null;
    }

    try {
        let vinculos = await firebase.firestore().collection('vinculos')
            .where('userId', '==', user.uid)
            .where('status', '==', 'aprovado')
            .limit(1).get();

        if (!vinculos.empty) {
            let v = vinculos.docs[0].data();
            let empDoc = await firebase.firestore().collection('empresas').doc(v.empresaId).get();
            if (empDoc.exists && empDoc.data().url_tunel) {
                urlTunelCache = empDoc.data().url_tunel;
                urlTunelTimestamp = Date.now();
                return urlTunelCache;
            }
        }

        let doc = await firebase.firestore().collection('usuarios').doc(user.uid).get();
        if (doc.exists && doc.data().url_tunel) {
            urlTunelCache = doc.data().url_tunel;
            urlTunelTimestamp = Date.now();
            return urlTunelCache;
        }
    } catch (e) {
        console.error('❌ Erro ao buscar URL:', e);
    }

    return null;
}

async function obterUrlAtual() {
    if (empresaSelecionada) {
        return (empresaSelecionada.url_tunel && empresaSelecionada.url_tunel.trim() !== '')
            ? empresaSelecionada.url_tunel
            : null;
    }
    return await buscarUrlTunel();
}

// ========== STATUS DO SERVIDOR ==========
function atualizarStatusServidor(status, segundos = 0) {
    let el = document.getElementById('statusServidor');
    if (!el) return;
    if (status === 'online') {
        el.textContent = '🟢 Online';
        el.className = 'text-emerald-400';
    } else if (status === 'offline') {
        el.textContent = '🔴 Offline';
        el.className = 'text-red-400';
    } else if (status === 'reconectando') {
        el.textContent = `🔄 Reconectando em ${segundos}s`;
        el.className = 'text-yellow-400';
    } else if (status === 'esgotado') {
        el.textContent = '⛔ Backend offline';
        el.className = 'text-red-600';
    }
}

// ========== VARIÁVEIS GLOBAIS DE CONTROLE DE CARGA ==========
let timerRefresh = null;
let timerReconexao = null;
let timerContador = null;
let verificandoStatus = false;
let tentativasReconexao = 0;
const MAX_TENTATIVAS = 5;
let intervaloAtual = localStorage.getItem('intervalo') ? parseInt(localStorage.getItem('intervalo')) : 10000;

let geracaoAtual = 0;

function pararTudo() {
    pararRefreshGlobal();
    if (timerReconexao) { clearTimeout(timerReconexao); timerReconexao = null; }
    if (timerContador) { clearInterval(timerContador); timerContador = null; }
}

function iniciarPrimeiraCarga(callback) {
    pararTudo();
    const minhaGeracao = ++geracaoAtual;
    tentativasReconexao = 0;
    console.log('🚀 [CICLO NOVO] Iniciando primeira carga...');

    callback().then(() => {
        if (minhaGeracao !== geracaoAtual) return;
        console.log('✅ [CICLO NOVO] Carga OK');
        tentativasReconexao = 0;
        atualizarStatusServidor('online');
        iniciarRefreshGlobal(callback, minhaGeracao);
    }).catch((e) => {
        if (minhaGeracao !== geracaoAtual) return;
        console.log('❌ [CICLO NOVO] Carga falhou:', e.message);
        atualizarStatusServidor('offline');
        iniciarReconexaoGlobal(callback, minhaGeracao);
    });
}

function iniciarRefreshGlobal(callback, minhaGeracao) {
    pararRefreshGlobal();
    if (minhaGeracao === undefined) minhaGeracao = geracaoAtual;

    timerRefresh = setInterval(async () => {
        if (minhaGeracao !== geracaoAtual) { pararRefreshGlobal(); return; }
        if (verificandoStatus) return;
        verificandoStatus = true;
        try {
            await callback();
            if (minhaGeracao !== geracaoAtual) return;
            tentativasReconexao = 0;
            atualizarStatusServidor('online');
        } catch (e) {
            if (minhaGeracao !== geracaoAtual) return;
            pararRefreshGlobal();
            iniciarReconexaoGlobal(callback, minhaGeracao);
        } finally {
            verificandoStatus = false;
        }
    }, intervaloAtual);
}

function pararRefreshGlobal() {
    if (timerRefresh) { clearInterval(timerRefresh); timerRefresh = null; }
}

function iniciarReconexaoGlobal(callback, minhaGeracao) {
    if (minhaGeracao === undefined) minhaGeracao = ++geracaoAtual;

    if (timerReconexao) { clearTimeout(timerReconexao); timerReconexao = null; }
    if (timerContador) { clearInterval(timerContador); timerContador = null; }

    tentativasReconexao++;

    if (tentativasReconexao > MAX_TENTATIVAS) {
        console.log('⛔ [RECONEXÃO] 5 tentativas esgotadas. Backend offline.');
        atualizarStatusServidor('esgotado');
        tentativasReconexao = 0;
        return;
    }

    let segundos = 10;
    console.log(`🔄 [RECONEXÃO] Tentativa ${tentativasReconexao}/${MAX_TENTATIVAS}`);
    atualizarStatusServidor('reconectando', segundos);

    timerContador = setInterval(() => {
        if (minhaGeracao !== geracaoAtual) {
            clearInterval(timerContador);
            timerContador = null;
            return;
        }
        segundos--;
        if (segundos > 0) {
            atualizarStatusServidor('reconectando', segundos);
        }
    }, 1000);

    timerReconexao = setTimeout(async () => {
        if (timerContador) { clearInterval(timerContador); timerContador = null; }
        timerReconexao = null;

        if (minhaGeracao !== geracaoAtual) return;
        if (verificandoStatus) return;
        verificandoStatus = true;

        try {
            urlTunelCache = null;
            urlTunelTimestamp = 0;
            
            let urlAtual = await obterUrlAtual();
            console.log(`🔍 [RECONEXÃO] Fetch em: ${urlAtual}`);
            await callback();

            if (minhaGeracao !== geracaoAtual) { verificandoStatus = false; return; }

            console.log('✅ [RECONEXÃO] Reconectado!');
            tentativasReconexao = 0;
            atualizarStatusServidor('online');
            verificandoStatus = false;
            iniciarRefreshGlobal(callback, minhaGeracao);
        } catch (e) {
            verificandoStatus = false;
            if (minhaGeracao !== geracaoAtual) return;
            console.log(`❌ [RECONEXÃO] Falhou (#${tentativasReconexao})`);
            iniciarReconexaoGlobal(callback, minhaGeracao);
        }
    }, 10000);
}

// ============================================================
// SELETOR DE EMPRESAS
// ============================================================
let empresasVinculadas = [];
let empresaSelecionada = null;
let unsubscribeEmpresas = null;
let unsubscribeEmpresaAtual = null;
let carregandoEmpresas = false;
let empresasCacheTimestamp = 0;
const CACHE_EMPRESAS_MS = 5 * 60 * 1000;
let debounceListenerTimer = null;
const DEBOUNCE_LISTENER_MS = 2000;

async function carregarEmpresasSeletor() {
    if (carregandoEmpresas) return;

    if (empresasVinculadas.length > 0 && (Date.now() - empresasCacheTimestamp) < CACHE_EMPRESAS_MS) {
        return;
    }

    carregandoEmpresas = true;

    let user = firebase.auth().currentUser;
    if (!user) { carregandoEmpresas = false; return; }

    try {
        empresasVinculadas = [];
        let idsAdicionados = new Set();

        let vinculos = await firebase.firestore().collection('vinculos')
            .where('userId', '==', user.uid)
            .where('status', '==', 'aprovado')
            .get();

        for (let doc of vinculos.docs) {
            let v = doc.data();
            if (!idsAdicionados.has(v.empresaId)) {
                let empDoc = await firebase.firestore().collection('empresas').doc(v.empresaId).get();
                if (empDoc.exists && empDoc.data().nome) {
                    empresasVinculadas.push({
                        id: empDoc.id,
                        nome: empDoc.data().nome,
                        url_tunel: empDoc.data().url_tunel || ''
                    });
                    idsAdicionados.add(v.empresaId);
                }
            }
        }

        let savedId = localStorage.getItem('empresaSelecionada');
        if (savedId && empresasVinculadas.find(e => e.id === savedId)) {
            empresaSelecionada = empresasVinculadas.find(e => e.id === savedId);
        } else if (empresasVinculadas.length > 0) {
            empresaSelecionada = empresasVinculadas[0];
            localStorage.setItem('empresaSelecionada', empresaSelecionada.id);
        } else {
            empresaSelecionada = null;
        }

        empresasCacheTimestamp = Date.now();
        atualizarSeletorUI();
    } catch(e) {
        console.error('Erro ao carregar empresas:', e);
    } finally {
        carregandoEmpresas = false;
    }
}

function iniciarListenerEmpresas() {
    let user = firebase.auth().currentUser;
    if (!user) return;

    if (unsubscribeEmpresas) unsubscribeEmpresas();

    unsubscribeEmpresas = firebase.firestore().collection('vinculos')
        .where('userId', '==', user.uid)
        .where('status', '==', 'aprovado')
        .onSnapshot(() => { carregarEmpresasSeletor(); });

    escutarEmpresaAtual();
}

function escutarEmpresaAtual() {
    if (unsubscribeEmpresaAtual) { unsubscribeEmpresaAtual(); unsubscribeEmpresaAtual = null; }
    if (!empresaSelecionada || !empresaSelecionada.id) return;

    unsubscribeEmpresaAtual = firebase.firestore().collection('empresas').doc(empresaSelecionada.id)
        .onSnapshot(doc => {
            if (!doc.exists || !empresaSelecionada) return;

            let novaUrl = doc.data().url_tunel || '';
            if (novaUrl === empresaSelecionada.url_tunel) return;

            console.log('🔁 [LISTENER] URL atualizada!', empresaSelecionada.url_tunel, '➡️', novaUrl);
            empresaSelecionada.url_tunel = novaUrl;
            
            urlTunelCache = novaUrl || null;
            urlTunelTimestamp = Date.now();
            
            if (debounceListenerTimer) clearTimeout(debounceListenerTimer);
            
            let callback = getCallback();
            if (callback) {
                console.log('🔄 [LISTENER] Reiniciando carga com nova URL');
                iniciarPrimeiraCarga(callback);
            }
        });
}

function getCallback() {
    if (typeof carregarDashboard === 'function') return carregarDashboard;
    if (typeof carregarClientes === 'function') return carregarClientes;
    if (typeof carregarEquipamentos === 'function') return carregarEquipamentos;
    if (typeof carregarMonitoramento === 'function') return carregarMonitoramento;
    if (typeof carregar === 'function') return carregar;
    return null;
}

function atualizarSeletorUI() {
    let nomeEl = document.getElementById('nomeEmpresaAtual');
    let dropdown = document.getElementById('listaEmpresasDropdown');
    if (!nomeEl || !dropdown) return;

    nomeEl.textContent = empresaSelecionada ? empresaSelecionada.nome : 'Sem empresa';
    dropdown.innerHTML = '';

    empresasVinculadas.forEach(emp => {
        let ativa = empresaSelecionada && emp.id === empresaSelecionada.id;
        let div = document.createElement('div');
        div.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors ${ativa ? 'bg-emerald-600/10 border border-emerald-500/20' : ''}`;
        div.innerHTML = `<span class="text-white text-xs font-medium">🏢 ${emp.nome}</span>${ativa ? '<span class="text-emerald-400 text-xs">✅</span>' : ''}`;
        div.onclick = () => selecionarEmpresa(emp);
        dropdown.appendChild(div);
    });
}

function toggleDropdownEmpresas() {
    let dropdown = document.getElementById('dropdownEmpresas');
    let seta = document.getElementById('setaDropdown');
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        seta.style.transform = 'rotate(180deg)';
    } else {
        dropdown.classList.add('hidden');
        seta.style.transform = 'rotate(0deg)';
    }
}

function selecionarEmpresa(emp) {
    empresaSelecionada = emp;
    localStorage.setItem('empresaSelecionada', emp.id);

    urlTunelCache = emp.url_tunel && emp.url_tunel.trim() !== '' ? emp.url_tunel : null;
    urlTunelTimestamp = Date.now();

    if (debounceListenerTimer) { clearTimeout(debounceListenerTimer); debounceListenerTimer = null; }
    escutarEmpresaAtual();

    atualizarSeletorUI();
    document.getElementById('dropdownEmpresas').classList.add('hidden');
    document.getElementById('setaDropdown').style.transform = 'rotate(0deg)';

    // ✅ FECHA O LISTENER ANTIGO E ABRE UM NOVO PRA NOVA EMPRESA
    if (typeof pararListenerPermissoes === 'function') pararListenerPermissoes();
    if (typeof iniciarListenerPermissoes === 'function') iniciarListenerPermissoes();

    let callback = getCallback();
    if (callback) {
        pararTudo();

        if (typeof carregarDashboard === 'function') {
            ['dashOnline','dashOffline','dashEquip','dashServ','dashEnergia','dashClientes'].forEach(id => { let el = document.getElementById(id); if (el) el.textContent = '0'; });
            ['tabelaP2P','tabelaPaineis','tabelaServidores','tabelaEnergias','tabelaServicos','tabelaClientes'].forEach(id => { let el = document.getElementById(id); if (el) el.innerHTML = ''; });
            ['qtdP2P','qtdPaineis','qtdServidores','qtdEnergias','qtdServicos','qtdClientes'].forEach(id => { let el = document.getElementById(id); if (el) el.textContent = '(0)'; });
            ['cardP2P','cardPaineis','cardServidores','cardEnergias','cardServicos','cardClientes'].forEach(id => { let el = document.getElementById(id); if (el) el.style.display = 'none'; });
            if (typeof graficoPizza !== 'undefined' && graficoPizza) {
                graficoPizza.data.datasets[0].data = [0, 0];
                graficoPizza.update();
            }
        } else {
            let el = document.getElementById('corpoTabela');
            if (el) el.innerHTML = '';
        }

        setTimeout(() => { iniciarPrimeiraCarga(callback); }, 500);
    }
}

document.addEventListener('click', function(e) {
    let btn = document.getElementById('btnSeletorEmpresa');
    let dropdown = document.getElementById('dropdownEmpresas');
    if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
        let seta = document.getElementById('setaDropdown');
        if (seta) seta.style.transform = 'rotate(0deg)';
    }
});

// ============================================================
// SUBMENU EQUIPAMENTOS
// ============================================================
function toggleSubmenuEquipamentos() {
    let sub = document.getElementById('submenuEquipamentos');
    let seta = document.getElementById('setaEquipamentos');
    if (!sub) return;

    if (sub.classList.contains('hidden')) {
        sub.classList.remove('hidden');
        if (seta) seta.style.transform = 'rotate(90deg)';
        sessionStorage.setItem('submenuEquipamentosAberto', 'true');
    } else {
        sub.classList.add('hidden');
        if (seta) seta.style.transform = 'rotate(0deg)';
        sessionStorage.setItem('submenuEquipamentosAberto', 'false');
    }
}

// ============================================================
// SUBMENU USUÁRIOS
// ============================================================
function toggleSubmenuUsuarios() {
    let sub = document.getElementById('submenuUsuarios');
    let seta = document.getElementById('setaUsuarios');
    if (!sub) return;

    if (sub.classList.contains('hidden')) {
        sub.classList.remove('hidden');
        if (seta) seta.style.transform = 'rotate(90deg)';
        sessionStorage.setItem('submenuUsuariosAberto', 'true');
    } else {
        sub.classList.add('hidden');
        if (seta) seta.style.transform = 'rotate(0deg)';
        sessionStorage.setItem('submenuUsuariosAberto', 'false');
    }
}

// ============================================================
// CACHE DO ESTADO DO MENU
// ============================================================
function salvarEstadoMenu() {
    let menuUsuarios = document.getElementById('menuUsuarios');
    if (menuUsuarios) {
        const visivel = menuUsuarios.style.display !== 'none';
        sessionStorage.setItem('menuUsuariosVisivel', visivel ? 'true' : 'false');
    }

    let sub = document.getElementById('submenuEquipamentos');
    if (sub) {
        sessionStorage.setItem('submenuEquipamentosAberto', sub.classList.contains('hidden') ? 'false' : 'true');
    }

    let subU = document.getElementById('submenuUsuarios');
    if (subU) {
        sessionStorage.setItem('submenuUsuariosAberto', subU.classList.contains('hidden') ? 'false' : 'true');
    }
}

function aplicarEstadoMenuCache() {
    const visivel = sessionStorage.getItem('menuUsuariosVisivel');
    if (visivel === 'true') {
        let el = document.getElementById('menuUsuarios');
        if (el) el.style.display = '';
    }

    const subAberto = sessionStorage.getItem('submenuEquipamentosAberto');
    if (subAberto === 'true') {
        let sub = document.getElementById('submenuEquipamentos');
        let seta = document.getElementById('setaEquipamentos');
        if (sub) {
            sub.classList.remove('hidden');
            if (seta) seta.style.transform = 'rotate(90deg)';
        }
    }

    const subUAberto = sessionStorage.getItem('submenuUsuariosAberto');
    if (subUAberto === 'true') {
        let subU = document.getElementById('submenuUsuarios');
        let setaU = document.getElementById('setaUsuarios');
        if (subU) {
            subU.classList.remove('hidden');
            if (setaU) setaU.style.transform = 'rotate(90deg)';
        }
    }
}

// ========== INICIALIZAÇÃO AUTOMÁTICA ==========
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        // ✅ SALVA O UID NO LOCALSTORAGE (pra usar no script inline)
        localStorage.setItem('auth_uid', user.uid);

        // ✅ APLICA CACHE DO MENU IMEDIATAMENTE (zero flash)
        aplicarEstadoMenuCache();

        // ✅ CARREGA EMPRESAS PRIMEIRO
        await carregarEmpresasSeletor();

        // ✅ ESPERA A EMPRESA ESTAR DEFINIDA
        let tentativasEmpresa = 0;
        while (!empresaSelecionada && tentativasEmpresa < 30) {
            await new Promise(r => setTimeout(r, 100));
            tentativasEmpresa++;
        }

        // ✅ APLICA CACHE DO MENU DE NOVO (agora com empresa)
        aplicarEstadoMenuCache();

        // ✅ ABRE LISTENER EM TEMPO REAL
        if (typeof iniciarListenerPermissoes === 'function') {
            iniciarListenerPermissoes();
        } else {
            await carregarPermissoes();
        }

        // ✅ APLICA MENU E PERMISSÕES
        if (typeof aplicarMenuUsuarios === 'function') aplicarMenuUsuarios();
        if (typeof aplicarPermissoesNoDOM === 'function') aplicarPermissoesNoDOM();

        // ✅ SALVA O ESTADO ATUAL DO MENU
        salvarEstadoMenu();

        // ✅ VERIFICA SE PODE ACESSAR ESSA PÁGINA
        if (typeof protegerPaginaAtual === 'function') {
            await protegerPaginaAtual();
        }

        iniciarListenerEmpresas();

        urlTunelCache = null;
        urlTunelTimestamp = 0;
        
        let url = await obterUrlAtual();

        let callback = getCallback();
        if (callback) {
            if (url) {
                setTimeout(() => { iniciarPrimeiraCarga(callback); }, 800);
            } else {
                atualizarStatusServidor('offline');
                iniciarReconexaoGlobal(callback);
            }
        }
    }
});

// ✅ SALVA O ESTADO DO MENU ANTES DE SAIR DA PÁGINA
window.addEventListener('beforeunload', function() {
    salvarEstadoMenu();
});

// ✅ SALVA O ESTADO QUANDO CLICA EM QUALQUER LINK .html
document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href$=".html"]');
    if (link) {
        salvarEstadoMenu();
    }
}, true);

// ========== SAIR ==========
function sair() {
    if (typeof pararListenerPermissoes === 'function') pararListenerPermissoes();

    pararTudo();
    if (debounceListenerTimer) { clearTimeout(debounceListenerTimer); debounceListenerTimer = null; }
    if (unsubscribeEmpresas) { unsubscribeEmpresas(); unsubscribeEmpresas = null; }
    if (unsubscribeEmpresaAtual) { unsubscribeEmpresaAtual(); unsubscribeEmpresaAtual = null; }
    localStorage.removeItem('empresaSelecionada');
    // ✅ LIMPA O UID DO LOCALSTORAGE
    localStorage.removeItem('auth_uid');
    
    urlTunelCache = null;
    urlTunelTimestamp = 0;
    
    firebase.auth().signOut();
    sessionStorage.clear();
    window.location.href = '../index.html';
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    iniciarRelogio();
    atualizarData();

    setInterval(atualizarData, 60000);

    let selectIntervalo = document.getElementById('intervalo');
    if (selectIntervalo) {
        selectIntervalo.addEventListener('change', function() {
            intervaloAtual = parseInt(this.value) * 1000;
            localStorage.setItem('intervalo', intervaloAtual);
        });
    }
});

// ========== MENU MOBILE ==========
function toggleMenu() {
    document.querySelector('aside').classList.toggle('aberto');
    document.getElementById('overlayMenu').classList.toggle('ativo');
}