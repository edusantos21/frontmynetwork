// js/permissoes.js
// ============================================================
// SISTEMA DE PERMISSÕES GRANULARES (POR EMPRESA)
// ============================================================

const PERMISSOES_PADRAO = {
    dashboard:     { ver: true,  adicionar: false, editar: false, excluir: false },
    monitoramento: { ver: true,  adicionar: false, editar: false, excluir: false },
    equipamentos:  { ver: true,  adicionar: false, editar: false, excluir: false },
    clientes:      { ver: true,  adicionar: false, editar: false, excluir: false },
    servidores:    { ver: true,  adicionar: false, editar: false, excluir: false },
    energias:      { ver: true,  adicionar: false, editar: false, excluir: false },
    servicos:      { ver: true,  adicionar: false, editar: false, excluir: false },
    localidades:   { ver: true,  adicionar: false, editar: false, excluir: false },
    configuracoes: { ver: true,  adicionar: false, editar: false, excluir: false },
    vinculados:    { ver: false, adicionar: false, editar: false, excluir: false },
    solicitacoes:  { ver: false, adicionar: false, editar: false, excluir: false },
    grupos:        { ver: false, adicionar: false, editar: false, excluir: false }
};

const PERMISSOES_ADMIN = {
    dashboard:     { ver: true, adicionar: true, editar: true, excluir: true },
    monitoramento: { ver: true, adicionar: true, editar: true, excluir: true },
    equipamentos:  { ver: true, adicionar: true, editar: true, excluir: true },
    clientes:      { ver: true, adicionar: true, editar: true, excluir: true },
    servidores:    { ver: true, adicionar: true, editar: true, excluir: true },
    energias:      { ver: true, adicionar: true, editar: true, excluir: true },
    servicos:      { ver: true, adicionar: true, editar: true, excluir: true },
    localidades:   { ver: true, adicionar: true, editar: true, excluir: true },
    configuracoes: { ver: true, adicionar: true, editar: true, excluir: true },
    vinculados:    { ver: true, adicionar: true, editar: true, excluir: true },
    solicitacoes:  { ver: true, adicionar: true, editar: true, excluir: true },
    grupos:        { ver: true, adicionar: true, editar: true, excluir: true }
};

let _permissoesUsuario = null;
let _isAdmin = false;
let _abasVisiveis = null;

// ============================================================
// CARREGAR PERMISSÕES DO USUÁRIO LOGADO (PARA A EMPRESA SELECIONADA)
// ============================================================
async function carregarPermissoes() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const empresaId = (typeof empresaSelecionada !== 'undefined' && empresaSelecionada)
        ? empresaSelecionada.id
        : null;

    if (!empresaId) {
        _isAdmin = false;
        _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_PADRAO));
        _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);
        return;
    }

    try {
        const vinculos = await firebase.firestore().collection('vinculos')
            .where('userId', '==', user.uid)
            .where('empresaId', '==', empresaId)
            .where('status', '==', 'aprovado')
            .limit(1)
            .get();

        if (vinculos.empty) {
            _isAdmin = false;
            _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_PADRAO));
            _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);
            return;
        }

        const vinculo = vinculos.docs[0].data();
        _isAdmin = vinculo.role === 'admin';

        if (_isAdmin) {
            _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_ADMIN));
        } else {
            _permissoesUsuario = mesclarPermissoes(vinculo.permissoes || {});
        }

        _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);

    } catch (e) {
        console.error('❌ Erro ao carregar permissões:', e);
        _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_PADRAO));
        _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);
    }
}

function mesclarPermissoes(custom) {
    let resultado = JSON.parse(JSON.stringify(PERMISSOES_PADRAO));
    Object.keys(custom).forEach(modulo => {
        if (resultado[modulo]) {
            resultado[modulo] = {
                ver:       custom[modulo].ver       === true,
                adicionar: custom[modulo].adicionar === true,
                editar:    custom[modulo].editar    === true,
                excluir:   custom[modulo].excluir   === true
            };
        }
    });
    return resultado;
}

function gerarAbasVisiveis(permissoes) {
    let abas = {};
    Object.keys(permissoes).forEach(modulo => {
        abas[modulo] = permissoes[modulo].ver === true;
    });
    return abas;
}

