/* Registro e inicio de sesión (register.html e index.html) */
(() => {
  const mensaje = document.querySelector('#mensaje');

  function mostrar(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `form-message ${tipo}`;
  }

  async function enviar(url, datos) {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
    } catch (e) {
      throw new Error('No se pudo conectar con el servidor. Verifica que python server.py esté en ejecución.');
    }
    let cuerpo = {};
    try { cuerpo = await respuesta.json(); } catch (e) { /* respuesta sin JSON */ }
    if (!respuesta.ok) throw new Error(cuerpo.error || 'No se pudo completar la solicitud.');
    return cuerpo;
  }

  function campo(form, nombre) {
    return form.elements[nombre].value;
  }

  // ---------- REGISTRO ----------
  const formRegistro = document.querySelector('#form-registro');
  if (formRegistro) {
    formRegistro.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const boton = formRegistro.querySelector('button[type="submit"]');

      const datos = {
        usuario: campo(formRegistro, 'usuario').trim(),
        correo: campo(formRegistro, 'correo').trim(),
        password: campo(formRegistro, 'password'),
        confirmar: campo(formRegistro, 'confirmar'),
        perfil: campo(formRegistro, 'perfil')
      };

      if (!datos.usuario || !datos.correo || !datos.password || !datos.confirmar || !datos.perfil) {
        return mostrar('Completa todos los campos.', 'error');
      }
      if (datos.password !== datos.confirmar) {
        return mostrar('Las contraseñas no coinciden.', 'error');
      }

      boton.disabled = true;
      mostrar('Creando tu cuenta…', 'info');
      try {
        const resultado = await enviar('/api/registro', datos);
        // Mensaje de bienvenida con el nombre de usuario
        mostrar(`¡Registro exitoso! Bienvenido ${resultado.usuario.usuario}`, 'ok');
        setTimeout(() => { window.location.href = 'panelprincipal.html'; }, 1800);
      } catch (error) {
        mostrar(error.message, 'error');
        boton.disabled = false;
      }
    });
  }

  // ---------- LOGIN ----------
  const formLogin = document.querySelector('#form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const boton = formLogin.querySelector('button[type="submit"]');

      const datos = {
        usuario: campo(formLogin, 'usuario').trim(),
        password: campo(formLogin, 'password')
      };
      if (!datos.usuario || !datos.password) {
        return mostrar('Escribe tu usuario y tu contraseña.', 'error');
      }

      boton.disabled = true;
      mostrar('Ingresando…', 'info');
      try {
        await enviar('/api/login', datos);
        window.location.href = 'panelprincipal.html';
      } catch (error) {
        mostrar(error.message, 'error');
        boton.disabled = false;
      }
    });
  }
})();
