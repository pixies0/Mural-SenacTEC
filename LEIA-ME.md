# Mural Técnico — Operação Reiniciar

Portal em HTML, CSS e JavaScript puro, com seis projetos e seis desafios fixos.

## Atualizar o GitHub Pages

Extraia este ZIP e copie o conteúdo da pasta `mural` para a raiz do seu repositório, substituindo os arquivos correspondentes. Preserve a pasta `.git` que já existe no seu computador. O pacote não contém o histórico Git.

O `index.html`, a pasta `assets` e a pasta `projetos` devem estar no mesmo nível. Faça o commit e envie a atualização ao GitHub como de costume. Não envie apenas o ZIP. O arquivo `.nojekyll` está incluído.

## O que mudou

- Card para `projetos/pedro/index.html`; seis projetos na apresentação.
- 48 cartões permanentes no HTML, distribuídos nas grades dos próprios murais. Eles usam o visual de cada projeto e dividem missão, etapas, dica e montagem da flag.
- Nenhuma missão depende de localStorage, IndexedDB, cookies ou cadastro de envelopes. JavaScript abre os envelopes e a leitura ampliada; o conteúdo é publicado diretamente no HTML.
- A página de Becca & Cleones entra diretamente no mural para que a tela inicial não cubra a missão.
- Retorno ao portal também no projeto do Pedro.
- Verificador na página principal para seis flags e a flag final.
- A versão do Geizer e os demais scripts originais foram preservados.

## Estações

| Estação | Projeto | Conteúdo | Formato |
| --- | --- | --- | --- |
| 01 | Becca & Cleones | Bit e verdadeiro/falso | MT{BIT-DD} |
| 02 | Geizer | AND, OR e NOT | MT{LOG-DD} |
| 03 | Jodan & Ryan | NAND e NOR | MT{INV-DD} |
| 04 | Luix & Dara | Decimal e binário | MT{BIN-DD} |
| 05 | PRO MAX | Expressão lógica e sistemas digitais | MT{SIS-DD} |
| 06 | Pedro | Requisitos funcionais e não funcionais | MT{REQ-DD} |

DD é o código decimal com dois algarismos. A flag final junta os seis códigos, em ordem: `MT{DD-DD-DD-DD-DD-DD}`. Nesta versão, as flags são comuns a todas as equipes: identifique o grupo na tabela do Loop, e não dentro da flag.

## Condução

1. Compartilhe o endereço do portal e a tabela do Loop.
2. Cada equipe resolve as seis estações, registrando cálculos e justificativas no Whiteboard.
3. O aluno acessa “Verificar flag” no enunciado; o portal já seleciona a estação correspondente.
4. A equipe digita a flag completa. A conferência aceita letras minúsculas e ignora espaços, mas exige o código com dois algarismos.
5. Se correta, a flag pode ser copiada e colada no Loop. Se a cópia automática não estiver disponível, o campo é selecionado para cópia manual.
6. O instrutor confere a evidência e a explicação. Acertar o código não comprova sozinho a resolução de todas as questões.
7. Ao terminar as seis estações, a equipe monta a flag final e explica o efeito do bloqueio na porta da estação 05.

Modelo para criar a tabela no Loop:

| Equipe | Estação | Flag conferida | Evidência no Whiteboard | Validação do instrutor |
| --- | --- | --- | --- | --- |
| G01 | 01 | | | |
| G01 | 02 | | | |
| G01 | 03 | | | |
| G01 | 04 | | | |
| G01 | 05 | | | |
| G01 | 06 | | | |
| G01 | Final | | | |

Repita as linhas para as demais equipes. O site não envia dados ao Teams e não possui placar compartilhado. O resultado da conferência é temporário; copiar para o Loop é uma etapa manual.

## Editar as missões

Os textos ficam diretamente em cada `projetos/NOME/index.html`, nos elementos `data-ctf-fixed` das grades dos murais. Não crie envelopes pelo navegador para distribuir instruções. Edite o HTML e publique a atualização.

- `assets/cartoes-fixos.css`: complementos de leitura dos cartões nativos.
- `assets/cartoes-fixos.js`: abre em uma janela de leitura o conteúdo que já está escrito no HTML.
- `assets/ctf.css`: aparência da apresentação e do verificador.
- `assets/ctf.js`: formatos, respostas esperadas e lógica de conferência.

Se mudar uma resposta, atualize também a resposta esperada em `assets/ctf.js`, o formato quando necessário e a flag final. As respostas do verificador estão no código público: esta é uma atividade didática, não uma plataforma CTF antifraude. Peça a demonstração do raciocínio. Sem servidor, não há como garantir segredo das respostas, autenticação de equipe ou validação protegida.

## Dados dos murais

As funcionalidades livres originais continuam disponíveis. Alguns projetos guardam seus envelopes no armazenamento local do navegador. Esses dados não são usados para distribuir os desafios. As instruções fixas permanecem disponíveis mesmo sem dados locais. A leitura interativa dos envelopes exige JavaScript.

## Verificação realizada

Conferidos os 39 caminhos locais, os seis cards, os 48 cartões no HTML, os identificadores e a sintaxe dos scripts externos e inline. Testada a lógica das sete flags, incluindo resposta errada, normalização, seleção por URL e cópia manual alternativa. A revisão visual em navegador não pôde ser executada neste ambiente. Antes da aula, abra o portal em um computador e um celular e confira o acesso ao Loop com uma conta de aluno.

## Cartões permanentes

Os cartões da missão ficam na mesma grade usada pelo projeto do aluno. Não podem ser editados nem apagados pelos controles de mensagens livres. As rotinas de renderização preservam esses nós ao criar, excluir ou limpar mensagens pessoais. O botão “Ler cartão” amplia os textos; nos murais de envelopes, clique no envelope para ler.

Becca & Cleones: 8 cartões; Geizer: 7; Jodan & Ryan: 8; Luix & Dara: 9; PRO MAX: 8; Pedro: 8. As flags e o verificador foram mantidos.
