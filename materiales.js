// CONSTANTES Y SELECCIÓN DE ELEMENTOS DEL DOM //
const API = '/api/materiales';

const form = document.querySelector('#material-form');
const body = document.querySelector('#materials-body');
const notice = document.querySelector('#notice');
const search = document.querySelector('#search');
const cancelButton = document.querySelector('#cancel-button');
const materialIdInput = document.querySelector('#material-id');
const formTitle = document.querySelector('#form-title');
const saveButton = document.querySelector('#save-button');

let materials = [];

// FUNCIONES UTILITARIAS Y FORMATO //

// Formatea números a moneda COP sin decimales //
const money = (value) => 
new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
}).format(value);

// Escapa caracteres especiales para prevenir vulnerabilidades XSS //
function escapeHtml(value) {
return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[c]));
}

// Muestra mensajes de estado (éxito, error, info)
function message(text, type = 'success') {
    notice.textContent = text;
    notice.className = `notice ${type}`;
}

// COMUNICACIÓN CON LA API (FETCH) //
async function request(url, options = {}) {
const response = await fetch(url, {
    ...options,
    headers: {
    'Content-Type': 'application/json',
    ...(options.headers || {})
    }
});

const data = await response.json();

if (!response.ok) {
    throw new Error(data.error || 'No se pudo completar la solicitud.');
}

return data;
}

async function loadMaterials() {
try {
    materials = await request(API);
    render();
} catch (e) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">No se pudo conectar con el backend. Inicia el servidor con node server.js.</td></tr>';
    message(e.message, 'error');
}
}

// RENDERIZADO Y CONTROL DEL FORMULARIO //

// Dibuja la tabla de materiales filtrada por el buscador //
function render() {
const term = search.value.trim().toLocaleLowerCase('es');

const filtered = materials.filter((m) =>
    [m.nombre, m.categoria, m.unidad].some((v) =>
    v.toLocaleLowerCase('es').includes(term)
    )
);

if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">No hay materiales que coincidan con la búsqueda.</td></tr>';
    return;
}

body.innerHTML = filtered.map((m) => `
    <tr>
    <td><strong>${escapeHtml(m.nombre)}</strong></td>
    <td>${escapeHtml(m.categoria)}</td>
    <td>${escapeHtml(m.unidad)}</td>
    <td>${money(m.precio)}</td>
    <td>${m.stock}</td>
    <td>
        <div class="table-actions">
        <button type="button" class="edit-button" data-edit="${m.id}" aria-label="Editar ${escapeHtml(m.nombre)}">Editar</button>
        <button type="button" class="delete-button" data-delete="${m.id}" aria-label="Eliminar ${escapeHtml(m.nombre)}">Eliminar</button>
        </div>
    </td>
    </tr>
`).join('');
}

// Restablece el formulario a su estado inicial //
function resetForm() {
    form.reset();
    materialIdInput.value = '';
    formTitle.textContent = 'Registrar material';
    saveButton.textContent = 'Guardar material';
    cancelButton.hidden = true;
}

// MANEJADORES DE EVENTOS (EVENT LISTENERS) //

// Guardar o Actualizar material //
form.addEventListener('submit', async (e) => {
e.preventDefault();

const id = materialIdInput.value;
const item = {
    nombre: document.querySelector('#nombre').value.trim(),
    categoria: document.querySelector('#categoria').value,
    unidad: document.querySelector('#unidad').value,
    precio: Number(document.querySelector('#precio').value),
    stock: Number(document.querySelector('#stock').value)
};

try {
    await request(id ? `${API}/${id}` : API, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(item)
    });

    message(id ? 'Material actualizado correctamente.' : 'Material registrado correctamente.');
    resetForm();
    await loadMaterials();
} catch (err) {
    message(err.message, 'error');
}
});

// Editar o Eliminar material desde los botones de la tabla //
body.addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');

  // Acción: Cargar datos en el formulario para editar //
if (edit) {
    const item = materials.find((m) => m.id === Number(edit.dataset.edit));
    if (!item) return;

    materialIdInput.value = item.id;
    for (const key of ['nombre', 'categoria', 'unidad', 'precio', 'stock']) {
    document.querySelector(`#${key}`).value = item[key];
    }

    formTitle.textContent = 'Editar material';
    saveButton.textContent = 'Guardar cambios';
    cancelButton.hidden = false;
    document.querySelector('#nombre').focus();
    return;
}

  // Acción: Eliminar material //
if (del) {
    const item = materials.find((m) => m.id === Number(del.dataset.delete));
    if (!item) return;

    if (!confirm(`¿Seguro que deseas eliminar "${item.nombre}"?`)) return;

    try {
    await request(`${API}/${item.id}`, { method: 'DELETE' });
    message('Material eliminado correctamente.');
    await loadMaterials();
    } catch (err) {
    message(err.message, 'error');
    }
}
});

// Cancelar edición //
cancelButton.addEventListener('click', resetForm);

// Filtrar en tiempo real //
search.addEventListener('input', render);


// INICIALIZACIÓN//
loadMaterials();
