// Chave para salvar no localStorage do navegador
const STORAGE_KEY = 'mural_envelopes_data';

// Seleção de elementos do DOM
const modalForm = document.getElementById('modal-form');
const btnCloseForm = document.getElementById('btn-close-form');
const form = document.getElementById('envelope-form');
const formTitle = document.getElementById('form-title');
const btnSubmitText = document.getElementById('btn-submit-text');
const envelopeIdInput = document.getElementById('envelope-id');
const mensagemInput = document.getElementById('mensagem');
const linkInput = document.getElementById('link');
const mural = document.getElementById('mural');

// Carregar envelopes do localStorage ou iniciar lista vazia
let envelopes = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

// Função para salvar as alterações no localStorage
function salvarEnvelopes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelopes));
}

// ==========================================================
//   CONTROLE DO MODAL (FORMULÁRIO)
// ==========================================================

// Abrir Modal do Formulário
function abrirFormulario(envelopeParaEditar = null) {
  modalForm.classList.remove('hidden');

  if (envelopeParaEditar) {
    // Modo Edição: Preenche os dados da carta existente
    formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Editar Envelope #${String(envelopeParaEditar.id).padStart(2, '0')}`;
    btnSubmitText.textContent = 'Atualizar Carta';
    envelopeIdInput.value = envelopeParaEditar.id;
    mensagemInput.value = envelopeParaEditar.mensagem;
    linkInput.value = envelopeParaEditar.link || 'https://';
  } else {
    // Modo Criação: Prepara um formulário limpo
    formTitle.innerHTML = `<i class="fa-solid fa-plus"></i> Criar Novo Envelope`;
    btnSubmitText.textContent = 'Salvar Envelope';
    envelopeIdInput.value = '';
    form.reset();
    linkInput.value = 'https://'; // Escreve o https:// por padrão
  }

  mensagemInput.focus();
}

// Fechar Modal
function fecharFormulario() {
  modalForm.classList.add('hidden');
  form.reset();
}

// Eventos de clique para fechar o Modal
btnCloseForm.addEventListener('click', fecharFormulario);
modalForm.addEventListener('click', (e) => {
  // Fecha o modal apenas se clicar fora da caixa branca (no fundo escuro)
  if (e.target === modalForm) fecharFormulario();
});

// ==========================================================
//   RENDERIZAÇÃO E INTERAÇÃO DOS ENVELOPES
// ==========================================================

// Renderizar Mural (Inclui o Card Translúcido de Adicionar + Envelopes)
function renderizarMural() {
  mural.innerHTML = '';

  // 1. Criar e inserir o Card Translúcido de Adicionar (+)
  const addCard = document.createElement('li');
  addCard.className = 'add-card-wrapper';
  addCard.title = 'Criar novo envelope';
  addCard.innerHTML = `
    <i class="fa-solid fa-plus add-card-icon"></i>
    <span class="add-card-text">NOVO ENVELOPE</span>
  `;
  addCard.addEventListener('click', () => abrirFormulario());
  mural.appendChild(addCard);

  // 2. Renderizar os envelopes salvos
  envelopes.forEach((env) => {
    const li = document.createElement('li');
    li.className = `envelope-wrapper ${env.revelado ? 'aberto' : ''}`;

    const numeroFormatado = String(env.id).padStart(2, '0');
    
    // Define o título: Usa o personalizado se existir, ou o padrão "Envelope #XX"
    const tituloExibicao = env.titulo || `Envelope #${numeroFormatado}`;

    li.innerHTML = `
      <div class="envelope-back"></div>
      <div class="envelope-flap"></div>
      <div class="wax-seal" title="Selo de Cera"></div>

      <div class="letter">
        <div class="letter-content">
          <p>${env.mensagem}</p>
        </div>
        ${env.link ? `
          <a href="${env.link}" target="_blank" rel="noopener noreferrer" class="letter-link" onclick="event.stopPropagation();">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Acessar Link
          </a>
        ` : ''}
      </div>

      <div class="envelope-pocket"></div>

      <div class="envelope-info">
        <span class="card-number" title="Duplo clique para renomear">${tituloExibicao}</span>
        <div class="card-actions">
          <button class="btn-action btn-edit" title="Editar Envelope">
            <i class="fa-solid fa-pencil"></i>
          </button>
          <button class="btn-action btn-delete" title="Excluir Envelope">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;

    // Evento de Abertura/Fechamento do Envelope
    li.addEventListener('click', () => {
      env.revelado = !env.revelado;
      salvarEnvelopes();
      li.classList.toggle('aberto');
    });

    // Evento de Duplo Clique para Editar o Título
    const badgeTitulo = li.querySelector('.card-number');
    badgeTitulo.addEventListener('dblclick', (e) => {
      e.stopPropagation(); // Impede que a carta abra ao clicar
      
      const novoNome = prompt('Digite o novo nome para este envelope:', env.titulo || `Envelope #${numeroFormatado}`);
      
      if (novoNome !== null) { // Se o usuário não cancelou a caixinha de prompt
        // Se deixar vazio, apaga o título personalizado e volta para o padrão (número)
        env.titulo = novoNome.trim() === '' ? null : novoNome.trim();
        salvarEnvelopes();
        renderizarMural();
      }
    });

    // Evento do Botão Editar (Ícone de Lápis)
    const btnEdit = li.querySelector('.btn-edit');
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation(); // Impede que o clique na ação abra o envelope
      abrirFormulario(env);
    });

    // Evento do Botão Excluir
    const btnDelete = li.querySelector('.btn-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation(); // Impede que o clique na ação abra o envelope
      excluirEnvelope(env.id);
    });

    mural.appendChild(li);
  });
}

// ==========================================================
//   AÇÕES DE SALVAR E EXCLUIR
// ==========================================================

// Salvar ou Atualizar Envelope via Formulário
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const id = envelopeIdInput.value;
  const mensagem = mensagemInput.value.trim();
  let link = linkInput.value.trim();

  // Limpa se o usuário deixar apenas o https:// padrão sem preencher o resto
  if (link === 'https://' || link === 'http://') {
    link = null;
  }

  if (!mensagem) return;

  if (id) {
    // Modo Edição: Atualiza os dados no array
    const index = envelopes.findIndex(env => env.id === Number(id));
    if (index !== -1) {
      envelopes[index].mensagem = mensagem;
      envelopes[index].link = link;
    }
  } else {
    // Modo Criação: Adiciona um novo envelope no array
    const novoId = envelopes.length > 0 ? Math.max(...envelopes.map(e => e.id)) + 1 : 1;
    const novoEnvelope = {
      id: novoId,
      mensagem: mensagem,
      link: link,
      revelado: false,
      titulo: null // Inicia sem título personalizado
    };
    envelopes.push(novoEnvelope);
  }

  salvarEnvelopes();
  renderizarMural();
  fecharFormulario();
});

// Excluir Envelope
function excluirEnvelope(id) {
  const confirmacao = confirm(`Tem certeza que deseja excluir este Envelope?`);

  if (confirmacao) {
    envelopes = envelopes.filter(env => env.id !== id);
    salvarEnvelopes();
    renderizarMural();
  }
}

// ==========================================================
//   INICIALIZAÇÃO DA PÁGINA
// ==========================================================

renderizarMural();