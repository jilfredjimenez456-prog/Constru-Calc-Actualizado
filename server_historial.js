
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB = path.join(ROOT, 'data', 'materiales.json');
const HISTORY_DB = path.join(ROOT, 'data', 'historial.json');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const PAGINAS_CALCULOS = [
    'muro.html',
    'viga.html',
    'columnas.html',
    'contrapiso.html',
    'techo.html',
    'pisos.html',
    'pintura.html'
];

function readMaterials() {
    return JSON.parse(fs.readFileSync(DB, 'utf8'));
}

function saveMaterials(items) {
    fs.writeFileSync(DB, JSON.stringify(items, null, 2), 'utf8');
}

function send(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });

    res.end(JSON.stringify(data));
}

function body(req) {
    return new Promise((resolve, reject) => {
        let raw = '';

        req.on('data', chunk => {
            raw += chunk;
        });

        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (error) {
                reject(new Error('El cuerpo enviado no contiene JSON válido.'));
            }
        });

        req.on('error', reject);
    });
}

function validate(data) {
    if (!data.nombre || typeof data.nombre !== 'string' || !data.nombre.trim()) {
        return 'El nombre es obligatorio.';
    }

    if (!data.categoria || typeof data.categoria !== 'string' || !data.categoria.trim()) {
        return 'La categoría es obligatoria.';
    }

    if (!data.unidad || typeof data.unidad !== 'string' || !data.unidad.trim()) {
        return 'La unidad es obligatoria.';
    }

    if (!Number.isFinite(Number(data.precio)) || Number(data.precio) < 0) {
        return 'El precio debe ser un número igual o mayor que cero.';
    }

    if (!Number.isInteger(Number(data.stock)) || Number(data.stock) < 0) {
        return 'El stock debe ser un número entero igual o mayor que cero.';
    }

    return null;
}

async function handleHistory(req, res, url) {
    try {
        if (!fs.existsSync(HISTORY_DB)) {
            fs.writeFileSync(HISTORY_DB, '[]', 'utf8');
        }

        const history = JSON.parse(fs.readFileSync(HISTORY_DB, 'utf8'));
        const idPart = url.pathname.split('/').filter(Boolean)[2];
        const historyId = idPart ? Number(idPart) : null;

        if (req.method === 'GET' && !historyId) {
            return send(res, 200, history);
        }

        if (req.method === 'POST' && !historyId) {
            const data = await body(req);

            if (!data.tipo || !data.resultado) {
                return send(res, 400, {
                    error: 'Faltan datos del cálculo.'
                });
            }

            const item = {
                id: history.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
                tipo: String(data.tipo).slice(0, 100),
                pagina: String(data.pagina || '').slice(0, 100),
                fecha: new Date().toISOString(),
                datos: data.datos || {},
                resultado: String(data.resultado).slice(0, 10000)
            };

            history.unshift(item);

            fs.writeFileSync(
                HISTORY_DB,
                JSON.stringify(history, null, 2),
                'utf8'
            );

            return send(res, 201, item);
        }

        if (req.method === 'DELETE' && historyId) {
            const index = history.findIndex(item => Number(item.id) === historyId);

            if (index < 0) {
                return send(res, 404, {
                    error: 'Cálculo no encontrado en el historial.'
                });
            }

            const removed = history.splice(index, 1)[0];

            fs.writeFileSync(
                HISTORY_DB,
                JSON.stringify(history, null, 2),
                'utf8'
            );

            return send(res, 200, {
                message: 'Cálculo eliminado.',
                item: removed
            });
        }

        return send(res, 405, {
            error: 'Método no permitido para esta ruta.'
        });
    } catch (error) {
        return send(res, 500, {
            error: error.message || 'Error interno del servidor.'
        });
    }
}

