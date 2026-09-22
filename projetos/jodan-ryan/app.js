/* ============================================================================
   CARTA OCULTA — app.js  (v3)
   ----------------------------------------------------------------------------
   Arquitetura em módulos lógicos (objetos), cada um com uma responsabilidade:

     CONFIG   → constantes ajustáveis
     util     → funções pequenas e puras (formatação, download…)
     Codec    → binário ⇄ base64 para o arquivo de backup
     Cipher   → criptografia (Web Crypto API: PBKDF2 + AES-256-GCM)
     Vault    → persistência (IndexedDB = o "cache" do navegador)
     Term     → terminal de eventos na tela
     Effects  → efeitos visuais (chuva, embaralhar texto, inclinação 3D)
     Sigil    → arte procedural: um desenho único e estável por carta
     App      → estado + regras de negócio + ligação com a interface

   Interface (v3): a MESA mostra todas as cartas lado a lado, estilo card
   game. Clicar numa carta a traz para o centro ("carta em foco"), onde
   ela é revelada com a senha.

   Fluxo de dados de um conteúdo:
     você digita/anexa → bytes → AES-GCM (chave derivada da senha)
     → IndexedDB. Ao abrir: IndexedDB → AES-GCM decrypt → tela.
   A senha e a chave NUNCA são gravadas; a chave vive só na memória
   enquanto a carta está aberta.

   Por que um script clássico (defer) e não "type=module"?
     Navegadores bloqueiam módulos ES abertos por arquivo local (file://).
     Com script clássico, dá para abrir o index.html com dois cliques.
   A função abaixo, que se autoexecuta (IIFE), cria um escopo privado:
   nada daqui vaza para o objeto global "window".
   ============================================================================ */
