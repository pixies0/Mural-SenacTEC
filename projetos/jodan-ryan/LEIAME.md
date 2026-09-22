# Carta Oculta — guia de execução

Cartas colecionáveis digitais, protegidas por senha, onde você guarda textos, imagens e qualquer arquivo. Todas ficam **lado a lado numa mesa**, como num card game: cada carta tem arte própria, atributo, nível e número de série. Tudo é **cifrado no seu navegador** (AES-256-GCM) e fica no **cache local** (IndexedDB). Não existe servidor, conta ou nuvem.

---

## 1. O que vem na pasta

```
carta-oculta/
├── index.html        estrutura da página
├── style.css         visual (tema Kali)
├── app.js            lógica: criptografia, cache, interface
├── iniciar.bat       lançador para Windows (dois cliques)
├── iniciar.sh        lançador para Linux / macOS / WSL
├── LEIAME.md         este guia
└── testes/
    └── teste_e2e.py  teste automático (56 verificações)
```

Os três arquivos `index.html`, `style.css` e `app.js` precisam estar **sempre juntos na mesma pasta**.

## 2. Requisitos

| Item | Mínimo |
|---|---|
| Navegador | Chrome/Edge 102+, Firefox 112+, Safari 15.5+ (qualquer versão de 2023 em diante) |
| Python | Só para as opções B e C (qualquer 3.x). No seu PC: `C:\Python314` |
| Internet | Não é necessária. Sem internet, só as fontes caem para a fonte do sistema. |

---

## 3. Como rodar (escolha UMA opção)

### Opção A — dois cliques no `index.html` (mais simples)

1. Abra a pasta `carta-oculta` no Explorador de Arquivos.
2. Dê dois cliques em `index.html` (ou arraste-o para o Chrome/Edge).
3. Confira no topo: o chip **`cripto: ativa`** deve aparecer em verde.

Pronto. Não precisa de Python nem de terminal. Funciona no **Chrome e no Edge**; no Firefox ou no Safari, prefira a opção B.

### Opção B — `iniciar.bat` (recomendada no Windows)

1. Dê dois cliques em **`iniciar.bat`**.
2. Uma janela preta abre com `servidor no ar` e o navegador abre sozinho em **http://localhost:8080/**.
3. Use normalmente. Para parar, feche a janela preta.

Porta ocupada? Abra o terminal na pasta e rode `iniciar.bat 9000` para usar a porta 9000.

> Se o Windows mostrar "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. O arquivo é texto puro; abra-o no Bloco de Notas para conferir antes, se quiser.

### Opção C — terminal, manualmente

**Windows (PowerShell ou CMD)**, dentro da pasta:

```powershell
cd C:\caminho\para\carta-oculta
py -m http.server 8080 --bind 127.0.0.1
# ou: C:\Python314\python.exe -m http.server 8080 --bind 127.0.0.1
```

**Linux / macOS / WSL:**

```bash
cd ~/carta-oculta
chmod +x iniciar.sh     # só na primeira vez
./iniciar.sh            # ou: python3 -m http.server 8080 --bind 127.0.0.1
```

**Com Node.js** (se preferir): `npx serve -l 8080 .`

**VS Code:** instale a extensão *Live Server*, clique com o botão direito em `index.html` e escolha **Open with Live Server**.

Depois, abra **http://localhost:8080/** no navegador.

### Opção D — usar no celular (precisa de HTTPS)

A criptografia do navegador **só funciona em contexto seguro**: arquivo local, `localhost` ou `https://`. Por isso, abrir `http://192.168.x.x:8080` no celular **não funciona** (o chip mostra `cripto: bloqueada`).

Para usar no celular, publique a pasta em qualquer hospedagem estática com HTTPS:

- **Cloudflare Pages:** painel → Workers & Pages → Create → Pages → *Upload assets* → envie a pasta.
- **Netlify:** arraste a pasta em https://app.netlify.com/drop.
- **GitHub Pages:** suba os arquivos num repositório → Settings → Pages → *Deploy from branch*.

Mesmo hospedado, os dados continuam só no aparelho de quem usa: o site entrega apenas o código.

---

## 4. ⚠️ Importante: o cache pertence ao ENDEREÇO

O navegador separa os dados pelo endereço exato. Cada linha abaixo é um cofre **diferente**:

