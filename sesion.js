/* Páginas con sesión: muestra el nombre del usuario y cierra sesión.
   - Cualquier elemento con data-sesion="usuario" | "correo" | "perfil" se rellena
     con los datos del usuario que inició sesión.
   - Los botones "Cerrar sesión" (.btn-logout) cierran la sesión en el servidor. */
(() => {
  document.querySelectorAll('.btn-logout').forEach((enlace) => {
    enlace.addEventListener('click', async (evento) => {
      evento.preventDefault();
      try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* se sale igual */ }
      window.location.href = enlace.getAttribute('href') || 'index.html';
    });
  });

  (async () => {
    let usuario = null;
    try {
      const respuesta = await fetch('/api/sesion');
      if (respuesta.ok) usuario = await respuesta.json();
    } catch (e) { /* sin servidor: se deja el texto por defecto */ }
    if (!usuario) return;

    document.querySelectorAll('[data-sesion]').forEach((el) => {
      const valor = usuario[el.dataset.sesion];
      if (valor === undefined || valor === null) return;
      if (el.tagName === 'INPUT') el.value = valor;
      else el.textContent = valor;   // textContent: el nombre nunca se interpreta como HTML
    });
  })();
})();
