"use strict";

// Sem servidor ou dependências. Não há limite artificial de caracteres.
// O localStorage pertence a este navegador/origem, não é um mural compartilhado.
const CHAVE = "cartas-pro-max-mural-v1";
const $ = (id) => document.getElementById(id);
const modal = $("modal");
const editor = $("editorCarta");

let estado = { proximoNumero: 1, cartas: [] };
let cartaAtual = null;
let editando = false;
let carregamentoFalhou = false;

try {
  const salvo = localStorage.getItem(CHAVE);

  if (salvo) {
    const dados = JSON.parse(salvo);

    if (
      !Array.isArray(dados.cartas) ||
      !Number.isSafeInteger(dados.proximoNumero) ||
      dados.proximoNumero < 1 ||
      !dados.cartas.every(
        (c) =>
          Number.isSafeInteger(c.numero) &&
          c.numero > 0 &&
          c.numero < dados.proximoNumero &&
          typeof c.conteudo === "string",
      ) ||
      new Set(dados.cartas.map((c) => c.numero)).size !== dados.cartas.length
    ) {
      throw new Error("Dados inválidos");
    }

    estado = dados;
  }
} catch {
  carregamentoFalhou = true;

  $("statusMural").textContent =
    "Não foi possível carregar as cartas. Verifique o armazenamento do navegador e recarregue a página. Os dados existentes não foram sobrescritos.";
}

function persistir() {
  if (carregamentoFalhou) return false;

  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));

    $("statusMural").textContent = "";
    $("statusCarta").textContent = "Salvo neste navegador.";

    return true;
  } catch {
    const aviso =
      "Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado. Copie sua mensagem antes de sair.";

    $("statusCarta").textContent = aviso;
    $("statusMural").textContent = aviso;

    return false;
  }
}

function renderizarMural() {
  $("cartas").replaceChildren();

  for (const carta of estado.cartas) {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "carta";
    botao.dataset.numero = carta.numero;
    botao.setAttribute("aria-label", `Revelar Carta ${carta.numero}`);

    // Apenas estrutura fixa no HTML; mensagens nunca são injetadas como HTML.
    botao.innerHTML =
      '<span class="envelope" aria-hidden="true"><span class="selo">💌</span></span><span class="nome-carta"></span>';

    botao.querySelector(".nome-carta").textContent = `Carta ${carta.numero}`;

    botao.addEventListener("click", () => abrirCarta(carta, false));

    $("cartas").append(botao);
  }

  const total = estado.cartas.length;

  $("quantidade").textContent =
    `${total} ${total === 1 ? "envelope" : "envelopes"}`;

  $("vazio").hidden = total > 0;
  $("novaCarta").disabled = carregamentoFalhou;
}

// Links HTTP/HTTPS ficam clicáveis na leitura, mantendo o restante como texto.
function mostrarConteudo(texto) {
  const leitura = $("leituraCarta");

  leitura.replaceChildren();

  if (!texto.trim()) {
    leitura.textContent =
      "Esta carta ainda está em branco. Clique em “Editar mensagem” para escrever.";

    return;
  }

  const regex = /https?:\/\/[^\s<>"']+/gi;
  let inicio = 0;

  for (const match of texto.matchAll(regex)) {
    const url = match[0].replace(/[.,;:!?\)\]\}]+$/, "");

    leitura.append(document.createTextNode(texto.slice(inicio, match.index)));

    const link = document.createElement("a");

    link.textContent = url;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    leitura.append(link);

    inicio = match.index + url.length;
  }

  leitura.append(document.createTextNode(texto.slice(inicio)));
}

function atualizarContador() {
  const total = Array.from(cartaAtual.conteudo).length;

  $("contador").textContent =
    `${total.toLocaleString("pt-BR")} caracteres · textos longos são bem-vindos`;
}

function definirModo(edicao) {
  editando = edicao;

  editor.hidden = !edicao;
  $("leituraCarta").hidden = edicao;
  $("editarCarta").hidden = edicao;

  $("concluirCarta").textContent = edicao
    ? "💌 Guardar e fechar"
    : "💌 Fechar envelope";

  $("dicaCarta").textContent = edicao
    ? "Escreva diretamente no papel. O salvamento é automático; cole links completos para incluí-los."
    : "Conteúdo revelado. Ao fechar, sua mensagem volta a ficar oculta.";

  if (edicao) {
    editor.textContent = cartaAtual.conteudo;
    editor.focus();
  } else {
    mostrarConteudo(cartaAtual.conteudo);
  }
}

function abrirCarta(carta, edicao) {
  cartaAtual = carta;

  $("tituloCarta").textContent = `Carta ${carta.numero}`;
  $("statusCarta").textContent = "";

  modal.showModal();
  definirModo(edicao);
  atualizarContador();
}

function salvarEdicao() {
  if (!cartaAtual || !editando) return true;

  cartaAtual.conteudo = editor.innerText.replace(/\r\n/g, "\n");

  atualizarContador();

  return persistir();
}

function fecharCarta() {
  // Mantém o texto visível se o salvamento falhar.
  if (!salvarEdicao()) return;

  modal.close();
}

$("novaCarta").addEventListener("click", () => {
  const carta = {
    numero: estado.proximoNumero++,
    conteudo: "",
  };

  estado.cartas.push(carta);

  if (!persistir()) {
    estado.cartas.pop();
    estado.proximoNumero--;

    return;
  }

  renderizarMural();
  abrirCarta(carta, true);
});

editor.addEventListener("input", salvarEdicao);

$("editarCarta").addEventListener("click", () => {
  definirModo(true);
});

$("fecharCarta").addEventListener("click", fecharCarta);
$("concluirCarta").addEventListener("click", fecharCarta);

modal.addEventListener("cancel", (evento) => {
  evento.preventDefault();
  fecharCarta();
});

modal.addEventListener("click", (evento) => {
  if (evento.target === modal) fecharCarta();
});

modal.addEventListener("close", () => {
  // Retira a mensagem do modal fechado e devolve o foco ao envelope.
  const numero = cartaAtual?.numero;

  editor.textContent = "";
  $("leituraCarta").replaceChildren();

  cartaAtual = null;
  editando = false;

  const envelope = document.querySelector(`[data-numero="${numero}"]`);

  (envelope || $("novaCarta")).focus();
});

$("excluirCarta").addEventListener("click", () => {
  if (
    !cartaAtual ||
    !confirm(
      `Excluir a Carta ${cartaAtual.numero}? Esta ação não pode ser desfeita.`,
    )
  ) {
    return;
  }

  const anteriores = estado.cartas;

  estado.cartas = estado.cartas.filter((c) => c.numero !== cartaAtual.numero);

  if (!persistir()) {
    estado.cartas = anteriores;
    return;
  }

  modal.close();
  renderizarMural();
});

renderizarMural();