(() => {
  'use strict';   // modo estrito: proíbe erros silenciosos (ex.: variável não declarada)

  /* ============================================================================
     CONFIG
     Object.freeze impede alteração acidental em tempo de execução.
     ============================================================================ */
  const CONFIG = Object.freeze({
    APP_ID: 'carta-oculta',           // assinatura usada nos backups
    DB_NAME: 'carta-oculta',          // nome do banco IndexedDB
    DB_VERSION: 2,                    // v2: itens em store própria (ver Vault)
    STORE_CARDS: 'cards',             // "tabela" das cartas
    STORE_ITEMS: 'items',             // "tabela" dos fragmentos
    PBKDF2_ITERATIONS: 310_000,       // valor recomendado pela OWASP p/ PBKDF2-SHA256
                                      // (o "_" é só separador visual de milhar)
    AUTO_LOCK_MS: 120_000,            // 2 min sem interação → a carta se sela sozinha
    MAX_FILE_BYTES: 25 * 1024 * 1024, // 25 MB por arquivo
    VERIFIER: 'carta-oculta::v1::ok', // texto conhecido usado para testar a senha
  });


  /* ============================================================================
     util — utilidades puras
     ============================================================================ */

  // Conversores texto ⇄ bytes (UTF-8). Criados uma vez e reutilizados.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const util = {
    // ID único (UUID v4). randomUUID existe nos navegadores atuais; o
    // "fallback" monta um UUID com bytes aleatórios para navegadores antigos.
    uid() {
      if (crypto.randomUUID) return crypto.randomUUID();
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;   // versão 4
      b[8] = (b[8] & 0x3f) | 0x80;   // variante RFC 4122
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },

    // 1536 → "1.5 KB". Math.log(n)/Math.log(1024) diz a "ordem de grandeza".
    bytes(n) {
      if (!n) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
      // Casas decimais só a partir de KB; bytes são sempre inteiros.
      return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
    },

    // Data legível em português (ex.: "15/09/2026, 14:03").
    date: (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),

    // Milissegundos → "mm:ss". padStart completa com zero à esquerda.
    clock(ms) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },

    // Promessa que resolve depois de "ms" — permite "await util.wait(300)".
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    // Usuário pediu menos animação no sistema? Mesma media query do CSS.
    reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,

    /**
     * Estima a força da senha em bits de entropia e devolve nota 0–4.
     * Entropia ≈ tamanho × log2(tamanho do alfabeto usado).
     */
    strength(pass) {
      let pool = 0;
      if (/[a-z]/.test(pass)) pool += 26;          // minúsculas
      if (/[A-Z]/.test(pass)) pool += 26;          // maiúsculas
      if (/\d/.test(pass)) pool += 10;             // dígitos
      if (/[^a-zA-Z0-9]/.test(pass)) pool += 33;   // símbolos, espaços, acentos
      const bits = pass.length * Math.log2(pool || 1);
      // Faixas: <35 fraca, <60 razoável, <80 boa, <100 forte, ≥100 blindada.
      const score = bits < 35 ? 0 : bits < 60 ? 1 : bits < 80 ? 2 : bits < 100 ? 3 : 4;
      const labels = ['fraca', 'razoável', 'boa', 'forte', 'blindada'];
      return { bits: Math.round(bits), score, label: labels[score] };
    },

    /** 4 → "IV". Numeração de arcano, como no tarô (0 vira "0"). */
    roman(n) {
      if (!n) return '0';
      const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
        [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      let out = '';
      for (const [value, sym] of table) {
        while (n >= value) { out += sym; n -= value; }   // subtrai o maior símbolo possível
      }
      return out;
    },

    /** Nível da carta: uma estrela por fragmento, no máximo 12 (como num card game). */
    stars: (n) => (n ? '★'.repeat(Math.min(n, 12)) : '☆'),

    /** Faz o navegador baixar um Blob com o nome indicado. */
    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);   // Firefox exige o link no documento
      a.click();
      a.remove();
      // Revoga depois: revogar na hora pode cancelar o download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  };


  /* ============================================================================
     Codec — converte binários ⇄ base64 para o arquivo de backup (JSON)
     ----------------------------------------------------------------------------
     JSON não aceita bytes. Então, ao exportar, todo ArrayBuffer/Uint8Array
     vira { "$b64": "..." }; ao importar, o caminho inverso.
     ============================================================================ */
  const Codec = {
    toB64(bytes) {
      let bin = '';
      const CHUNK = 0x8000;   // 32 KB por vez: evita estourar a pilha de argumentos
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return btoa(bin);       // btoa: "binary to ASCII" (base64)
    },

    fromB64(str) {
      const bin = atob(str);  // atob: "ASCII to binary"
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },

    // Percorre qualquer estrutura (objeto/array) trocando binários por base64.
    pack(v) {
      if (v instanceof ArrayBuffer) return { $b64: Codec.toB64(new Uint8Array(v)) };
      if (ArrayBuffer.isView(v)) return { $b64: Codec.toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
      if (Array.isArray(v)) return v.map(Codec.pack);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Codec.pack(x)]));
      }
      return v;   // números, strings, booleanos passam direto
    },

    // Inverso de pack.
    unpack(v) {
      if (Array.isArray(v)) return v.map(Codec.unpack);
      if (v && typeof v === 'object') {
        if (typeof v.$b64 === 'string') return Codec.fromB64(v.$b64);
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Codec.unpack(x)]));
      }
      return v;
    },
  };


  /* ============================================================================
     Cipher — criptografia com a Web Crypto API (nativa, sem bibliotecas)
     ----------------------------------------------------------------------------
     • PBKDF2: transforma a senha (humana) em uma chave de 256 bits,
       repetindo SHA-256 310 mil vezes → força bruta fica lenta.
     • salt: 16 bytes aleatórios por carta → senhas iguais geram chaves diferentes.
     • AES-GCM: cifra E autentica. Se 1 bit do banco for alterado, a
       decifração falha (em vez de devolver lixo silenciosamente).
     • iv: 12 bytes aleatórios POR operação — nunca reutilizado com a mesma chave.
     ============================================================================ */
  const Cipher = {
    async deriveKey(pass, salt) {
      // 1) Importa a senha como "material bruto" que só serve para derivar chaves.
      const material = await crypto.subtle.importKey(
        'raw',                  // formato: bytes crus
        encoder.encode(pass),   // senha → bytes UTF-8
        'PBKDF2',               // algoritmo que vai usá-la
        false,                  // não exportável
        ['deriveKey'],          // único uso permitido
      );
      // 2) Deriva a chave AES de fato.
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: CONFIG.PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },  // tipo da chave resultante
        false,                              // não exportável: nem o próprio JS a lê
        ['encrypt', 'decrypt'],
      );
    },

    // Recebe bytes (ArrayBuffer/Uint8Array), devolve { iv, data } cifrados.
    async encrypt(key, bytes) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
      return { iv, data };
    },

    // Operação inversa. Lança exceção se a chave estiver errada ou o dado adulterado.
    decrypt(key, { iv, data }) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    },

    // Atalhos: cifra/decifra objetos JS passando por JSON.
    encryptJSON: (key, obj) => Cipher.encrypt(key, encoder.encode(JSON.stringify(obj))),
    async decryptJSON(key, box) {
      return JSON.parse(decoder.decode(await Cipher.decrypt(key, box)));
    },
  };


  /* ============================================================================
     Vault — IndexedDB (o cache persistente do navegador)
     ----------------------------------------------------------------------------
     Por que IndexedDB e não localStorage?
       • guarda binários direto, sem converter para base64 (+33% de tamanho)
       • centenas de MB de capacidade (localStorage ≈ 5 MB)
       • assíncrono: não trava a interface

     Esquema (versão 2):
       cards  { id, title, salt, verifier{iv,data}, itemCount, createdAt, updatedAt }
       items  { id, cardId, meta{iv,data}, body{iv,data} }   + índice "byCard"
     Itens ficam separados da carta: anexar um arquivo grava SÓ esse arquivo,
     e não a carta inteira de novo (essencial quando há vários MB).
     ============================================================================ */
  const Vault = {
    db: null,
    C: CONFIG.STORE_CARDS,
    I: CONFIG.STORE_ITEMS,

    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

        // Roda na criação do banco ou quando DB_VERSION sobe: define/migra o esquema.
        req.onupgradeneeded = (e) => {
          const db = req.result;
          const tx = req.transaction;   // transação especial de upgrade
          if (!db.objectStoreNames.contains(this.C)) {
            db.createObjectStore(this.C, { keyPath: 'id' });   // "id" = chave primária
          }
          if (!db.objectStoreNames.contains(this.I)) {
            const items = db.createObjectStore(this.I, { keyPath: 'id' });
            items.createIndex('byCard', 'cardId');             // busca rápida por carta
          }
          // Migração v1 → v2: na v1 os itens moravam dentro da carta.
          if (e.oldVersion === 1) {
            const items = tx.objectStore(this.I);
            tx.objectStore(this.C).openCursor().onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (!cursor) return;                   // fim da lista
              const card = cursor.value;
              for (const it of card.items ?? []) items.put({ ...it, cardId: card.id });
              card.itemCount = card.items?.length ?? 0;
              delete card.items;
              cursor.update(card);
              cursor.continue();
            };
          }
        };

        req.onsuccess = () => {
          this.db = req.result;
          // Outra aba abriu uma versão mais nova: fecha para não bloqueá-la.
          this.db.onversionchange = () => {
            this.db.close();
            Term.print('o cofre foi atualizado em outra aba — recarregue a página', 'warn');
          };
          resolve(this.db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => Term.print('feche as outras abas da Carta Oculta para atualizar o cofre', 'warn');
      });
    },

    /**
     * Executa operações numa transação e só resolve quando ela TERMINA
     * (oncomplete) — garantia de que os dados foram realmente gravados.
     * @param {string[]} stores  stores envolvidas
     * @param {'readonly'|'readwrite'} mode
     * @param {(tx: IDBTransaction) => IDBRequest|void} fn
     */
    run(stores, mode, fn) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(stores, mode);
        const req = fn(tx);
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('transação abortada'));
      });
    },

    allCards() {
      return this.run([this.C], 'readonly', (tx) => tx.objectStore(this.C).getAll());
    },

    itemsOf(cardId) {
      return this.run([this.I], 'readonly', (tx) =>
        tx.objectStore(this.I).index('byCard').getAll(cardId));
    },

    countItems(cardId) {
      return this.run([this.I], 'readonly', (tx) =>
        tx.objectStore(this.I).index('byCard').count(cardId));
    },

    putCard(card) {
      return this.run([this.C], 'readwrite', (tx) => tx.objectStore(this.C).put(card));
    },

    // Item + contador da carta na MESMA transação: ou grava tudo, ou nada (atômico).
    addItem(card, item) {
      return this.run([this.C, this.I], 'readwrite', (tx) => {
        tx.objectStore(this.I).put(item);
        tx.objectStore(this.C).put(card);
      });
    },

    removeItem(card, itemId) {
      return this.run([this.C, this.I], 'readwrite', (tx) => {
        tx.objectStore(this.I).delete(itemId);
        tx.objectStore(this.C).put(card);
      });
    },

    // Apaga a carta e todos os seus fragmentos.
    burn(cardId) {
      return this.run([this.C, this.I], 'readwrite', (tx) => {
        tx.objectStore(this.C).delete(cardId);
        const idx = tx.objectStore(this.I).index('byCard');
        idx.openKeyCursor(IDBKeyRange.only(cardId)).onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (!cursor) return;
          tx.objectStore(this.I).delete(cursor.primaryKey);
          cursor.continue();
        };
      });
    },

    // Tudo, para backup.
    dump() {
      return this.run([this.C, this.I], 'readonly', (tx) => {
        const out = {};
        tx.objectStore(this.C).getAll().onsuccess = (e) => { out.cards = e.target.result; };
        tx.objectStore(this.I).getAll().onsuccess = (e) => { out.items = e.target.result; };
        return { get result() { return out; } };   // "request" falso p/ o run()
      });
    },

    // Grava um backup (put = insere ou substitui pelo mesmo id).
    restore(cards, items) {
      return this.run([this.C, this.I], 'readwrite', (tx) => {
        cards.forEach((c) => tx.objectStore(this.C).put(c));
        items.forEach((i) => tx.objectStore(this.I).put(i));
      });
    },
  };


  /* ============================================================================
     Term — terminal de eventos (feedback visível de tudo que acontece)
     ============================================================================ */
  const Term = {
    el: null,
    MAX_LINES: 120,

    /** @param {'info'|'ok'|'warn'|'error'|'crypt'} level */
    print(msg, level = 'info') {
      if (level === 'error') console.warn('[carta-oculta]', msg);   // também no DevTools
      if (!this.el) return;
      const li = document.createElement('li');
      li.className = `log-${level}`;
      // hour12:false → formato 24h. O CSS lê data-time via attr().
      li.dataset.time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
      li.textContent = `$ ${msg}`;   // textContent nunca interpreta HTML (seguro contra XSS)
      this.el.append(li);
      // Limita as linhas para não crescer para sempre.
      while (this.el.childElementCount > this.MAX_LINES) this.el.firstElementChild.remove();
      this.el.scrollTop = this.el.scrollHeight;   // rola para o fim
    },
  };


  /* ============================================================================
     Effects — camada visual
     ============================================================================ */
  const Effects = {
    /**
     * Chuva de dados no <canvas> de fundo (hex + katakana, azul Kali).
     * requestAnimationFrame sincroniza com a tela e pausa sozinho
     * quando a aba fica em segundo plano (economia de bateria).
     */
    rain(canvas) {
      if (util.reducedMotion() || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      const glyphs = '0123456789ABCDEFアカサタナハマヤラワ'.split('');
      const size = 16;   // tamanho da célula em px
      let cols = [];     // posição vertical (em células) de cada coluna
      let last = 0;      // instante do último quadro desenhado

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;   // nitidez em telas retina
        canvas.width = innerWidth * dpr;
        canvas.height = innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);     // passa a desenhar em px CSS
        cols = Array.from({ length: Math.ceil(innerWidth / size) },
          () => Math.random() * -innerHeight / size);  // começam acima da tela, escalonadas
      };

      const frame = (t) => {
        requestAnimationFrame(frame);
        if (t - last < 60) return;   // ~16 fps: sutil e leve
        last = t;
        // Retângulo semitransparente = rastro que desvanece.
        ctx.fillStyle = 'rgba(10, 14, 20, 0.18)';
        ctx.fillRect(0, 0, innerWidth, innerHeight);
        ctx.font = `${size - 2}px monospace`;
        cols.forEach((y, i) => {
          // 3% das letras saem em verde neon; o resto em azul Kali.
          ctx.fillStyle = Math.random() < 0.03 ? '#00ff9c' : '#367bf0';
          ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y * size);
          // Passou do fim da tela? Às vezes reinicia a coluna no topo.
          cols[i] = y * size > innerHeight && Math.random() > 0.975 ? 0 : y + 1;
        });
      };

      resize();
      addEventListener('resize', resize, { passive: true });
      requestAnimationFrame(frame);
    },

    /**
     * "Decifra" um texto na tela: símbolos aleatórios vão se fixando
     * da esquerda para a direita até formar o texto final.
     */
    scramble(el, finalText, duration = 700) {
      if (util.reducedMotion()) { el.textContent = finalText; return; }
      const chars = '!<>-_\\/[]{}=+*^?#01アカサ';
      const letters = [...finalText];   // [...str] separa por caractere real (emojis inclusos)
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);   // progresso 0 → 1
        const fixed = Math.floor(p * letters.length);      // quantas letras já travaram
        el.textContent = letters
          .map((c, i) => (i < fixed || c === ' ' ? c : chars[(Math.random() * chars.length) | 0]))
          .join('');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },

    /**
     * Inclinação 3D + brilho holográfico que seguem o mouse.
     * Só escreve variáveis CSS; o CSS faz o resto (separação de camadas).
     * @param {HTMLElement} surface  elemento que "sente" o mouse
     * @param {HTMLElement} target   elemento que recebe as variáveis --rx/--ry/--mx/--my
     * @param {{max?: number, skip?: () => boolean}} opts  max = graus; skip = pausa
     */
    tilt(surface, target, { max = 10, skip = () => false } = {}) {
      if (util.reducedMotion()) return;

      surface.addEventListener('pointermove', (e) => {
        // Toque (celular) não inclina; skip() permite pausar (ex.: carta aberta).
        if (e.pointerType !== 'mouse' || skip()) return;
        const r = target.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;   // 0 (esquerda) → 1 (direita)
        const y = (e.clientY - r.top) / r.height;   // 0 (topo) → 1 (base)
        target.classList.add('is-tilting');
        target.style.setProperty('--ry', `${(x - 0.5) * max * 2}deg`);
        target.style.setProperty('--rx', `${(0.5 - y) * max * 2}deg`);
        target.style.setProperty('--mx', `${x * 100}%`);
        target.style.setProperty('--my', `${y * 100}%`);
      });

      surface.addEventListener('pointerleave', () => Effects.resetTilt(target));
    },

    resetTilt(card) {
      card.classList.remove('is-tilting');
      ['--rx', '--ry', '--mx', '--my'].forEach((p) => card.style.removeProperty(p));
    },
  };


  /* ============================================================================
     Sigil — arte procedural: cada carta ganha um desenho ÚNICO e estável
     ----------------------------------------------------------------------------
     O id da carta vira um número (hash). Esse número alimenta um gerador
     pseudoaleatório: mesma carta → mesmos "sorteios" → mesmo desenho, sempre,
     em qualquer computador (inclusive depois de exportar/importar).
     O SVG é montado só com números e cores fixas — nenhum texto do usuário —
     por isso aqui é seguro usar innerHTML.
     ============================================================================ */
  const Sigil = {
    // Atributos, como os "elementos" de um card game. mark = letra do círculo.
    ATTRS: Object.freeze([
      { name: 'DADOS',  mark: 'D', color: '#367bf0' },
      { name: 'REDE',   mark: 'R', color: '#23d5e6' },
      { name: 'NÚCLEO', mark: 'N', color: '#00ff9c' },
      { name: 'SOMBRA', mark: 'S', color: '#a67cff' },
      { name: 'FOGO',   mark: 'F', color: '#ff4d6d' },
      { name: 'ÉTER',   mark: 'É', color: '#ffb86c' },
    ]),

    /**
     * FNV-1a (32 bits) + "fmix32" do MurmurHash3: texto → inteiro.
     * O FNV sozinho espalha mal os bits baixos (e o atributo usa "% 6");
     * o fmix embaralha todos os bits para a distribuição ficar uniforme.
     */
    hash(text) {
      let h = 0x811c9dc5;                    // "offset basis" oficial do FNV
      for (const ch of text) {
        h ^= ch.codePointAt(0);              // mistura o caractere (XOR)
        h = Math.imul(h, 0x01000193);        // multiplica pelo "primo FNV" em 32 bits
      }
      h ^= h >>> 16;                         // fmix32: avalanche final
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      return h >>> 0;                        // >>> 0 → inteiro sem sinal
    },

    /** Mulberry32: gerador pseudoaleatório minúsculo e determinístico (0 ≤ x < 1). */
    rng(seed) {
      let s = seed;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;   // divide por 2^32
      };
    },

    /** Identidade da carta: atributo, número de série e semente do desenho. */
    profile(card) {
      const seed = this.hash(card.id);
      return {
        seed,
        attr: this.ATTRS[seed % this.ATTRS.length],
        serial: `CO-${seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 4)}`,
      };
    },

    /**
     * Vértices de um polígono regular centrado em (100,100).
     * Se r2 ≠ r1, alterna raios → vira uma ESTRELA de n pontas.
     */
    points(n, r1, r2 = r1, rotDeg = -90) {
      const star = r2 !== r1;
      const total = star ? n * 2 : n;
      return Array.from({ length: total }, (_, i) => {
        const r = star && i % 2 ? r2 : r1;                               // ímpar = ponta interna
        const a = (rotDeg * Math.PI) / 180 + (i * 2 * Math.PI) / total;  // ângulo em radianos
        return `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
    },

    /** Monta o SVG da carta (viewBox 200×200). */
    svg(card) {
      const rand = this.rng(this.profile(card).seed);
      const int = (min, max) => min + Math.floor(rand() * (max - min + 1));   // inteiro sorteado
      const rot = int(0, 359);
      const parts = [];

      // 1) Moldura: polígono de 5 a 8 lados (largo o bastante para conter o resto).
      parts.push(`<polygon class="sg-outer" points="${this.points(int(5, 8), 92, 92, rot)}"/>`);

      // 2) Anéis tracejados + marcas de "mostrador" — agrupados para girarem juntos.
      let ring = '';
      for (let i = 0, n = int(1, 3); i < n; i++) {
        ring += `<circle cx="100" cy="100" r="${60 - i * 10}" stroke-dasharray="${int(1, 6)} ${int(3, 10)}"/>`;
      }
      const ticks = int(12, 36);
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        ring += `<line class="sg-tick" x1="${(100 + 66 * cos).toFixed(1)}" y1="${(100 + 66 * sin).toFixed(1)}"`
              + ` x2="${(100 + 72 * cos).toFixed(1)}" y2="${(100 + 72 * sin).toFixed(1)}"/>`;
      }
      parts.push(`<g class="sg-ring">${ring}</g>`);

      // 3) Estrela central de 5 a 9 pontas.
      parts.push(`<polygon class="sg-star" points="${this.points(int(5, 9), 50, int(18, 30), rot + int(0, 40))}"/>`);

      // 4) Núcleo: olho, losango ou triângulo, com um ponto pulsante no meio.
      switch (int(0, 2)) {
        case 0:
          parts.push('<path class="sg-eye" d="M74 100 Q100 78 126 100 Q100 122 74 100Z"/>',
            '<circle class="sg-core" cx="100" cy="100" r="7"/>');
          break;
        case 1:
          parts.push(`<polygon class="sg-eye" points="${this.points(4, 20)}"/>`,
            '<circle class="sg-core" cx="100" cy="100" r="5"/>');
          break;
        default:
          parts.push(`<polygon class="sg-eye" points="${this.points(3, 24)}"/>`,
            '<circle class="sg-core" cx="100" cy="103" r="5"/>');
      }

      return `<svg class="sigil" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
    },
  };


  /* ============================================================================
     App — estado, regras e interface
     ============================================================================ */
  const App = {
    /* ---------- Estado (única fonte da verdade) ---------- */
    state: {
      cards: [],          // cartas (cabeçalhos; conteúdo continua cifrado no banco)
      current: null,      // carta selecionada
      key: null,          // CryptoKey da carta aberta (só em memória!)
      busy: false,        // true enquanto a senha está sendo testada
      urls: new Set(),    // object URLs criadas → revogadas ao selar (libera RAM)
      lockAt: 0,          // instante do bloqueio automático
      ticker: 0,          // id do setInterval do cronômetro
      duelOpen: false,    // true quando uma carta está em foco (camada sobre a mesa)
      closing: false,     // true durante a animação de volta à mesa
      blocked: false,     // true se o ambiente não permite usar o cofre
    },

    /* ---------- Referências de DOM (buscadas uma única vez) ---------- */
    ui: {},

    /* ======================== INICIALIZAÇÃO ======================== */
    async init() {
      this.cacheDom();
      Term.el = this.ui.log;
      Effects.rain(this.ui.rain);
      // A carta em foco só inclina enquanto está selada.
      Effects.tilt(this.ui.scene, this.ui.card, { skip: () => this.ui.card.dataset.state === 'open' });
      this.setFaces(false);
      Term.print('iniciando carta-oculta…');

      // Web Crypto e IndexedDB exigem "contexto seguro": https://, http://localhost
      // ou arquivo local (file://). Um IP da rede (http://192.168…) NÃO serve.
      const secure = window.isSecureContext && !!window.crypto?.subtle;
      this.setChip(this.ui.chipSecure, secure ? 'cripto: ativa' : 'cripto: bloqueada', secure);
      if (!secure) {
        this.fatal('contexto inseguro: abra por arquivo local, http://localhost ou https (veja o LEIAME)');
        return;
      }
      if (!window.indexedDB) {
        this.fatal('IndexedDB indisponível (janela anônima do Firefox/Safari antigo?)');
        return;
      }

      try {
        await Vault.open();
        this.state.cards = await Vault.allCards();
        this.sortCards();
        Term.print(`cofre aberto · ${this.state.cards.length} carta(s) no baralho`, 'ok');
      } catch (err) {
        this.fatal(`falha ao abrir o cofre: ${err?.message ?? err}`);
        return;
      }

      this.bindEvents();
      this.renderDeck({ deal: 'all' });   // "distribui" as cartas na mesa, uma a uma
      this.updateStorage();
      Term.print('pronto. clique numa carta da mesa ou forje uma nova.', 'ok');
    },

    // Erro que impede o uso: avisa e desliga os botões que dependem do cofre.
    fatal(msg) {
      Term.print(msg, 'error');
      [this.ui.btnNew, this.ui.btnImport, this.ui.btnExport].forEach((b) => { b.disabled = true; });
      this.state.blocked = true;
      this.renderDeck();   // mostra a mesa com o espaço "forjar" desativado
    },

    cacheDom() {
      const ids = [
        'rain', 'scene', 'card', 'front', 'back', 'log', 'items', 'composer', 'note',
        'deck-list', 'deck-empty', 'front-title', 'front-meta',
        'topbar', 'layout', 'field', 'field-count', 'duel', 'duel-close',
        'front-art', 'front-level', 'front-kicker',
        'back-title', 'unlock-form', 'unlock-btn', 'unlock-pass', 'lock-timer',
        'file-input', 'btn-attach', 'btn-new', 'btn-lock', 'btn-delete-card',
        'btn-export', 'btn-import', 'import-input', 'chip-secure', 'chip-storage',
        'dlg-new', 'new-form', 'new-pass', 'strength', 'strength-label',
        'dlg-view', 'view-img', 'view-caption',
      ];
      for (const id of ids) {
        // "deck-list" → ui.deckList (kebab-case → camelCase via regex).
        const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        this.ui[key] = document.getElementById(id);
        if (!this.ui[key]) throw new Error(`elemento #${id} não encontrado no HTML`);
      }
    },

    // Ordem de criação: cada carta nova entra na PRÓXIMA posição da mesa
    // (à direita) e a numeração romana de cada uma nunca muda.
    sortCards() {
      this.state.cards.sort((a, b) => a.createdAt - b.createdAt);
    },

    /* ========================== EVENTOS ========================== */
    bindEvents() {
      const { ui } = this;   // desestruturação: "ui.x" em vez de "this.ui.x"

      // Delegação de eventos: UM ouvinte na lista atende todos os botões,
      // inclusive os criados depois. closest() acha o botão clicado.
      ui.deckList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-id]');
        if (btn) this.select(btn.dataset.id);
      });

      // ----- Mesa: clique numa carta abre; no espaço vazio, forja outra -----
      ui.field.addEventListener('click', (e) => {
        if (e.target.closest('.slot-new')) { this.openNewDialog(); return; }
        const tile = e.target.closest('.tcg');
        if (tile) this.select(tile.dataset.id);
      });

      // ----- Carta em foco: fechar pelo botão ou clicando no fundo escuro -----
      ui.duelClose.addEventListener('click', () => this.closeDuel());
      ui.duel.addEventListener('click', (e) => { if (e.target === ui.duel) this.closeDuel(); });

      // ----- Nova carta -----
      ui.btnNew.addEventListener('click', () => this.openNewDialog());
      ui.newPass.addEventListener('input', (e) => this.paintStrength(e.target.value));
      ui.newForm.addEventListener('submit', (e) => this.onCreate(e));

      // ----- Backup -----
      ui.btnExport.addEventListener('click', () => this.exportVault());
      ui.btnImport.addEventListener('click', () => ui.importInput.click());
      ui.importInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';   // permite importar o mesmo arquivo de novo
        if (file) await this.importVault(file);
      });

      // ----- Abrir -----
      ui.unlockForm.addEventListener('submit', (e) => {
        e.preventDefault();   // impede o navegador de recarregar a página
        this.unlock(ui.unlockPass.value);
      });

      // ----- Selar / queimar -----
      ui.btnLock.addEventListener('click', () => this.lock('selada manualmente'));
      ui.btnDeleteCard.addEventListener('click', (e) =>
        this.armThen(e.currentTarget, () => this.burnCard()));

      // ----- Compositor -----
      ui.composer.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addText(ui.note.value);
      });
      // Ctrl+Enter (ou ⌘+Enter no Mac) também grava.
      ui.note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.addText(ui.note.value);
        }
      });

      // Botão "anexar" aciona o <input type=file> invisível.
      ui.btnAttach.addEventListener('click', () => ui.fileInput.click());
      ui.fileInput.addEventListener('change', async (e) => {
        const files = [...e.target.files];   // copia ANTES de limpar o input
        e.target.value = '';                 // permite escolher o mesmo arquivo de novo
        await this.addFiles(files);
      });

      // ----- Arrastar e soltar -----
      // Sem isto, soltar um arquivo fora da carta faz o navegador ABRIR o
      // arquivo e sair da página.
      ['dragover', 'drop'].forEach((type) =>
        addEventListener(type, (e) => e.preventDefault()));

      let depth = 0;   // contador evita "piscar" ao passar sobre elementos filhos
      ui.scene.addEventListener('dragenter', () => {
        if (!this.state.key) return;
        depth++;
        ui.back.classList.add('is-dragging');
      });
      ui.scene.addEventListener('dragleave', () => {
        if (--depth <= 0) { depth = 0; ui.back.classList.remove('is-dragging'); }
      });
      ui.scene.addEventListener('drop', (e) => {
        depth = 0;
        ui.back.classList.remove('is-dragging');
        this.addFiles(e.dataTransfer?.files);
      });

      // ----- Colar (Ctrl+V) imagens/arquivos com a carta aberta -----
      document.addEventListener('paste', (e) => {
        if (!this.state.key) return;
        const files = e.clipboardData?.files;   // ?. evita erro se não existir
        if (files?.length) { e.preventDefault(); this.addFiles(files); }
      });

      // ----- Ações dentro da grade (delegação) -----
      ui.items.addEventListener('click', (e) => {
        const del = e.target.closest('.item-del');
        if (del) { this.armThen(del, () => this.removeItem(del.dataset.id)); return; }
        const img = e.target.closest('.item-img');
        if (img) this.view(img.src, img.alt);
      });

      // Fechar o visualizador clicando fora da imagem (no fundo escuro).
      ui.dlgView.addEventListener('click', (e) => { if (e.target === ui.dlgView) ui.dlgView.close(); });

      // Qualquer interação com a carta aberta adia o bloqueio automático.
      ['pointerdown', 'keydown', 'wheel', 'input'].forEach((type) =>
        ui.card.addEventListener(type, () => this.bumpLock(), { passive: true }));

      // Esc em camadas: carta aberta → sela; carta selada → volta à mesa.
      // Com um <dialog> aberto, o próprio dialog trata o Esc.
      // Com rascunho no campo de texto, o 1º Esc só tira o foco (evita perder a nota).
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !this.state.duelOpen || document.querySelector('dialog[open]')) return;
        if (!this.state.key) { this.closeDuel(); return; }
        if (e.target === ui.note && ui.note.value.trim()) { ui.note.blur(); return; }
        this.lock('selada via Esc');
      });

      // Aba voltou do segundo plano: confere o prazo de bloqueio na hora.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.state.key) this.tick();
      });

      // Fechar/recarregar a aba descarta chave e conteúdo decifrado.
      addEventListener('pagehide', () => this.lock());
    },

    /* ====================== BARALHO + MESA ====================== */

    /**
     * Redesenha a lista lateral e a mesa.
     * @param {{deal?: 'all'|string}} opts  deal = anima a entrada de todas
     *        as cartas ('all') ou só da carta com esse id.
     */
    renderDeck({ deal } = {}) {
      this.renderList();
      this.renderField(deal);
      this.ui.btnExport.disabled = this.state.blocked || this.state.cards.length === 0;
    },

    renderList() {
      const { cards, current } = this.state;
      const frag = document.createDocumentFragment();   // monta fora do DOM → 1 só repintura

      cards.forEach((card, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'deck-item';
        btn.dataset.id = card.id;
        btn.setAttribute('aria-current', String(card.id === current?.id));
        btn.style.setProperty('--attr', Sigil.profile(card).attr.color);

        const glyph = document.createElement('span');
        glyph.className = 'deck-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = util.roman(i);   // numeração de tarô, estável

        const info = document.createElement('span');
        info.className = 'deck-info';
        const name = document.createElement('span');
        name.className = 'deck-name';
        name.textContent = card.title;
        const meta = document.createElement('span');
        meta.className = 'deck-meta';
        meta.textContent = `${card.itemCount} frag · ${util.date(card.updatedAt)}`;

        info.append(name, meta);
        btn.append(glyph, info);
        li.append(btn);
        frag.append(li);
      });

      this.ui.deckList.replaceChildren(frag);   // troca tudo de uma vez
      this.ui.deckEmpty.hidden = cards.length > 0;
    },

    /** Mesa: todas as cartas lado a lado + um espaço vazio para forjar outra. */
    renderField(deal) {
      const { cards, current, duelOpen, blocked } = this.state;
      const frag = document.createDocumentFragment();

      cards.forEach((card, i) => {
        const tile = this.buildTile(card, i);
        if (deal === 'all' || deal === card.id) {
          tile.classList.add('deal');
          tile.style.setProperty('--i', deal === 'all' ? i : 0);   // atraso escalonado
          // Terminou a entrada? Remove a classe (só o evento da PRÓPRIA carta conta).
          tile.addEventListener('animationend', (e) => {
            if (e.target === tile) tile.classList.remove('deal');
          });
        }
        if (duelOpen && current?.id === card.id) tile.classList.add('is-lifted');
        frag.append(tile);
      });

      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'slot-new';
      slot.disabled = blocked;
      slot.innerHTML = '<strong aria-hidden="true">+</strong><span>forjar carta</span>';   // texto fixo
      frag.append(slot);

      this.ui.field.replaceChildren(frag);
      const n = cards.length;
      this.ui.fieldCount.textContent = n
        ? `${n} carta${n > 1 ? 's' : ''} em jogo`
        : 'mesa vazia — forje sua primeira carta';
    },

    /**
     * Carta da mesa no estilo card game:
     * nome + atributo · nível · arte · tipo · texto · série e FRAG.
     */
    buildTile(card, index) {
      const { attr, serial } = Sigil.profile(card);
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tcg';
      tile.dataset.id = card.id;
      tile.style.setProperty('--attr', attr.color);
      tile.setAttribute('aria-label', `Carta ${card.title}, ${card.itemCount} fragmento(s). Abrir`);

      // Esqueleto fixo (sem dados do usuário) + arte procedural (só números).
      tile.innerHTML =
          '<span class="tcg-frame">'
        +   '<span class="tcg-head"><span class="tcg-name"></span><span class="tcg-attr"></span></span>'
        +   '<span class="tcg-level"></span>'
        +   `<span class="tcg-art">${Sigil.svg(card)}</span>`
        +   '<span class="tcg-type"></span>'
        +   '<span class="tcg-text"></span>'
        +   '<span class="tcg-stats"><span class="tcg-serial"></span><span>FRAG/<b></b></span></span>'
        + '</span>';

      // Tudo que vem do usuário entra por textContent → nunca vira HTML (anti-XSS).
      const part = (sel) => tile.querySelector(sel);
      part('.tcg-name').textContent = card.title;
      part('.tcg-attr').textContent = attr.mark;
      part('.tcg-attr').title = attr.name;
      const level = part('.tcg-level');
      level.textContent = util.stars(card.itemCount);
      level.classList.toggle('is-empty', !card.itemCount);
      part('.tcg-type').textContent = `[ ARCANO ${util.roman(index)} / ${attr.name} ]`;
      part('.tcg-text').textContent =
        `Forjada em ${util.date(card.createdAt)}. Guarda ${card.itemCount} fragmento(s) selado(s) com AES-256-GCM.`;
      part('.tcg-serial').textContent = serial;
      part('.tcg-stats b').textContent = String(card.itemCount);

      Effects.tilt(tile, tile, { max: 14 });
      return tile;
    },

    tileOf(id) {
      // CSS.escape protege o seletor contra caracteres especiais no id.
      return this.ui.field.querySelector(`.tcg[data-id="${CSS.escape(id)}"]`);
    },

    openNewDialog() {
      if (this.state.blocked) return;
      this.ui.newForm.reset();
      this.paintStrength('');
      this.ui.dlgNew.showModal();
    },

    /* ====================== CARTA EM FOCO ====================== */
    select(id) {
      const card = this.state.cards.find((c) => c.id === id);
      if (!card || this.state.duelOpen) return;
      this.state.current = card;
      this.openDuel(card);
      Term.print(`carta "${card.title}" em foco`);
    },

    openDuel(card) {
      const { ui, state } = this;
      const tile = this.tileOf(card.id);
      state.duelOpen = true;
      // inert: a mesa e a barra ficam "congeladas" (sem foco nem clique) por trás.
      ui.layout.inert = true;
      ui.topbar.inert = true;
      ui.duel.hidden = false;
      this.showSealed(card);
      tile?.classList.add('is-lifted');   // o lugar na mesa fica "vazio"
      this.renderList();                  // destaca a carta na lista lateral
      this.fly(tile);                     // a carta sai da mesa e vem ao centro
    },

    /**
     * Volta a carta para a mesa. Sempre sela antes (a chave sai da memória).
     * @param {{instant?: boolean}} opts  instant = sem animação (usado ao queimar)
     */
    async closeDuel({ instant = false } = {}) {
      const { ui, state } = this;
      if (!state.duelOpen || state.closing) return;
      state.closing = true;
      this.lock();
      const tile = state.current && this.tileOf(state.current.id);
      const anim = instant ? null : this.fly(tile, { back: true });
      // Espera a animação, mas nunca mais que 600 ms (aba lenta não trava o fechamento).
      if (anim) await Promise.race([anim.finished.catch(() => {}), util.wait(600)]);
      ui.duel.hidden = true;
      anim?.cancel();                     // limpa o estado final da animação
      tile?.classList.remove('is-lifted');
      ui.layout.inert = false;
      ui.topbar.inert = false;
      Object.assign(state, { duelOpen: false, closing: false, current: null });
      this.renderList();
      tile?.focus({ preventScroll: true });   // foco volta para a carta (teclado)
    },

    /**
     * Técnica FLIP (First, Last, Invert, Play): mede onde a carta está na mesa
     * e onde fica no centro, e anima a diferença. Resultado: parece a MESMA
     * carta viajando, embora sejam dois elementos diferentes.
     * @returns {Animation|null}
     */
    fly(tile, { back = false } = {}) {
      if (!tile || util.reducedMotion()) return null;
      const a = tile.getBoundingClientRect();           // posição na mesa
      const b = this.ui.scene.getBoundingClientRect();  // posição no centro
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const scale = a.width / b.width;
      const onTable = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.35 };
      const inFocus = { transform: 'none', opacity: 1 };
      return this.ui.scene.animate(back ? [inFocus, onTable] : [onTable, inFocus], {
        duration: back ? 380 : 560,
        easing: 'cubic-bezier(.2, .85, .25, 1)',
        fill: back ? 'forwards' : 'none',   // na volta, fica "pousada" até sumir
      });
    },

    showSealed(card) {
      const { ui } = this;
      const { attr } = Sigil.profile(card);
      ui.card.dataset.state = 'sealed';
      this.setFaces(false);
      ui.card.style.setProperty('--attr', attr.color);   // a carta grande herda a cor
      ui.frontArt.innerHTML = Sigil.svg(card);            // mesmo desenho da mesa
      ui.frontKicker.textContent = `ARCANO ${util.roman(this.state.cards.indexOf(card))} · ${attr.name}`;
      ui.frontTitle.textContent = card.title;
      this.paintFrontMeta();
      ui.unlockPass.value = '';
      // preventScroll: foca sem "pular" a página no celular.
      ui.unlockPass.focus({ preventScroll: true });
    },

    paintFrontMeta() {
      const c = this.state.current;
      if (!c) return;
      this.ui.frontMeta.textContent = `${c.itemCount} fragmento(s) · forjada em ${util.date(c.createdAt)}`;
      this.ui.frontLevel.textContent = util.stars(c.itemCount);
      this.ui.frontLevel.classList.toggle('is-empty', !c.itemCount);
    },

    /**
     * inert = a face escondida não recebe foco, clique nem leitor de tela.
     * Assim o Tab não "cai" em campos da face virada.
     */
    setFaces(open) {
      this.ui.front.inert = open;
      this.ui.back.inert = !open;
    },

    /* ======================= CRIAR CARTA ======================= */
    paintStrength(pass) {
      const s = util.strength(pass);
      this.ui.strength.value = pass ? s.score + 0.001 : 0;   // +0.001 mostra a barra mesmo com nota 0
      this.ui.strengthLabel.textContent = pass ? `força: ${s.label} (~${s.bits} bits)` : 'força: —';
    },

    async onCreate(e) {
      // e.submitter = botão que disparou o envio (cancelar ou forjar).
      if (e.submitter?.value !== 'create') return;   // cancelar: o <dialog> fecha sozinho
      e.preventDefault();                            // mantém aberto até validar

      const form = this.ui.newForm;
      const data = new FormData(form);
      const title = String(data.get('title') ?? '').trim();
      const pass = String(data.get('pass') ?? '');
      const confirm = String(data.get('confirm') ?? '');
      const confirmInput = form.elements.namedItem('confirm');

      if (!title) {
        Term.print('codinome vazio', 'warn');
        form.elements.namedItem('title').focus();
        return;
      }
      if (pass !== confirm) {
        // setCustomValidity mostra o balão nativo de erro do navegador.
        confirmInput.setCustomValidity('As senhas não coincidem');
        confirmInput.reportValidity();
        confirmInput.addEventListener('input', () => confirmInput.setCustomValidity(''), { once: true });
        Term.print('as senhas não coincidem', 'error');
        return;
      }

      this.ui.dlgNew.close();
      this.ui.btnNew.disabled = true;   // evita forjar duas vezes durante o PBKDF2
      Term.print(`derivando chave (PBKDF2 × ${CONFIG.PBKDF2_ITERATIONS.toLocaleString('pt-BR')})…`, 'crypt');

      try {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await Cipher.deriveKey(pass, salt);
        const now = Date.now();
        const card = {
          id: util.uid(),
          title,
          salt,
          // "verifier": texto conhecido cifrado. Se decifrar, a senha está certa.
          verifier: await Cipher.encrypt(key, encoder.encode(CONFIG.VERIFIER)),
          itemCount: 0,
          createdAt: now,
          updatedAt: now,
        };

        await Vault.putCard(card);
        this.state.cards.push(card);   // entra na próxima posição da mesa (à direita)
        Term.print(`carta "${title}" forjada e selada`, 'ok');
        this.requestPersistence();
        this.updateStorage();

        // 1) a carta "voa" do baralho e pousa na mesa…
        this.renderDeck({ deal: card.id });
        this.tileOf(card.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await util.wait(util.reducedMotion() ? 0 : 780);
        // 2) …depois vem ao centro e já abre (o usuário acabou de digitar a senha).
        this.select(card.id);
        if (this.state.current === card) await this.open(key);
      } catch (err) {
        Term.print(`não foi possível forjar: ${err?.message ?? err}`, 'error');
      } finally {
        this.ui.btnNew.disabled = false;
      }
    },

    // Pede ao navegador para não apagar o cache quando faltar espaço em disco.
    async requestPersistence() {
      try {
        if (await navigator.storage?.persisted?.()) return;
        const ok = await navigator.storage?.persist?.();
        if (ok) Term.print('armazenamento persistente concedido', 'ok');
      } catch { /* file:// e alguns navegadores não suportam: tudo bem */ }
    },

    /* ==================== ABRIR / SELAR ==================== */
    async unlock(pass) {
      const { ui, state } = this;
      const card = state.current;
      if (!card || !pass || state.busy || state.key) return;
      state.busy = true;
      ui.unlockBtn.disabled = true;
      Term.print('derivando chave…', 'crypt');

      try {
        const key = await Cipher.deriveKey(pass, card.salt);
        const check = decoder.decode(await Cipher.decrypt(key, card.verifier));
        if (check !== CONFIG.VERIFIER) throw new Error('verificador inválido');
        // O usuário trocou de carta durante o cálculo? Não abre a errada.
        if (state.current !== card) return;
        ui.unlockPass.value = '';
        await this.open(key);
      } catch {
        // Chave errada → AES-GCM lança OperationError → senha incorreta.
        Term.print('acesso negado: frase-senha incorreta', 'error');
        ui.card.classList.remove('is-denied');
        void ui.card.offsetWidth;          // força reflow → reinicia a animação
        ui.card.classList.add('is-denied');
        ui.unlockPass.select();
      } finally {
        // finally roda com sucesso OU erro: o botão sempre volta.
        state.busy = false;
        ui.unlockBtn.disabled = false;
      }
    },

    async open(key) {
      const { ui, state } = this;
      state.key = key;
      Effects.resetTilt(ui.card);
      ui.card.dataset.state = 'open';     // o CSS gira a carta
      this.setFaces(true);
      Effects.scramble(ui.backTitle, state.current.title);
      Term.print('carta revelada', 'ok');
      this.bumpLock();
      clearInterval(state.ticker);
      state.ticker = setInterval(() => this.tick(), 250);
      this.tick();
      await this.renderItems();
      await util.wait(400);               // espera o giro para focar
      if (state.key === key) ui.note.focus({ preventScroll: true });
    },

    /** Sela a carta: apaga chave, conteúdo decifrado e URLs da memória. */
    lock(reason) {
      const { ui, state } = this;
      if (!state.key) return;
      state.key = null;
      clearInterval(state.ticker);
      if (ui.dlgView.open) ui.dlgView.close();
      ui.viewImg.removeAttribute('src');
      state.urls.forEach((u) => URL.revokeObjectURL(u));   // libera os blobs da RAM
      state.urls.clear();
      ui.items.replaceChildren();                           // remove o texto claro do DOM
      ui.note.value = '';
      ui.card.dataset.state = 'sealed';
      this.setFaces(false);
      this.paintFrontMeta();
      if (reason) Term.print(reason, 'warn');
    },

    bumpLock() {
      if (this.state.key) this.state.lockAt = Date.now() + CONFIG.AUTO_LOCK_MS;
    },

    tick() {
      const left = this.state.lockAt - Date.now();
      this.ui.lockTimer.textContent = util.clock(left);
      this.ui.lockTimer.classList.toggle('is-low', left < 20_000);   // vermelho nos últimos 20 s
      if (left <= 0) this.lock('bloqueio automático por inatividade');
    },

    /* ==================== FRAGMENTOS ==================== */
    async renderItems() {
      const { state, ui } = this;
      const card = state.current;
      const key = state.key;
      ui.composer.inert = true;   // bloqueia o compositor enquanto decifra

      try {
        const records = await Vault.itemsOf(card.id);
        if (state.key !== key) return;   // selada no meio do caminho → aborta
        if (!records.length) { this.renderEmptyItems(); return; }

        Term.print(`decifrando ${records.length} fragmento(s)…`, 'crypt');
        // allSettled: decifra tudo em paralelo e não para se UM item falhar.
        const results = await Promise.allSettled(records.map(async (rec) => ({
          id: rec.id,
          meta: await Cipher.decryptJSON(key, rec.meta),
          body: await Cipher.decrypt(key, rec.body),
        })));
        if (state.key !== key) return;

        const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
        ok.sort((a, b) => b.meta.createdAt - a.meta.createdAt);   // recentes no topo
        const frag = document.createDocumentFragment();
        ok.forEach((it) => frag.append(this.buildItem(it)));
        ui.items.replaceChildren(frag);

        const broken = results.length - ok.length;
        if (broken) Term.print(`${broken} fragmento(s) corrompido(s) ignorado(s)`, 'warn');
      } catch (err) {
        Term.print(`erro ao ler fragmentos: ${err?.message ?? err}`, 'error');
      } finally {
        ui.composer.inert = false;
      }
    },

    renderEmptyItems() {
      const p = document.createElement('p');
      p.className = 'items-empty';
      p.textContent = 'carta vazia. escreva, cole ou arraste algo para selar aqui.';
      this.ui.items.replaceChildren(p);
    },

    /** Cria o elemento visual de um fragmento já decifrado. */
    buildItem({ id, meta, body }) {
      const fig = document.createElement('figure');
      fig.className = 'item';
      fig.dataset.type = meta.type;
      fig.dataset.id = id;

      // Cabeçalho: tipo · nome · tamanho · data · botão apagar
      const head = document.createElement('div');
      head.className = 'item-head';
      const tag = document.createElement('span');
      tag.className = 'item-tag';
      tag.textContent = { text: 'nota', image: 'imagem', file: 'arquivo' }[meta.type] ?? meta.type;
      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = `${meta.name} · ${util.bytes(meta.size)} · ${util.date(meta.createdAt)}`;
      name.title = meta.name;   // nome completo no "tooltip"
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'item-del';
      del.dataset.id = id;
      del.textContent = '✕';
      del.setAttribute('aria-label', `Apagar ${meta.name}`);
      head.append(tag, name, del);
      fig.append(head);

      if (meta.type === 'text') {
        const p = document.createElement('p');
        p.className = 'item-text';
        p.textContent = decoder.decode(body);   // textContent = sem risco de XSS
        fig.append(p);
        return fig;
      }

      // Imagens e arquivos: bytes → Blob → URL temporária "blob:" só na memória.
      const url = URL.createObjectURL(new Blob([body], { type: meta.mime || 'application/octet-stream' }));
      this.state.urls.add(url);   // registrada para ser revogada ao selar
      fig.dataset.url = url;

      if (meta.type === 'image') {
        const img = document.createElement('img');
        img.className = 'item-img';
        img.src = url;
        img.alt = meta.name;
        img.decoding = 'async';   // decodifica fora da thread principal
        // Formato que o navegador não exibe (ex.: HEIC)? Vira link de download.
        img.addEventListener('error', () => img.replaceWith(this.fileLink(url, meta.name)), { once: true });
        fig.append(img);
      } else {
        fig.append(this.fileLink(url, meta.name));
      }
      return fig;
    },

    fileLink(url, name) {
      const a = document.createElement('a');
      a.className = 'item-file';
      a.href = url;
      a.download = name;   // baixa com o nome original
      a.textContent = `⤓ baixar ${name}`;
      return a;
    },

    /** Cifra e grava um novo fragmento. Ponto único de escrita. */
    async addItem(meta, bytes) {
      const { state, ui } = this;
      const key = state.key;
      const card = state.current;
      if (!key || !card) return false;

      const fullMeta = { ...meta, size: bytes.byteLength, createdAt: Date.now() };
      // Os metadados (inclusive o nome do arquivo) também são cifrados.
      const item = {
        id: util.uid(),
        cardId: card.id,
        meta: await Cipher.encryptJSON(key, fullMeta),
        body: await Cipher.encrypt(key, bytes),
      };

      // Atualiza uma CÓPIA; só aplica no estado se o banco confirmar.
      const next = { ...card, itemCount: card.itemCount + 1, updatedAt: Date.now() };
      try {
        await Vault.addItem(next, item);
      } catch (err) {
        const full = err?.name === 'QuotaExceededError';
        Term.print(full ? 'sem espaço no cache do navegador' : `erro ao gravar: ${err?.message ?? err}`, 'error');
        return false;
      }
      Object.assign(card, next);
      this.renderDeck();
      this.updateStorage();
      Term.print(`fragmento "${fullMeta.name}" cifrado (${util.bytes(fullMeta.size)})`, 'ok');

      // Se a carta ainda estiver aberta, mostra só o novo item no topo.
      if (state.key === key) {
        ui.items.querySelector('.items-empty')?.remove();
        ui.items.prepend(this.buildItem({ id: item.id, meta: fullMeta, body: bytes }));
        ui.items.scrollTop = 0;
        this.bumpLock();
      }
      return true;
    },

    async addText(raw) {
      const text = raw.trim();
      if (!text || !this.state.key) return;
      // Nome da nota = primeiros 24 caracteres da primeira linha.
      const name = text.split('\n')[0].slice(0, 24) || 'nota';
      if (await this.addItem({ type: 'text', name, mime: 'text/plain' }, encoder.encode(text))) {
        this.ui.note.value = '';
      }
    },

    async addFiles(fileList) {
      const files = Array.from(fileList ?? []);   // FileList → array de verdade
      if (!files.length) return;
      if (!this.state.key) { Term.print('abra a carta antes de anexar', 'warn'); return; }

      for (const file of files) {
        if (!this.state.key) break;   // selou no meio: para
        if (file.size > CONFIG.MAX_FILE_BYTES) {
          Term.print(`"${file.name}" excede ${util.bytes(CONFIG.MAX_FILE_BYTES)} — ignorado`, 'warn');
          continue;
        }
        try {
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          // Imagens coladas chegam como "image.png": damos um nome único.
          const ext = (file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
          const name = file.name && file.name !== `image.${ext}` && file.name !== 'image.png'
            ? file.name
            : `colado-${Date.now()}.${ext}`;
          Term.print(`cifrando "${name}"…`, 'crypt');
          await this.addItem({ type, name, mime: file.type }, await file.arrayBuffer());
        } catch (err) {
          Term.print(`não foi possível ler "${file.name}": ${err?.message ?? err}`, 'error');
        }
      }
    },

    async removeItem(id) {
      const card = this.state.current;
      if (!card || !this.state.key) return;
      const next = { ...card, itemCount: Math.max(0, card.itemCount - 1), updatedAt: Date.now() };
      try {
        await Vault.removeItem(next, id);
      } catch (err) {
        Term.print(`erro ao apagar: ${err?.message ?? err}`, 'error');
        return;
      }
      Object.assign(card, next);

      // CSS.escape protege o seletor contra caracteres especiais no id.
      const el = this.ui.items.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
      if (el?.dataset.url) {
        URL.revokeObjectURL(el.dataset.url);
        this.state.urls.delete(el.dataset.url);
      }
      el?.remove();
      if (!this.ui.items.querySelector('.item')) this.renderEmptyItems();
      this.renderDeck();
      this.updateStorage();
      Term.print('fragmento destruído', 'warn');
    },

    async burnCard() {
      const card = this.state.current;
      if (!card) return;
      try {
        await Vault.burn(card.id);
      } catch (err) {
        Term.print(`erro ao queimar: ${err?.message ?? err}`, 'error');
        return;
      }
      const tile = this.tileOf(card.id);
      await this.closeDuel({ instant: true });   // sela e some da tela na hora
      this.state.cards = this.state.cards.filter((c) => c.id !== card.id);
      Term.print(`carta "${card.title}" queimada — irrecuperável`, 'error');
      // A carta pega fogo na mesa antes de sumir.
      if (tile && !util.reducedMotion()) {
        tile.classList.add('is-burning');
        await util.wait(850);
      }
      this.renderDeck();
      this.updateStorage();
    },

    /* ==================== BACKUP ==================== */

    /**
     * Exporta o cofre inteiro para um .json. O conteúdo continua CIFRADO:
     * o arquivo só serve para quem souber as senhas.
     */
    async exportVault() {
      try {
        const { cards, items } = await Vault.dump();
        const payload = {
          app: CONFIG.APP_ID,
          format: 2,
          exportedAt: new Date().toISOString(),
          cards: Codec.pack(cards),
          items: Codec.pack(items),
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const day = new Date().toISOString().slice(0, 10);   // AAAA-MM-DD
        util.download(blob, `carta-oculta-backup-${day}.json`);
        Term.print(`backup exportado: ${cards.length} carta(s), ${items.length} fragmento(s), ${util.bytes(blob.size)}`, 'ok');
      } catch (err) {
        Term.print(`falha ao exportar: ${err?.message ?? err}`, 'error');
      }
    },

    async importVault(file) {
      Term.print(`lendo backup "${file.name}"…`);
      try {
        const data = JSON.parse(await file.text());
        // Validação: só aceita arquivos gerados por este app.
        if (data?.app !== CONFIG.APP_ID || !Array.isArray(data.cards) || !Array.isArray(data.items)) {
          throw new Error('arquivo não é um backup da Carta Oculta');
        }
        const cards = Codec.unpack(data.cards).filter((c) =>
          typeof c?.id === 'string' && typeof c.title === 'string' && c.salt && c.verifier?.iv);
        const ids = new Set(cards.map((c) => c.id));
        // Descarta fragmentos órfãos (sem carta correspondente no backup).
        const items = Codec.unpack(data.items).filter((i) =>
          typeof i?.id === 'string' && ids.has(i.cardId) && i.meta?.iv && i.body?.iv);
        if (!cards.length) throw new Error('backup sem cartas válidas');

        await Vault.restore(cards, items);
        // Recalcula contadores (a carta pode já existir aqui com outros itens).
        for (const c of cards) {
          c.itemCount = await Vault.countItems(c.id);
          c.updatedAt ??= Date.now();
          await Vault.putCard(c);
        }

        // (A importação só é possível com a mesa visível, ou seja, nenhuma carta aberta.)
        this.state.cards = await Vault.allCards();
        this.sortCards();
        this.renderDeck({ deal: 'all' });   // redistribui a mesa
        this.updateStorage();
        this.requestPersistence();
        Term.print(`backup importado: ${cards.length} carta(s), ${items.length} fragmento(s)`, 'ok');
      } catch (err) {
        Term.print(`falha ao importar: ${err?.message ?? err}`, 'error');
      }
    },

    /* ==================== AUXILIARES DE UI ==================== */

    /**
     * Confirmação em dois cliques, sem janela bloqueante:
     * o 1º clique "arma" o botão por 3 s; o 2º executa.
     */
    armThen(btn, action) {
      if (btn.dataset.armed) {
        clearTimeout(Number(btn.dataset.armed));
        delete btn.dataset.armed;
        btn.textContent = btn.dataset.label;
        action();
        return;
      }
      btn.dataset.label = btn.textContent;
      btn.textContent = btn.classList.contains('item-del') ? 'confirmar?' : 'certeza?';
      btn.dataset.armed = String(setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = btn.dataset.label;
      }, 3000));
    },

    view(src, caption) {
      this.ui.viewImg.src = src;
      this.ui.viewImg.alt = caption;
      this.ui.viewCaption.textContent = caption;
      this.ui.dlgView.showModal();
    },

    setChip(el, text, ok) {
      el.textContent = text;
      el.dataset.ok = String(ok);
    },

    /** Mostra quanto do cache o site está usando (Storage API). */
    async updateStorage() {
      try {
        const est = await navigator.storage?.estimate?.();
        if (!est) return;
        this.setChip(this.ui.chipStorage, `cache: ${util.bytes(est.usage)} / ${util.bytes(est.quota)}`, true);
      } catch { /* não suportado: o chip fica como está */ }
    },
  };


  /* ============================================================================
     BOOT
     O script usa "defer", então o HTML já está pronto quando isto roda.
     O catch mostra qualquer falha inesperada no terminal e no console.
     ============================================================================ */
  App.init().catch((err) => {
    console.error(err);
    Term.print(`erro fatal: ${err?.message ?? err}`, 'error');
  });
})();
