# Mural Técnico — portal de projetos

Portal em HTML, CSS e JavaScript puro, sem instalação de pacotes ou etapa de compilação. Inclui os cinco projetos do ZIP original.

## Publicar no GitHub Pages

1. Extraia o ZIP no seu computador.
2. Crie um repositório no GitHub (por exemplo, `mural-tecnico`). Um repositório público permite usar o Pages no plano gratuito.
3. Envie **o conteúdo** da pasta extraída ao repositório. O arquivo `index.html` deve ficar na raiz, junto das pastas `assets` e `projetos`. Não envie apenas o ZIP.
4. Abra **Settings → Pages**.
5. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
6. Em **Branch**, selecione **main** e **/(root)**. Clique em **Save**.
7. Aguarde a publicação. O endereço aparecerá na própria tela Pages; geralmente será `https://SEU-USUARIO.github.io/mural-tecnico/`.

Documentação oficial: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Experimentar no computador

Abra `index.html` no navegador. Para testar todas as funcionalidades, especialmente a Carta Oculta, prefira um servidor local como a extensão Live Server do VS Code. Quem já tem Python pode executar `python -m http.server 8000` nesta pasta e acessar `http://localhost:8000`.

## Organização

- `index.html`: página inicial e cartões com os links das atividades.
- `assets/style.css`: aparência e adaptação para celular.
- `assets/script.js`: retorno do foco ao cartão do projeto visitado.
- `assets/voltar.js`: atalho “Voltar ao portal” dentro das atividades.
- `projetos/`: cada trabalho em sua própria pasta.

| Grupo (nome da pasta original) | Pasta de publicação |
| --- | --- |
| becca&cleones | projetos/becca-cleones/ |
| geizer | projetos/geizer/ |
| jodan&ryan | projetos/jodan-ryan/ |
| Luix&Dara | projetos/luix-dara/ |
| pro max 10 10 | projetos/pro-max/ |

## Personalizar e acrescentar projetos

Edite os textos de `index.html` para ajustar título, nomes dos alunos e descrições. Os nomes dos grupos foram inferidos das pastas, sem expandir nomes ou corrigir grafias.

Para adicionar um trabalho:

1. Crie uma pasta em `projetos`, com nome simples, sem espaços ou acentos.
2. Copie o HTML, CSS, JavaScript e demais arquivos do trabalho, preservando seus caminhos internos.
3. Duplique um bloco `<article class="project">` no `index.html` do portal.
4. Altere o link, grupo, título, descrição, capa tipográfica, número e o identificador do título (`id` e `aria-labelledby` devem corresponder e ser únicos).
5. Atualize a contagem e a frase “Cinco jeitos de criar”.
6. Para incluir o retorno, adicione `<script src="../../assets/voltar.js"></script>` antes de `</body>` na página principal do novo trabalho, se ela ficar no mesmo nível das outras.

## O que foi preservado e integrado

Os códigos das atividades foram mantidos. Apenas foi incluído o script do atalho de retorno. Foram reorganizadas as pastas de publicação e retiradas cópias de backup, testes, inicializadores locais e documentos de planejamento do pacote web. A licença enviada com o projeto Luix & Dara foi preservada. O ZIP original permanece como referência completa.

O portal usa caminhos relativos, inclusive nas imagens e folhas de estilo, para funcionar em subpastas do GitHub Pages. Não há dependências externas no portal. A Carta Oculta e o Mural Digital mantêm referências externas a fontes/ícones dos projetos originais.

As atividades não têm servidor nem banco de dados compartilhado: Becca & Cleones, Luix & Dara e PRO MAX armazenam dados localmente; Carta Oculta usa IndexedDB e criptografia no navegador; Geizer mantém os cartões apenas enquanto a página está aberta. Publicar no Pages não sincroniza essas mensagens entre os alunos. A Carta Oculta deve ser acessada em HTTPS ou localhost para usar as APIs de criptografia.

Este pacote prepara a publicação; ele não cria um repositório nem publica automaticamente na sua conta.
