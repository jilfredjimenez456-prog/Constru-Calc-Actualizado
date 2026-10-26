/* Módulo adicional de historial: no reemplaza ni modifica calculos.js */
(() => {
  const resultBox = document.querySelector('.results-content');
  if (!resultBox) return;
  const calculatorNames = {
    'muro.html': 'Muro de ladrillo',
    'viga.html': 'Viga de concreto',
    'columnas.html': 'Columnas de concreto',
    'contrapiso.html': 'Contrapiso',
    'techo.html': 'Techo',
    'pisos.html': 'Pisos',
    'pintura.html': 'Pintura'
  };
  const page = location.pathname.split('/').pop().toLowerCase();
  const tipo = calculatorNames[page] || 'Cálculo';
  const actions = document.createElement('div');
  actions.style.cssText = 'margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;';
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Guardar cálculo';
  save.style.cssText = 'padding:10px 16px;border:0;border-radius:6px;background:#176b45;color:white;cursor:pointer;font-weight:600;';
  const status = document.createElement('span');
  status.setAttribute('role','status');
  status.style.cssText = 'align-self:center;font-size:14px;';
  actions.append(save, status);
  resultBox.parentElement.appendChild(actions);
  let hasResults = false;
  const getInputs = () => {
    const data = {};
    document.querySelectorAll('input').forEach(el => {
      if (!el.id && !el.name) return;
      if (el.type === 'radio' && !el.checked) return;
      if (el.type === 'button' || el.type === 'submit') return;
      data[el.id || el.name] = el.value;
    });
    return data;
  };
  const updateState = () => {
    hasResults = !!resultBox.querySelector('h4') && !resultBox.querySelector('[role="alert"]');
    save.disabled = !hasResults;
    save.style.opacity = hasResults ? '1' : '.55';
    if (!hasResults) status.textContent = '';
  };
  save.addEventListener('click', async () => {
    if (!hasResults) return;
    save.disabled = true;
    status.textContent = 'Guardando…';
    try {
      const response = await fetch('/api/historial', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          tipo,
          pagina: page,
          datos: getInputs(),
          resultado: resultBox.innerText.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
      status.textContent = 'Cálculo guardado correctamente.';
    } catch (error) {
      status.textContent = error.message || 'Error al guardar.';
    } finally {
      updateState();
    }
  });
  new MutationObserver(updateState).observe(resultBox, {childList:true, subtree:true, characterData:true});
  updateState();
})();
