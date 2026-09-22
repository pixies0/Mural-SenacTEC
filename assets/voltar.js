// Shadow DOM mantém o atalho isolado dos estilos de cada atividade.
(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483647';
  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = `<style>a{display:block;background:#102944;color:white;border:1px solid #7293b0;border-radius:100px;padding:10px 16px;font:600 14px/1.4 system-ui;text-decoration:none;box-shadow:0 3px 14px #0003}a:hover{background:#244767}a:focus-visible{outline:3px solid #fca34d;outline-offset:3px}</style><a href="../../index.html#projetos">← Voltar ao portal</a>`;
  document.body.append(host);
})();