| Como você abriu | Cofre |
|---|---|
| `file:///C:/.../index.html` (opção A) | cofre 1 |
| `http://localhost:8080` (opções B e C) | cofre 2 |
| `http://localhost:9000` | cofre 3 (a porta conta!) |
| `http://127.0.0.1:8080` | cofre 4 (≠ localhost) |
| Chrome × Edge × Firefox | cofres separados |
| Janela anônima | cofre temporário, apagado ao fechar |

**Regra prática:** escolha uma forma de abrir e use sempre a mesma. Para levar as cartas de um cofre para outro, use **exportar → importar** (seção 6).

---

## 5. Primeiro uso, passo a passo

1. Clique em **+ nova carta** (ou no espaço tracejado **forjar carta** da mesa).
2. Dê um **codinome** (fica visível no baralho, então não coloque segredos nele).
3. Crie uma **frase-senha** com pelo menos 8 caracteres. O medidor mostra a força; mire em "forte" ou "blindada". Frases longas funcionam bem, por exemplo: `palmas tem sol 365 dias!`
4. Confirme a senha e clique em **forjar**. A carta voa do baralho, pousa na mesa ao lado das outras, vem ao centro e abre.
5. Adicione conteúdo:
   - **Texto:** escreva e clique em **gravar nota** (ou use Ctrl+Enter).
   - **Arquivos:** clique em **anexar** (dá para selecionar vários).
   - **Imagem da área de transferência:** tire um print (Win+Shift+S) e cole com **Ctrl+V**.
   - **Arrastar:** solte arquivos em cima da carta aberta.
6. Clique em **selar** (ou aperte Esc). O conteúdo some da tela e da memória.
7. Clique em **✕ voltar à mesa** (ou Esc de novo, ou no fundo escuro). A carta volta para o lugar dela.
8. Para reabrir: clique na carta na mesa (ou na lista do baralho), digite a senha e clique em **revelar**.

### Anatomia da carta na mesa

```
┌───────────────────────────┐
│ NOME DA CARTA          (D)│  ← codinome + atributo (D, R, N, S, F, É)
│                    ★★★★★  │  ← nível: 1 estrela por fragmento (máx. 12)
│ ┌───────────────────────┐ │
│ │   arte procedural     │ │  ← desenho ÚNICO, gerado a partir do id
│ └───────────────────────┘ │
│ [ ARCANO III / DADOS ]    │  ← posição na mesa (romano) + atributo
│ ┌───────────────────────┐ │
│ │ Forjada em … Guarda … │ │  ← texto da carta
│ └───────────────────────┘ │
│ CO-7F3A           FRAG/5  │  ← número de série + fragmentos
└───────────────────────────┘
```

- **Atributos e cores:** DADOS (azul), REDE (ciano), NÚCLEO (verde), SOMBRA (roxo), FOGO (vermelho) e ÉTER (âmbar). São sorteados uma vez a partir do id e **nunca mudam**, nem depois de exportar e importar.
- **Ordem:** cada carta nova entra **à direita** da última e quebra linha quando a tela acaba. No celular, a mesa fica em 2 colunas.
- **Queimar** uma carta faz ela pegar fogo na mesa antes de sumir.

### Atalhos e comportamentos

| Ação | Como |
|---|---|
| Gravar nota | Ctrl+Enter (⌘+Enter no Mac) |
| Selar a carta | Esc. Se houver rascunho no campo de texto, o 1º Esc só tira o foco, para você não perder o texto. |
| Voltar à mesa | Esc com a carta selada, botão **✕ voltar à mesa** ou clique no fundo escuro. Voltar à mesa sempre sela. |
| Destaque na mesa | Passe o mouse: a carta levanta, inclina e ganha brilho holográfico |
| Ver imagem grande | Clique na imagem; Esc ou clique fora fecha |
| Baixar arquivo | Clique em "⤓ baixar …" (sai decifrado) |
| Apagar fragmento | ✕ → "confirmar?" → clique de novo em até 3 s |
| Queimar a carta | "queimar" → "certeza?" → clique de novo em até 3 s |
| Bloqueio automático | 2 min sem interação (o cronômetro fica vermelho nos últimos 20 s) |
| Fechar ou recarregar a aba | A carta sela automaticamente |

---

## 6. Backup (exportar / importar)

