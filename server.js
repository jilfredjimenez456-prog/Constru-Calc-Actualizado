const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB = path.join(ROOT, 'data', 'materiales.json');
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};

function readMaterials() { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
function saveMaterials(items) { fs.writeFileSync(DB, JSON.stringify(items, null, 2), 'utf8'); }
function send(res, status, data) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch(e) { reject(new Error('El cuerpo enviado no contiene JSON válido.')); } }); req.on('error', reject); }); }
function validate(data) {
  if (!data.nombre || typeof data.nombre !== 'string' || !data.nombre.trim()) return 'El nombre es obligatorio.';
  if (!data.categoria || typeof data.categoria !== 'string' || !data.categoria.trim()) return 'La categoría es obligatoria.';
  if (!data.unidad || typeof data.unidad !== 'string' || !data.unidad.trim()) return 'La unidad es obligatoria.';
  if (!Number.isFinite(Number(data.precio)) || Number(data.precio) < 0) return 'El precio debe ser un número igual o mayor que cero.';
  if (!Number.isInteger(Number(data.stock)) || Number(data.stock) < 0) return 'El stock debe ser un número entero igual o mayor que cero.';
  return null;
}
async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); return res.end(); }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'materiales') return false;
  try {
    let items = readMaterials();
    const id = parts[2] ? Number(parts[2]) : null;
    if (req.method === 'GET' && !id) return send(res, 200, items);
    if (req.method === 'GET' && id) {
      const item = items.find(x => x.id === id);
      return item ? send(res, 200, item) : send(res, 404, {error:'Material no encontrado.'});
    }
    if (req.method === 'POST' && !id) {
      const data = await body(req); const error = validate(data);
      if (error) return send(res, 400, {error});
      const item = {id: items.reduce((m,x)=>Math.max(m,x.id),0)+1, nombre:data.nombre.trim(), categoria:data.categoria.trim(), unidad:data.unidad.trim(), precio:Number(data.precio), stock:Number(data.stock)};
      items.push(item); saveMaterials(items); return send(res, 201, item);
    }
    if (req.method === 'PUT' && id) {
      const index = items.findIndex(x => x.id === id);
      if (index < 0) return send(res, 404, {error:'Material no encontrado.'});
      const data = await body(req); const error = validate(data);
      if (error) return send(res, 400, {error});
      items[index] = {id, nombre:data.nombre.trim(), categoria:data.categoria.trim(), unidad:data.unidad.trim(), precio:Number(data.precio), stock:Number(data.stock)};
      saveMaterials(items); return send(res, 200, items[index]);
    }
    if (req.method === 'DELETE' && id) {
      const index = items.findIndex(x => x.id === id);
      if (index < 0) return send(res, 404, {error:'Material no encontrado.'});
      const removed = items.splice(index,1)[0]; saveMaterials(items); return send(res, 200, {message:'Material eliminado.', material:removed});
    }
    return send(res, 405, {error:'Método no permitido para esta ruta.'});
  } catch (e) { return send(res, 500, {error:e.message || 'Error interno del servidor.'}); }
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) { const handled = await handleApi(req,res,url); if (handled !== false) return; }
  let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  let file = path.resolve(ROOT, '.' + requested);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file,(err,content)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('No se encontró el archivo.');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)] || 'application/octet-stream'});res.end(content);
  });
});
server.listen(PORT,()=>console.log(`ConstrucCalc disponible en http://localhost:${PORT}`));
