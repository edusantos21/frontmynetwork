// js/auth-guard.js
// ============================================================
// PROTEÇÃO DE ROTAS POR PERMISSÃO (COM ANTI-LOOP + ESPERA)
// ============================================================

const MAPA_PAGINAS = {
    'dashboard.html':     'dashboard',
    'monitoramento.html': 'monitoramento',
    'equipamentos.html':  'equipamentos',
    'clientes.html':      'clientes',
    'servidores.html':    'servidores',
    'energias.html':      'energias',
    'servicos.html':      'servicos',
    'localidades.html':   'localidades',
    'configuracoes.html': 'configuracoes',
    'vinculados.html':    'vinculados',
    'solicitacoes.html':  'solicitacoes',
    'grupos.html':        'grupos'
};

const GUARD_KEY = '__guard_redirect_';

async function protegerPaginaAtual() {
    const user = firebase.auth().currentUser;
    if (!user) {
        window.location.href = '../index.html';
        return;
    }

    // ✅ ESPERA A EMPRESA SER SELECIONADA (até 3 segundos)
    let tentativas = 0;
    while ((typeof empresaSelecionada === 'undefined' || !empresaSelecionada) && tentativas < 30) {
        await new Promise(r => setTimeout(r, 100));
        tentativas++;
    }

    // ✅ SE NÃO CARREGOU PERMISSÕES AINDA, FORÇA
    if (typeof _permissoesUsuario === 'undefined' || _permissoesUsuario === null) {
        await carregarPermissoes();
    }

    const arquivo = window.location.pathname.split('/').pop();
    const modulo = MAPA_PAGINAS[arquivo];

    if (!modulo) return;

    // ✅ Se PODE ver, libera e limpa flag de loop
    if (pode(modulo, 'ver')) {
        sessionStorage.removeItem(GUARD_KEY);
        return;
    }

    // ❌ NÃO PODE ver → decide pra onde ir
    const destino = primeiraAbaVisivel();

    if (!destino) {
        alert('Você não tem permissão para acessar nenhuma página.');
        firebase.auth().signOut();
        window.location.href = '../index.html';
        return;
    }

    // ✅ Se o destino é a própria página atual, NÃO redireciona
    if (destino + '.html' === arquivo) {
        console.warn('🔁 [GUARD] Destino é a página atual. Liberando pra evitar loop.');
        return;
    }

    // ✅ ANTI-LOOP: se já tentou redirecionar pra esse destino, não tenta de novo
    const ultimoDestino = sessionStorage.getItem(GUARD_KEY);
    if (ultimoDestino === destino) {
        console.warn('🔁 [GUARD] Loop detectado. Liberando página.');
        return;
    }

    sessionStorage.setItem(GUARD_KEY, destino);
    window.location.href = destino + '.html';
}