// ============================================================
// API PÚBLICA
// ============================================================
function pode(modulo, acao) {
    if (!_permissoesUsuario) return false;
    if (!_permissoesUsuario[modulo]) return false;
    return _permissoesUsuario[modulo][acao] === true;
}

function ehAdmin() {
    return _isAdmin === true;
}

function abaVisivel(modulo) {
    if (!_abasVisiveis) return false;
    return _abasVisiveis[modulo] === true;
}

function getAbasVisiveis() {
    return _abasVisiveis || {};
}

function primeiraAbaVisivel() {
    const ordem = ['dashboard', 'monitoramento', 'equipamentos', 'clientes', 'servidores', 'energias', 'servicos', 'localidades', 'configuracoes', 'vinculados', 'solicitacoes', 'grupos'];
    for (let m of ordem) {
        if (abaVisivel(m)) return m;
    }
    return null;
}

function aplicarPermissoesNoDOM() {
    document.querySelectorAll('[data-perm]').forEach(el => {
        const [modulo, acao] = el.getAttribute('data-perm').split(':');
        if (!pode(modulo, acao)) {
            el.style.display = 'none';
        } else {
            el.style.display = '';
        }
    });
}

/**
 * ✅ Aplica visibilidade dos GRUPOS "Usuários" e "Equipamentos"
 * Regra:
 *  - Pai aparece se PELO MENOS 1 filho tiver ver: true
 *  - Cada filho aparece/esconde individualmente
 */
function aplicarMenuGrupos() {
    // ---------- GRUPO USUÁRIOS ----------
    let btnU = document.getElementById('btnGrupoUsuarios');
    let subU = document.getElementById('submenuUsuarios');

    let filhosU = [
        { id: 'menuVinculados',   modulo: 'vinculados'   },
        { id: 'menuSolicitacoes', modulo: 'solicitacoes' },
        { id: 'menuGrupos',       modulo: 'grupos'       }
    ];

    let algumFilhoU = false;
    filhosU.forEach(f => {
        let el = document.getElementById(f.id);
        if (!el) return;
        let visivel = abaVisivel(f.modulo);
        el.style.display = visivel ? '' : 'none';
        if (visivel) algumFilhoU = true;
    });
    if (btnU) btnU.style.display = algumFilhoU ? '' : 'none';
    if (subU) subU.style.display = algumFilhoU ? '' : 'none';

    // ---------- GRUPO EQUIPAMENTOS ----------
    let btnE = document.getElementById('btnGrupoEquipamentos');
    let subE = document.getElementById('submenuEquipamentos');

    let filhosE = [
        { id: 'menuEquipamentos', modulo: 'equipamentos' },
        { id: 'menuClientes',     modulo: 'clientes'     },
        { id: 'menuServidores',   modulo: 'servidores'   },
        { id: 'menuEnergias',     modulo: 'energias'     },
        { id: 'menuServicos',     modulo: 'servicos'     },
        { id: 'menuLocalidades',  modulo: 'localidades'  }
    ];

    let algumFilhoE = false;
    filhosE.forEach(f => {
        let el = document.getElementById(f.id);
        if (!el) return;
        let visivel = abaVisivel(f.modulo);
        el.style.display = visivel ? '' : 'none';
        if (visivel) algumFilhoE = true;
    });
    if (btnE) btnE.style.display = algumFilhoE ? '' : 'none';
    if (subE) subE.style.display = algumFilhoE ? '' : 'none';
}

// Mantém compatibilidade com chamadas antigas
function aplicarMenuUsuarios() {
    aplicarMenuGrupos();
}

