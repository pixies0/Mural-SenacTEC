// ===== Estado =====
const STORAGE_KEY = 'mural_envelopes_v2';
let envelopes = carregar();
let proximoNumero = calcularProximoNumero();
let numeroParaExcluir = null;

// ===== Elementos =====
const mural       = document.getElementById('mural');
const vazio       = document.getElementById('vazio');
const btnNovo     = document.getElementById('btn-novo');
const form        = document.getElementById('envelope-form');

const modalCriar   = document.getElementById('modal-criar');
const modalAbrir   = document.getElementById('modal-abrir');
const modalExcluir = document.getElementById('modal-excluir');

const abrirTitulo   = document.getElementById('abrir-titulo');
const abrirConteudo = document.getElementById('abrir-conteudo');
const abrirLinks    = document.getElementById('abrir-links');

const excluirTexto     = document.getElementById('excluir-texto');
const cancelarExclusao = document.getElementById('cancelar-exclusao');
const confirmarExclusao= document.getElementById('confirmar-exclusao');

// ===== Persistência =====
function carregar() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function salvar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelopes));
}

function calcularProximoNumero() {
  if (envelopes.length === 0) return 1;
  return Math.max(...envelopes.map(e => e.numero)) + 1;
}

// ===== Renderização =====
function renderizar() {
  Array.from(mural.children).filter(el => !el.hasAttribute('data-ctf-fixed')).forEach(el => el.remove());

  if (envelopes.length === 0 && !mural.querySelector('[data-ctf-fixed]')) {
    vazio.style.display = 'block';
    return;
  }
  vazio.style.display = 'none';

  const ordenados = [...envelopes].sort((a, b) => a.numero - b.numero);

  ordenados.forEach((env, i) => {
    const card = document.createElement('div');
    card.className = 'envelope';
    card.style.animationDelay = `${i * 0.06}s`;

    card.innerHTML = `
      <div class="envelope-inner">
        <button class="btn-excluir" title="Excluir">✕</button>
        <div class="envelope-corpo">
          <div class="numero">Envelope #${String(env.numero).padStart(2, '0')}</div>
          <div class="icone">🔒</div>
          <div class="status">Conteúdo oculto</div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-excluir')) return;
      abrirEnvelope(env);
    });

    card.querySelector('.btn-excluir').addEventListener('click', (e) => {
      e.stopPropagation();
      pedirExclusao(env);
    });

    mural.appendChild(card);
  });
}

// ===== Abrir modais =====
function abrirModal(el) {
  el.classList.remove('hidden');
}

function fecharModal(el) {
  el.classList.add('hidden');
}

// Fechar por botão
document.querySelectorAll('[data-fechar]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-fechar');
    fecharModal(document.getElementById(id));
  });
});

// Fechar clicando fora
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(overlay);
  });
});

// Fechar com ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(fecharModal);
  }
});

// ===== Criar envelope =====
btnNovo.addEventListener('click', () => {
  form.reset();
  abrirModal(modalCriar);
  setTimeout(() => document.getElementById('conteudo').focus(), 300);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const conteudo = document.getElementById('conteudo').value.trim();
  const linksRaw = document.getElementById('links').value.trim();
  if (!conteudo) return;

  const links = linksRaw
    .split(/[\n,]+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => /^https?:\/\//i.test(l) ? l : 'https://' + l);

  envelopes.push({
    numero: proximoNumero,
    conteudo,
    links,
    criadoEm: new Date().toISOString()
  });
  proximoNumero++;
  salvar();
  renderizar();
  fecharModal(modalCriar);
});

// ===== Abrir envelope =====
function abrirEnvelope(env) {
  abrirTitulo.textContent = `Envelope #${String(env.numero).padStart(2, '0')}`;
  abrirConteudo.textContent = env.conteudo;

  abrirLinks.innerHTML = '';
  if (env.links && env.links.length > 0) {
    const titulo = document.createElement('strong');
    titulo.textContent = '🔗 Links encontrados:';
    abrirLinks.appendChild(titulo);

    env.links.forEach(url => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = url;
      abrirLinks.appendChild(a);
    });
  }

  abrirModal(modalAbrir);
}

// ===== Excluir =====
function pedirExclusao(env) {
  numeroParaExcluir = env.numero;
  const preview = env.conteudo.length > 60
    ? env.conteudo.substring(0, 60) + '...'
    : env.conteudo;
  excluirTexto.textContent =
    `O Envelope #${String(env.numero).padStart(2, '0')} contém:\n"${preview}"\n\nEsta ação não pode ser desfeita.`;
  abrirModal(modalExcluir);
}

cancelarExclusao.addEventListener('click', () => {
  numeroParaExcluir = null;
  fecharModal(modalExcluir);
});

confirmarExclusao.addEventListener('click', () => {
  if (numeroParaExcluir === null) return;

  const card = [...document.querySelectorAll('.envelope')]
    .find(c => c.querySelector('.numero').textContent.includes(
      `#${String(numeroParaExcluir).padStart(2, '0')}`
    ));

  if (card) {
    card.classList.add('removendo');
    setTimeout(() => {
      envelopes = envelopes.filter(e => e.numero !== numeroParaExcluir);
      salvar();
      renderizar();
      numeroParaExcluir = null;
      fecharModal(modalExcluir);
    }, 380);
  } else {
    envelopes = envelopes.filter(e => e.numero !== numeroParaExcluir);
    salvar();
    renderizar();
    numeroParaExcluir = null;
    fecharModal(modalExcluir);
  }
});

// ===== Inicialização =====
renderizar();