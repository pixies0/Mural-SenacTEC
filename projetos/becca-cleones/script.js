const welcomeScreen = document.getElementById('welcomeScreen');
const btnEnterMural = document.getElementById('btnEnterMural');
const mainContent = document.getElementById('mainContent');
const envelopeForm = document.getElementById('envelopeForm');
const mural = document.getElementById('mural');
const nextIdSpan = document.getElementById('nextId');

const envelopeModal = document.getElementById('envelopeModal');
const btnOpenModal = document.getElementById('btnOpenModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnClearAll = document.getElementById('btnClearAll'); // Seletor do botão Limpar Tudo

let envelopes = JSON.parse(localStorage.getItem('envelopes')) || [];
let proximoNumero = parseInt(localStorage.getItem('proximoNumero')) || 1;

btnEnterMural.addEventListener('click', () => {
    welcomeScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
});

btnOpenModal.addEventListener('click', () => {
    envelopeModal.classList.remove('hidden-modal');
});

btnCloseModal.addEventListener('click', () => {
    envelopeModal.classList.add('hidden-modal');
});

window.addEventListener('click', (e) => {
    if (e.target === envelopeModal) {
        envelopeModal.classList.add('hidden-modal');
    }
});

// NOVO: Evento para deletar o mural inteiro com dupla confirmação
btnClearAll.addEventListener('click', () => {
    if (envelopes.length === 0) {
        alert("O mural já está vazio!");
        return;
    }

    const confirmacao1 = confirm("Tem certeza absoluta de que deseja APAGAR TODOS os envelopes do mural?");
    if (confirmacao1) {
        const confirmacao2 = confirm("Aviso final: Esta ação é irreversível e apagará todos os dados salvos. Continuar?");
        if (confirmacao2) {
            envelopes = [];
            proximoNumero = 1; // Reinicia a contagem dos cards
            salvarDados();
            renderizarMural();
            atualizarProximoNumeroForm();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    renderizarMural();
    atualizarProximoNumeroForm();
});

function atualizarProximoNumeroForm() {
    nextIdSpan.textContent = proximoNumero;
}

function salvarDados() {
    localStorage.setItem('envelopes', JSON.stringify(envelopes));
    localStorage.setItem('proximoNumero', proximoNumero.toString());
}

envelopeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const textoInput = document.getElementById('texto');
    const linkInput = document.getElementById('link');
    const corInput = document.querySelector('input[name="cor"]:checked');

    const novoEnvelope = {
        id: Date.now(),
        numero: proximoNumero,
        texto: textoInput.value.trim(),
        link: linkInput.value.trim(),
        cor: corInput ? corInput.value : '#f1c40f'
    };

    envelopes.push(novoEnvelope);
    proximoNumero++;
    
    salvarDados();
    renderizarMural();
    atualizarProximoNumeroForm();

    envelopeForm.reset();
    envelopeModal.classList.add('hidden-modal');
});

function renderizarMural() {
    mural.innerHTML = '';

    if (envelopes.length === 0) {
        mural.innerHTML = '<p style="color: #7f8c8d; grid-column: 1/-1; text-align: center; margin-top: 40px;">Nenhum envelope criado ainda. Clique em "Escrever Nova Mensagem" para começar!</p>';
        return;
    }

    envelopes.forEach(envelope => {
        const card = document.createElement('div');
        card.className = 'envelope-card';
        
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete') || e.target.closest('.link-url')) {
                return;
            }
            card.classList.toggle('flipped');
        });

        card.innerHTML = `
            <div class="card-inner">
                <!-- FRENTE -->
                <div class="card-front" style="background-color: ${envelope.cor};">
                    <div class="numero">Card #${String(envelope.numero).padStart(2, '0')}</div>
                    <div class="status">🔒 Clique para Revelar</div>
                </div>
                <!-- VERSO -->
                <div class="card-back" style="border-color: ${envelope.cor};">
                    <div class="header-back">
                        <span>Card #${String(envelope.numero).padStart(2, '0')}</span>
                        <button class="btn-delete" title="Excluir card" onclick="excluirEnvelope(${envelope.id})">🗑️</button>
                    </div>
                    <div class="conteudo">
                        <p>${escapeHTML(envelope.texto)}</p>
                        ${envelope.link ? `<a href="${envelope.link}" target="_blank" class="link-url">🔗 Acessar Link</a>` : ''}
                    </div>
                </div>
            </div>
        `;

        mural.appendChild(card);
    });
}

function excluirEnvelope(id) {
    const confirmar = confirm("Tem certeza de que deseja excluir este envelope permanentemente?");
    if (confirmar) {
        envelopes = envelopes.filter(env => env.id !== id);
        salvarDados();
        renderizarMural();
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

