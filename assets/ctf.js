// Verificador didático estático. O código é público: não é um mecanismo antifraude.
// Não usa storage, cookies, banco de dados ou chamadas de rede.
(() => {
  const expected = { '1':'MT{BIT-10}', '2':'MT{LOG-07}', '3':'MT{INV-14}',
    '4':'MT{BIN-26}', '5':'MT{SIS-05}', '6':'MT{REQ-10}', 'final':'MT{10-07-14-26-05-10}' };
  const formats = { '1':'MT{BIT-DD}', '2':'MT{LOG-DD}', '3':'MT{INV-DD}',
    '4':'MT{BIN-DD}', '5':'MT{SIS-DD}', '6':'MT{REQ-DD}', 'final':'MT{DD-DD-DD-DD-DD-DD}' };
  const select = document.getElementById('challenge');
  const input = document.getElementById('flag');
  const feedback = document.getElementById('flag-feedback');
  const copy = document.getElementById('copy-flag');
  const copyFeedback = document.getElementById('copy-feedback');
  let verified = '';
  function clearResult() { verified=''; feedback.textContent=''; delete feedback.dataset.state; copy.hidden=true; copyFeedback.textContent=''; }
  function updateFormat() { clearResult(); input.value=''; input.placeholder=formats[select.value]; document.getElementById('flag-format').textContent='Formato: '+formats[select.value]+'. Substitua DD pelo código encontrado.'; }
  const requested = new URLSearchParams(location.search).get('desafio');
  if (Object.hasOwn(formats, requested)) select.value=requested;
  updateFormat();
  select.addEventListener('change',updateFormat);
  input.addEventListener('input',clearResult);
  document.getElementById('flag-form').addEventListener('submit',event => {
    event.preventDefault(); clearResult();
    const value=input.value.toUpperCase().replace(/\s+/g,'');
    if (!value) { feedback.dataset.state='error'; feedback.textContent='Digite sua flag antes de verificar.'; input.focus(); return; }
    if (value !== expected[select.value]) { feedback.dataset.state='error'; feedback.textContent='Flag não conferida. Revise o código, o formato e a estação selecionada.'; return; }
    verified=value; input.value=value; feedback.dataset.state='success';
    feedback.textContent=(select.value==='final' ? 'Sistema restaurado! Flag final correta. ' : 'Flag correta! ')+ 'Copie '+value+' para a tabela da sua equipe no Loop e apresente a resolução ao instrutor.';
    copy.hidden=false;
  });
  copy.addEventListener('click',async () => {
    if (!verified) return;
    const value=verified;
    try { await navigator.clipboard.writeText(value); if(verified===value) copyFeedback.textContent='Flag copiada. Cole na tabela do Loop.'; }
    catch { if(verified===value) { input.focus(); input.select(); copyFeedback.textContent='Selecionei a flag. Use Ctrl+C (ou Copiar no celular) e cole no Loop.'; } }
  });
})();