// ============================================================
// CACHE — APLICA VISIBILIDADE DOS MENUS IMEDIATAMENTE (SEM FLASH)
// ============================================================
function aplicarMenuUsuariosCache() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const empresaId = (typeof empresaSelecionada !== 'undefined' && empresaSelecionada)
        ? empresaSelecionada.id
        : null;
    if (!empresaId) return;

    const cacheKey = `perm_view_${user.uid}_${empresaId}`;
    const cacheRaw = sessionStorage.getItem(cacheKey);
    if (!cacheRaw) return;

    try {
        const cached = JSON.parse(cacheRaw);
        const abas = gerarAbasVisiveis(cached.permissoes);

        // ---------- GRUPO USUÁRIOS ----------
        let btnU = document.getElementById('btnGrupoUsuarios');
        let subU = document.getElementById('submenuUsuarios');

        let filhosU = [
            { id: 'menuVinculados',   modulo: 'vinculados'   },
            { id: 'menuSolicitacoes', modulo: 'solicitacoes' },
            { id: 'menuGrupos',       modulo: 'grupos'       }
        ];

        let algumU = false;
        filhosU.forEach(f => {
            let el = document.getElementById(f.id);
            if (!el) return;
            let visivel = abas[f.modulo] === true;
            el.style.display = visivel ? '' : 'none';
            if (visivel) algumU = true;
        });
        if (btnU) btnU.style.display = algumU ? '' : 'none';
        if (subU) subU.style.display = algumU ? '' : 'none';

        // ---------- GRUPO EQUIPAMENTOS ----------
        let btnE = document.getElementById('btnGrupoEquipamentos');
        let subE = document.getElementById('submenuEquipamentos');

        let filhosE = [
            { id: 'menuEquipamentos', modulo: 'equipamentos' },
            { id: 'menuClientes',     modulo: 'clientes'     },
            { id: 'menuServidores',   modulo: 'servidores'   },
            { id: 'menuEnergias',     modulo: 'energias'     },
            { id: 'menuServicos',     modulo: 'servicos'     },
            { id: 'menuLocalidades',  modulo: 'localidades'  }
        ];

        let algumE = false;
        filhosE.forEach(f => {
            let el = document.getElementById(f.id);
            if (!el) return;
            let visivel = abas[f.modulo] === true;
            el.style.display = visivel ? '' : 'none';
            if (visivel) algumE = true;
        });
        if (btnE) btnE.style.display = algumE ? '' : 'none';
        if (subE) subE.style.display = algumE ? '' : 'none';
    } catch (e) { /* ignora */ }
}

// ============================================================
// LISTENER EM TEMPO REAL (onSnapshot)
// ============================================================
let _unsubscribePermissoes = null;

function iniciarListenerPermissoes() {
    if (_unsubscribePermissoes) {
        _unsubscribePermissoes();
        _unsubscribePermissoes = null;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const empresaId = (typeof empresaSelecionada !== 'undefined' && empresaSelecionada)
        ? empresaSelecionada.id
        : null;

    if (!empresaId) return;

    const cacheKey = `perm_view_${user.uid}_${empresaId}`;
    const cacheRaw = sessionStorage.getItem(cacheKey);
    if (cacheRaw) {
        try {
            const cached = JSON.parse(cacheRaw);
            _isAdmin = cached.isAdmin || false;
            _permissoesUsuario = cached.permissoes;
            _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);

            if (typeof aplicarPermissoesNoDOM === 'function') aplicarPermissoesNoDOM();
            if (typeof aplicarMenuGrupos === 'function') aplicarMenuGrupos();
        } catch (e) { /* ignora */ }
    }

    _unsubscribePermissoes = firebase.firestore().collection('vinculos')
        .where('userId', '==', user.uid)
        .where('empresaId', '==', empresaId)
        .where('status', '==', 'aprovado')
        .limit(1)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                _isAdmin = false;
                _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_PADRAO));
                _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);
            } else {
                const vinculo = snapshot.docs[0].data();
                _isAdmin = vinculo.role === 'admin';

                if (_isAdmin) {
                    _permissoesUsuario = JSON.parse(JSON.stringify(PERMISSOES_ADMIN));
                } else {
                    _permissoesUsuario = mesclarPermissoes(vinculo.permissoes || {});
                }

                _abasVisiveis = gerarAbasVisiveis(_permissoesUsuario);
            }

            sessionStorage.setItem(cacheKey, JSON.stringify({
                isAdmin: _isAdmin,
                permissoes: _permissoesUsuario
            }));

            if (typeof aplicarPermissoesNoDOM === 'function') aplicarPermissoesNoDOM();
            if (typeof aplicarMenuGrupos === 'function') aplicarMenuGrupos();
        });
}

function pararListenerPermissoes() {
    if (_unsubscribePermissoes) {
        _unsubscribePermissoes();
        _unsubscribePermissoes = null;
    }
}

// ============================================================
// LIMPAR CACHE (ao mudar permissões)
// ============================================================
function limparCachePermissoes() {
    Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('perm_view_')) sessionStorage.removeItem(k);
    });
}