async function handleMaterials(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'api' || parts[1] !== 'materiales') {
        return false;
    }

    try {
        const items = readMaterials();
        const id = parts[2] ? Number(parts[2]) : null;

        if (req.method === 'GET' && !id) {
            return send(res, 200, items);
        }

        if (req.method === 'GET' && id) {
            const item = items.find(item => item.id === id);

            return item
                ? send(res, 200, item)
                : send(res, 404, { error: 'Material no encontrado.' });
        }

        if (req.method === 'POST' && !id) {
            const data = await body(req);
            const error = validate(data);

            if (error) {
                return send(res, 400, { error });
            }

            const item = {
                id: items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1,
                nombre: data.nombre.trim(),
                categoria: data.categoria.trim(),
                unidad: data.unidad.trim(),
                precio: Number(data.precio),
                stock: Number(data.stock)
            };

            items.push(item);
            saveMaterials(items);

            return send(res, 201, item);
        }

        if (req.method === 'PUT' && id) {
            const index = items.findIndex(item => item.id === id);

            if (index < 0) {
                return send(res, 404, { error: 'Material no encontrado.' });
            }

            const data = await body(req);
            const error = validate(data);

            if (error) {
                return send(res, 400, { error });
            }

            items[index] = {
                id,
                nombre: data.nombre.trim(),
                categoria: data.categoria.trim(),
                unidad: data.unidad.trim(),
                precio: Number(data.precio),
                stock: Number(data.stock)
            };

            saveMaterials(items);

            return send(res, 200, items[index]);
        }

        if (req.method === 'DELETE' && id) {
            const index = items.findIndex(item => item.id === id);

            if (index < 0) {
                return send(res, 404, { error: 'Material no encontrado.' });
            }

            const removed = items.splice(index, 1)[0];
            saveMaterials(items);

            return send(res, 200, {
                message: 'Material eliminado.',
                material: removed
            });
        }

        return send(res, 405, {
            error: 'Método no permitido para esta ruta.'
        });
    } catch (error) {
        return send(res, 500, {
            error: error.message || 'Error interno del servidor.'
        });
    }
}

async function handleApi(req, res, url) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });

        return res.end();
    }

    if (
        url.pathname === '/api/historial' ||
        url.pathname.startsWith('/api/historial/')
    ) {
        return handleHistory(req, res, url);
    }

    return handleMaterials(req, res, url);
}

function prepareHTML(content, file) {
    let html = content.toString('utf8');
    const page = path.basename(file).toLowerCase();

    if (PAGINAS_CALCULOS.includes(page)) {
        const menuOriginal = '<nav class="menu-calculos">';
        const enlaceHistorial = `
                <a href="historial.html" class="btn-menu">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    Historial de cálculos
                </a>`;

        if (html.includes(menuOriginal)) {
            html = html.replace(menuOriginal, menuOriginal + enlaceHistorial);
        }
    }

    if (
        PAGINAS_CALCULOS.includes(page) ||
        page === 'panelprincipal.html'
    ) {
        if (!html.includes('historial-bridge.js')) {
            html = html.replace(
                '</body>',
                '    <script src="historial-bridge.js" defer></script></body>'
            );
        }
    }

    return Buffer.from(html, 'utf8');
}

const server = http.createServer(async (req, res) => {
    const url = new URL(
        req.url,
        `http://${req.headers.host || 'localhost'}`
    );

    if (url.pathname.startsWith('/api/')) {
        try {
            await handleApi(req, res, url);
        } catch (error) {
            if (!res.headersSent) {
                send(res, 500, {
                    error: 'Error interno del servidor.'
                });
            } else if (!res.writableEnded) {
                res.end();
            }

            console.error('Error en la API:', error);
        }

        return;
    }

    let requested;

    try {
        requested = decodeURIComponent(
            url.pathname === '/' ? '/index.html' : url.pathname
        );
    } catch (error) {
        res.writeHead(400);
        return res.end('Ruta no válida.');
    }

    const file = path.resolve(ROOT, '.' + requested);

    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
        res.writeHead(403);
        return res.end('Prohibido');
    }

    fs.readFile(file, (error, content) => {
        if (error) {
            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8'
            });

            return res.end('No se encontró el archivo.');
        }

        let output = content;

        if (path.extname(file).toLowerCase() === '.html') {
            output = prepareHTML(content, file);
        }

        const contentType =
            MIME[path.extname(file).toLowerCase()] ||
            'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType
        });

        res.end(output);
    });
});

server.listen(PORT, () => {
    console.log(`ConstrucCalc disponible en http://localhost:${PORT}`);
});

