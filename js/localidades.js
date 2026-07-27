// js/localidades.js - LIMPO (controle no utils.js)
const auth = firebase.auth();
let apiUrl = '';
let editandoNome = null;
let todasLocalidades = [];
let equipamentos = [];

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

async function carregar() {
    apiUrl = await buscarUrlTunel();
    if (!apiUrl) throw new Error('URL não encontrada');
    let [respLoc, respEq] = await Promise.all([fetch(apiUrl + '/localidades'), fetch(apiUrl + '/equipamentos')]);
    if (!respLoc.ok || !respEq.ok) throw new Error('Erro ao carregar');
    todasLocalidades = await respLoc.json();
    equipamentos = await respEq.json();
    filtrar();
}

function contarEquipamentos(localidade) { return equipamentos.filter(e => e.localidade === localidade).length; }
function contarClientes(localidade) { let total = 0; equipamentos.forEach(e => { if (e.localidade === localidade && e.modo_operacao !== 'p2p') total += e.clientes || 0; }); return total; }

function filtrar() {
    let busca = document.getElementById('buscar').value.toLowerCase();
    let filtradas = todasLocalidades.filter(loc => loc.toLowerCase().includes(busca));
    renderizarTabela(filtradas);
}

function renderizarTabela(localidades) {
    let html = '';
    localidades.forEach(loc => {
        html += `<tr class="border-b border-zinc-800"><td><span class="text-white font-medium">${loc}</span></td><td class="text-center">${contarEquipamentos(loc)}</td><td class="text-center">${contarClientes(loc)}</td><td><button onclick="editar('${loc.replace(/'/g, "\\'")}')" class="text-blue-400 text-xs mr-1">✏️</button><button onclick="excluir('${loc.replace(/'/g, "\\'")}')" class="text-red-400 text-xs">🗑️</button></td></tr>`;
    });
    let semLocal = equipamentos.filter(e => !e.localidade || e.localidade === '').length;
    if (semLocal > 0) html += `<tr class="border-b border-zinc-800 bg-zinc-800/30"><td><span class="text-zinc-400 italic">Sem Localidade</span></td><td class="text-center text-zinc-400">${semLocal}</td><td class="text-center text-zinc-400">-</td><td></td></tr>`;
    document.getElementById('corpoTabela').innerHTML = html || '<tr><td colspan="4" class="text-center text-zinc-500 py-4">Nenhuma localidade</td></tr>';
}

function mostrarFormulario() { editandoNome = null; document.getElementById('tituloModal').textContent = 'Nova Localidade'; document.getElementById('formNome').value = ''; document.getElementById('modal').classList.remove('hidden'); }
function fecharModal() { document.getElementById('modal').classList.add('hidden'); }
async function editar(nome) { editandoNome = nome; document.getElementById('tituloModal').textContent = 'Editar Localidade'; document.getElementById('formNome').value = nome; document.getElementById('modal').classList.remove('hidden'); }

async function salvar() {
    apiUrl = await buscarUrlTunel();
    let msg = document.getElementById('msgForm');
    let nome = document.getElementById('formNome').value.trim();
    if (!nome) { msg.textContent = '⚠️ Nome obrigatório!'; msg.className = 'text-xs mt-2 text-yellow-400'; msg.classList.remove('hidden'); return; }
    try {
        let url = editandoNome ? apiUrl + '/localidade/' + encodeURIComponent(editandoNome) : apiUrl + '/localidade';
        let method = editandoNome ? 'PUT' : 'POST';
        let resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) });
        if (resp.ok) { msg.textContent = '✅ Salvo!'; msg.className = 'text-xs mt-2 text-emerald-400'; msg.classList.remove('hidden'); setTimeout(() => { fecharModal(); carregar(); }, 1000); }
        else { let err = await resp.json(); msg.textContent = '❌ ' + (err.erro || 'Erro'); msg.className = 'text-xs mt-2 text-red-400'; msg.classList.remove('hidden'); }
    } catch(e) { msg.textContent = '❌ Erro'; msg.className = 'text-xs mt-2 text-red-400'; msg.classList.remove('hidden'); }
}

async function excluir(nome) {
    if (!confirm(`Excluir localidade "${nome}"?`)) return;
    apiUrl = await buscarUrlTunel();
    try { await fetch(apiUrl + '/localidade/' + encodeURIComponent(nome), { method: 'DELETE' }); carregar(); }
    catch(e) { alert('Erro ao excluir'); }
}