- **Exportar** (rodapé do baralho) baixa `carta-oculta-backup-AAAA-MM-DD.json` com **todas** as cartas. O conteúdo continua **cifrado** e só abre com as senhas.
- **Importar** restaura esse arquivo. Cartas com o mesmo ID são substituídas, sem duplicar.
- Use o backup para:
  - trocar de navegador ou de computador;
  - passar do `file://` para o `localhost` (seção 4);
  - se proteger de uma limpeza de dados do navegador.

> Limpar os "dados de navegação / cookies e dados de sites" **apaga as cartas**. Faça backup de vez em quando.

---

## 7. Solução de problemas

| Sintoma | Causa | Solução |
|---|---|---|
| Página sem estilo, nada funciona | Os 3 arquivos não estão na mesma pasta | Deixe `index.html`, `style.css` e `app.js` juntos |
| Chip **`cripto: bloqueada`** | Aberto por `http://IP-da-rede` | Use arquivo local, `localhost` ou HTTPS (seção 3-D) |
| "IndexedDB indisponível" | Janela anônima de navegador antigo ou armazenamento bloqueado | Use uma janela normal; libere "cookies e dados de sites" para o endereço |
| Minhas cartas sumiram | Abriu por outro endereço, porta ou navegador | Volte ao endereço original (seção 4) ou importe o backup |
| `iniciar.bat` fecha na hora | Porta em uso | Rode `iniciar.bat 9000` |
| `iniciar.bat` abre a Microsoft Store | O `python` do Windows é um atalho da loja | Instale o Python pelo python.org, ou rode `C:\Python314\python.exe -m http.server 8080` |
| "sem espaço no cache do navegador" | Cota do navegador cheia | Apague fragmentos grandes, exporte e libere espaço em disco |
| Arquivo "excede 25 MB — ignorado" | Limite por arquivo | Ajuste `MAX_FILE_BYTES` no `app.js` (seção 8) |
| Imagem aparece como link de download | Formato que o navegador não exibe (ex.: HEIC) | Normal; o arquivo baixa intacto |
| "o cofre foi atualizado em outra aba" | Duas abas abertas durante uma atualização | Recarregue a página (F5) |
| Senha esquecida | Não há recuperação, por projeto | Nem o backup ajuda. Guarde a senha num gerenciador de senhas |

**Ver erros detalhados:** o terminal na lateral direita registra tudo. Para mais detalhes, aperte F12 e abra a aba **Console**.

---

## 8. Ajustes rápidos (`app.js`, bloco `CONFIG`)

```js
AUTO_LOCK_MS: 120_000,            // tempo até selar sozinha (ms). 300_000 = 5 min
MAX_FILE_BYTES: 25 * 1024 * 1024, // limite por arquivo. 100 * 1024 * 1024 = 100 MB
PBKDF2_ITERATIONS: 310_000,       // ⚠ NÃO altere depois de criar cartas:
                                  //   as cartas existentes deixariam de abrir
```

As cores ficam no topo do `style.css`, no bloco `:root` (`--kali`, `--neon`, `--red`…).

---

## 9. Segurança: o que protege e o que não protege

**Protege:**
- Quem copiar o banco ou o backup não lê nada sem a senha. Isso vale para textos, imagens, arquivos **e seus nomes**.
- Qualquer alteração no conteúdo cifrado é detectada: o AES-GCM autentica os dados.
- Senha e chave nunca são gravadas. A chave vive só na memória enquanto a carta está aberta.
- Ao selar, o conteúdo decifrado sai da tela e as URLs temporárias dos arquivos são liberadas.

**Não protege:**
- **Codinome, datas e número de fragmentos** ficam visíveis (servem para montar o baralho).
- Um computador com vírus ou keylogger captura a senha no momento em que você digita.
- Um **arquivo baixado** fica decifrado na sua pasta Downloads.
- Senhas fracas podem ser quebradas por força bruta com o backup em mãos. Use frases longas.

---

## 10. Teste automático (opcional)

Roda 56 verificações num Chromium real: arquivo local, migração de banco, mesa (ordem, cores, arte idêntica após importar), carta em foco (abrir, Esc, fundo, foco do teclado), criar, anexar (seletor, colar e arrastar), baixar, apagar, selar, senha errada, exportar, queimar, importar, proteção contra código malicioso no nome, layout de celular e bloqueio automático.

```powershell
pip install playwright
python -m playwright install chromium
python testes\teste_e2e.py
```

O resultado esperado termina em `FALHAS: nenhuma`. O teste usa um navegador isolado, então **não mexe nas suas cartas**.
