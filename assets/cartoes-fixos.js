// Só abre o conteúdo já escrito no HTML. Não carrega missões do armazenamento.
(() => {
 const dialog=document.getElementById('ctf-reader');
 const heading=document.getElementById('ctf-reader-title');
 const body=document.getElementById('ctf-reader-content');
 let opener=null;
 document.addEventListener('click',event=>{
   const button=event.target.closest('[data-ctf-read]');
   if(!button)return;
   event.preventDefault();event.stopPropagation();
   const card=document.getElementById(button.dataset.ctfRead);
   if(!card)return;
   opener=button;
   heading.textContent=card.dataset.ctfTitle;
   body.replaceChildren(...Array.from(card.querySelector('.ctf-fixed-content').childNodes).filter(el=>el.nodeName!=='H2').map(el=>el.cloneNode(true)));
   dialog.showModal();
 },true);
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{body.replaceChildren();opener?.focus()});
})();
