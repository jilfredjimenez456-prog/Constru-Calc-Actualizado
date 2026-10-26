/* ConstrucCalc - operaciones basadas en Proyecto_Practico.pdf */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const resultBox = $('.results-content');
  const calculateButton = $('.btn-calc');
  const clearButton = $('.btn-clear');
  if (!resultBox || !calculateButton || !clearButton) return;

  const value = (id) => {
    const element = document.getElementById(id);
    return element ? Number(element.value) : NaN;
  };
  const fmt = (number, digits = 2) => number.toLocaleString('es-CO', {
    minimumFractionDigits: 0, maximumFractionDigits: digits
  });
  const showError = (message) => {
    resultBox.innerHTML = `<p class="calc-error" role="alert">${message}</p>`;
  };
  const showResults = (title, rows, note = '') => {
    resultBox.innerHTML = `<h4>${title}</h4><ul class="calc-result-list">${rows.map(([name, amount, unit]) =>
      `<li><span>${name}</span><strong>${fmt(amount)} ${unit}</strong></li>`).join('')}</ul>${note ? `<p class="calc-note">${note}</p>` : ''}`;
  };
  const positive = (...values) => values.every(n => Number.isFinite(n) && n > 0);

  calculateButton.addEventListener('click', () => {
    const page = location.pathname.split('/').pop().toLowerCase();
    let a, b, c, surface, volume;

    switch (page) {
      case 'muro.html': {
        a = value('longitud'); b = value('altura');
        const selected = $('input[name="espesor"]:checked');
        if (!positive(a, b) || !selected) return showError('Selecciona el espesor e ingresa largo y alto mayores que cero.');
        surface = a * b;
        const factor = selected.value === '20'
          ? { cement: 10.9, sand: 0.09, bricks: 90 }
          : { cement: 15.2, sand: 0.115, bricks: 120 };
        showResults('Superficie y materiales necesarios', [
          ['Superficie del muro', surface, 'm²'],
          ['Cemento', surface * factor.cement, 'kg'],
          ['Arena', surface * factor.sand, 'm³'],
          ['Ladrillos', surface * factor.bricks, 'unidades']
        ]);
        break;
      }
      case 'viga.html': {
        a = value('largo');
        if (!positive(a)) return showError('Ingresa el largo de la viga en metros, mayor que cero.');
        showResults('Materiales necesarios para la viga', [
          ['Cemento', a * 9, 'kg'], ['Arena', a * 0.02, 'm³'],
          ['Piedra', a * 0.02, 'm²'], ['Hierro del 8', a * 4, 'm'],
          ['Hierro del 4', a * 3, 'm']
        ], 'Se aplicaron las cantidades por metro lineal.');
        break;
      }
      case 'columnas.html': {
        a = value('largo');
        if (!positive(a)) return showError('Ingresa el largo de la columna en metros, mayor que cero.');
        showResults('Materiales necesarios para la columna', [
          ['Cemento', a * 7.5, 'kg'], ['Arena', a * 0.016, 'm³'],
          ['Piedra', a * 0.016, 'm²'], ['Hierro del 10', a * 6, 'm'],
          ['Hierro del 4', a * 3, 'm']
        ], 'Se aplicaron las cantidades por metro lineal.');
        break;
      }
      case 'contrapiso.html': {
        a = value('espesor'); b = value('ancho'); c = value('longitud');
        if (!positive(a, b, c)) return showError('Ingresa espesor, ancho y largo mayores que cero, en metros.');
        volume = a * b * c;
        showResults('Volumen y materiales necesarios', [
          ['Volumen del contrapiso', volume, 'm³'], ['Cemento', volume * 105, 'kg'],
          ['Arena', volume * 0.45, 'm³'], ['Piedra', volume * 0.9, 'm³']
        ]);
        break;
      }
      case 'techo.html': {
        a = value('espesor'); b = value('ancho'); c = value('longitud');
        if (!positive(a, b, c)) return showError('Ingresa espesor, ancho y largo mayores que cero, en metros.');
        surface = b * c;
        showResults('Superficie y materiales necesarios', [
          ['Superficie del techo', surface, 'm²'], ['Cemento', surface * 33, 'kg'],
          ['Arena', surface * 0.072, 'm³'], ['Piedra', surface * 0.072, 'm³'],
          ['Hierro del 8', surface * 7, 'm'], ['Hierro del 6', surface * 4, 'm']
        ], 'Se define las cantidades por m²; por eso se usa ancho × largo.');
        break;
      }
      case 'pisos.html': {
        a = value('ancho'); b = value('longitud');
        if (!positive(a, b)) return showError('Ingresa ancho y largo mayores que cero, en metros.');
        surface = a * b;
        showResults('Superficie del piso', [
          ['Superficie sin recortes', surface, 'm²'],
          ['Extra del 10% para recortes', surface * 0.1, 'm²'],
          ['Superficie total a considerar', surface * 1.1, 'm²']
        ]);
        break;
      }
      case 'pintura.html': {
        a = value('largo');
        if (!positive(a)) return showError('Ingresa la superficie del muro en m², mayor que cero.');
        showResults('Pintura necesaria', [
          ['Superficie del muro', a, 'm²'], ['Pintura necesaria (6 m² por litro)', a / 6, 'litros']
        ], 'El resultado de litros puede ser decimal; redondea hacia arriba si comprarás envases enteros.');
        break;
      }
      default:
        showError('No se identificó la calculadora de esta página.');
    }
  });

  clearButton.addEventListener('click', () => {
    document.querySelectorAll('input.calc-input').forEach(input => input.value = '');
    resultBox.innerHTML = '';
  });
})();
