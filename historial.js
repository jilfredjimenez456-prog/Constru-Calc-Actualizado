(() => {
 const list = document.querySelector('#history-list');
 const notice = document.querySelector('#history-notice');
 const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateText = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString('es-CO'); };
 async function request(url, options={}) {
   const response = await fetch(url, {...options, headers:{'Content-Type':'application/json',...(options.headers||{})}});
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
   return data;
 }
 async function load() {
   try {
     const items = await request('/api/historial');
     if (!items.length) { list.innerHTML = '<div class="history-empty">Todavía no has guardado cálculos. Entra a una calculadora, realiza el cálculo y presiona “Guardar cálculo”.</div>'; return; }
     list.innerHTML = items.map(item => {
       const data = Object.entries(item.datos || {}).map(([k,v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(' · ');
       return `<article class="history-card"><div class="history-card-head"><div><h3>${escapeHtml(item.tipo)}</h3><div class="history-date">${escapeHtml(dateText(item.fecha))}</div></div><button type="button" class="history-delete" data-delete="${Number(item.id)}">Eliminar</button></div><div class="history-data">${data || 'Sin datos de entrada registrados'}</div><div class="history-result">${escapeHtml(item.resultado)}</div></article>`;
     }).join('');
   } catch (error) {
     list.innerHTML = '<div class="history-empty">No se pudo cargar el historial. Verifica que hayas iniciado el servidor con python server.py.</div>';
     notice.textContent = error.message;
   }
 }
 list.addEventListener('click', async event => {
   const button = event.target.closest('[data-delete]');
   if (!button) return;
   if (!confirm('¿Deseas eliminar este cálculo del historial?')) return;
   try { await request(`/api/historial/${button.dataset.delete}`, {method:'DELETE'}); notice.textContent='Cálculo eliminado.'; await load(); }
   catch(error) { notice.textContent=error.message; }
 });
 load();
})();