// Ao voltar de uma atividade, destaca o link correspondente para navegação por teclado.
// Os links e o conteúdo do portal funcionam mesmo sem JavaScript.
(() => {
  let anterior;
  try { anterior = new URL(document.referrer); } catch { return; }
  if (anterior.origin !== location.origin) return;
  const links = document.querySelectorAll('.project-link');
  for (const link of links) {
    if (new URL(link.href).pathname === anterior.pathname) {
      link.focus({ preventScroll: true });
      break;
    }
  }
})();
