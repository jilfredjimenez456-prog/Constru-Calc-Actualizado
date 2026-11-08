"""
ConstrucCalc - Backend en Python (Flask)

Reemplaza a server.js / server_historial.js. Hace lo mismo que el backend
anterior (materiales, historial, archivos del frontend) y agrega:

    POST /api/registro   crea un usuario y abre sesión
    POST /api/login      inicia sesión (con usuario o correo)
    POST /api/logout     cierra sesión
    GET  /api/sesion     devuelve el usuario con sesión activa

Ejecutar:
    pip install -r requirements.txt
    python server.py
Abrir: http://localhost:3000
"""

import json
import os
import re
import secrets
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory, session, Response
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
MATERIALES_DB = DATA_DIR / "materiales.json"
HISTORIAL_DB = DATA_DIR / "historial.json"
USUARIOS_DB = DATA_DIR / "usuarios.json"
SECRET_FILE = DATA_DIR / "secret.key"

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", 3000))

PERFILES_VALIDOS = ("Administrador", "Empleado")

PAGINAS_CALCULOS = {
    "muro.html", "viga.html", "columnas.html", "contrapiso.html",
    "techo.html", "pisos.html", "pintura.html",
}

# Solo estas extensiones se sirven al navegador. Todo lo demás (server.py,
# package.json, etc.) devuelve 404.
EXTENSIONES_PUBLICAS = {
    ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp",
}
# Carpetas que NUNCA se sirven: ahí están los datos y las contraseñas.
CARPETAS_PRIVADAS = {"data", "__pycache__", "venv", ".venv", "node_modules"}

# Un solo candado: el servidor atiende varias peticiones a la vez y los
# archivos JSON se leen, modifican y reescriben completos.
db_lock = threading.RLock()


def _clave_secreta() -> str:
    """Clave para firmar las cookies de sesión. Se crea una vez y se reutiliza."""
    desde_entorno = os.environ.get("SECRET_KEY")
    if desde_entorno:
        return desde_entorno
    DATA_DIR.mkdir(exist_ok=True)
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(secrets.token_hex(32), encoding="utf-8")
    return SECRET_FILE.read_text(encoding="utf-8").strip()


app = Flask(__name__, static_folder=None)
app.secret_key = _clave_secreta()
app.json.ensure_ascii = False
app.json.sort_keys = False
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    MAX_CONTENT_LENGTH=1024 * 1024,  # 1 MB por petición
)


# --------------------------------------------------------------------------
# UTILIDADES: ERRORES, JSON Y ALMACENAMIENTO
# --------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, mensaje: str, status: int = 400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


@app.errorhandler(ApiError)
def _api_error(e: ApiError):
    return jsonify({"error": e.mensaje}), e.status


def _error_http(status: int, mensaje_api: str, mensaje_texto: str):
    if request.path.startswith("/api/"):
        return jsonify({"error": mensaje_api}), status
    return Response(mensaje_texto, status=status, mimetype="text/plain")


@app.errorhandler(404)
def _404(_e):
    return _error_http(404, "Ruta no encontrada.", "No se encontró el archivo.")


@app.errorhandler(405)
def _405(_e):
    return _error_http(405, "Método no permitido para esta ruta.", "Método no permitido.")


@app.errorhandler(413)
def _413(_e):
    return _error_http(413, "La petición es demasiado grande.", "Petición demasiado grande.")


@app.errorhandler(500)
def _500(_e):
    return _error_http(500, "Error interno del servidor.", "Error interno del servidor.")


@app.after_request
def _cabeceras(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    return resp


def leer_cuerpo() -> dict:
    """Lee el JSON de la petición. Un cuerpo vacío equivale a {}."""
    crudo = request.get_data(as_text=True)
    if not crudo.strip():
        return {}
    try:
        datos = json.loads(crudo)
    except ValueError:
        raise ApiError("El cuerpo enviado no contiene JSON válido.", 400)
    if not isinstance(datos, dict):
        raise ApiError("El cuerpo enviado debe ser un objeto JSON.", 400)
    return datos


def leer_json(ruta: Path, por_defecto):
    if not ruta.exists():
        return por_defecto
    with ruta.open("r", encoding="utf-8") as f:
        return json.load(f)


def guardar_json(ruta: Path, datos) -> None:
    """Escribe en un archivo temporal y lo reemplaza: evita dejar el JSON a medias."""
    ruta.parent.mkdir(exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def siguiente_id(items: list) -> int:
    maximo = 0
    for item in items:
        try:
            maximo = max(maximo, int(item.get("id", 0)))
        except (TypeError, ValueError):
            pass
    return maximo + 1


def _texto_obligatorio(valor) -> bool:
    return isinstance(valor, str) and bool(valor.strip())


def _numero(valor):
    """Convierte a float o devuelve None si no es un número finito."""
    if isinstance(valor, bool) or valor is None:
        return None
    if isinstance(valor, str) and not valor.strip():
        return None
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n == n and n not in (float("inf"), float("-inf")) else None


# --------------------------------------------------------------------------
# USUARIOS: REGISTRO, LOGIN, LOGOUT, SESIÓN
# --------------------------------------------------------------------------
USUARIO_RE = re.compile(r"^[\w.\-]{3,20}$")
CORREO_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$")
PASSWORD_MIN, PASSWORD_MAX = 8, 64
# Hash de relleno: se compara contra él cuando el usuario no existe, para que
# el login tarde lo mismo exista o no la cuenta.
_HASH_RELLENO = generate_password_hash(secrets.token_hex(8))


def usuario_publico(u: dict) -> dict:
    """Datos del usuario que sí pueden salir al navegador (sin contraseña)."""
    return {"id": u["id"], "usuario": u["usuario"], "correo": u["correo"], "perfil": u["perfil"]}


def validar_registro(d: dict) -> dict:
    usuario = d.get("usuario")
    correo = d.get("correo")
    password = d.get("password")
    confirmar = d.get("confirmar")
    perfil = d.get("perfil")

    if not _texto_obligatorio(usuario):
        raise ApiError("El nombre de usuario es obligatorio.")
    usuario = usuario.strip()
    if not USUARIO_RE.match(usuario):
        raise ApiError(
            "El usuario debe tener entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo (sin espacios)."
        )

    if not _texto_obligatorio(correo):
        raise ApiError("El correo es obligatorio.")
    correo = correo.strip().lower()
    if len(correo) > 254 or not CORREO_RE.match(correo):
        raise ApiError("El correo no tiene un formato válido.")

    if not isinstance(password, str) or not password:
        raise ApiError("La contraseña es obligatoria.")
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        raise ApiError(f"La contraseña debe tener entre {PASSWORD_MIN} y {PASSWORD_MAX} caracteres.")
    if confirmar != password:
        raise ApiError("Las contraseñas no coinciden.")

    if perfil not in PERFILES_VALIDOS:
        raise ApiError("Selecciona un perfil válido (Administrador o Empleado).")

    return {"usuario": usuario, "correo": correo, "password": password, "perfil": perfil}


def usuario_actual():
    uid = session.get("uid")
    if uid is None:
        return None
    with db_lock:
        for u in leer_json(USUARIOS_DB, []):
            if u["id"] == uid:
                return u
    session.clear()  # la cuenta ya no existe
    return None


def _abrir_sesion(u: dict) -> None:
    session.clear()
    session["uid"] = u["id"]
    session.permanent = True


@app.post("/api/registro")
def registro():
    datos = validar_registro(leer_cuerpo())

    with db_lock:
        usuarios = leer_json(USUARIOS_DB, [])
        if any(u["usuario"].lower() == datos["usuario"].lower() for u in usuarios):
            raise ApiError("Ese nombre de usuario ya está en uso.", 409)
        if any(u["correo"] == datos["correo"] for u in usuarios):
            raise ApiError("Ya existe una cuenta con ese correo.", 409)

        nuevo = {
            "id": siguiente_id(usuarios),
            "usuario": datos["usuario"],
            "correo": datos["correo"],
            "perfil": datos["perfil"],
            "password_hash": generate_password_hash(datos["password"]),
            "creado": datetime.now(timezone.utc).isoformat(),
        }
        usuarios.append(nuevo)
        guardar_json(USUARIOS_DB, usuarios)

    _abrir_sesion(nuevo)
    publico = usuario_publico(nuevo)
    return jsonify({"message": f"Bienvenido {publico['usuario']}", "usuario": publico}), 201


@app.post("/api/login")
def login():
    d = leer_cuerpo()
    identificador = d.get("usuario")
    password = d.get("password")
    if not _texto_obligatorio(identificador) or not isinstance(password, str) or not password:
        raise ApiError("Escribe tu usuario y tu contraseña.")

    ident = identificador.strip().lower()
    with db_lock:
        usuarios = leer_json(USUARIOS_DB, [])
    encontrado = next(
        (u for u in usuarios if u["usuario"].lower() == ident or u["correo"] == ident), None
    )

    hash_a_comparar = encontrado["password_hash"] if encontrado else _HASH_RELLENO
    correcto = check_password_hash(hash_a_comparar, password)
    if not encontrado or not correcto:
        raise ApiError("Usuario o contraseña incorrectos.", 401)

    _abrir_sesion(encontrado)
    publico = usuario_publico(encontrado)
    return jsonify({"message": f"Bienvenido {publico['usuario']}", "usuario": publico})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Sesión cerrada."})


@app.get("/api/sesion")
def sesion_activa():
    u = usuario_actual()
    if not u:
        raise ApiError("No has iniciado sesión.", 401)
    return jsonify(usuario_publico(u))


# --------------------------------------------------------------------------
# MATERIALES (CRUD)
# --------------------------------------------------------------------------
def validar_material(d: dict) -> dict:
    if not _texto_obligatorio(d.get("nombre")):
        raise ApiError("El nombre es obligatorio.")
    if not _texto_obligatorio(d.get("categoria")):
        raise ApiError("La categoría es obligatoria.")
    if not _texto_obligatorio(d.get("unidad")):
        raise ApiError("La unidad es obligatoria.")

    precio = _numero(d.get("precio"))
    if precio is None or precio < 0:
        raise ApiError("El precio debe ser un número igual o mayor que cero.")

    stock = _numero(d.get("stock"))
    if stock is None or not stock.is_integer() or stock < 0:
        raise ApiError("El stock debe ser un número entero igual o mayor que cero.")

    return {
        "nombre": d["nombre"].strip(),
        "categoria": d["categoria"].strip(),
        "unidad": d["unidad"].strip(),
        "precio": int(precio) if precio.is_integer() else precio,
        "stock": int(stock),
    }


@app.get("/api/materiales")
def materiales_listar():
    with db_lock:
        return jsonify(leer_json(MATERIALES_DB, []))


@app.get("/api/materiales/<int:material_id>")
def materiales_obtener(material_id: int):
    with db_lock:
        for m in leer_json(MATERIALES_DB, []):
            if m["id"] == material_id:
                return jsonify(m)
    raise ApiError("Material no encontrado.", 404)


@app.post("/api/materiales")
def materiales_crear():
    datos = validar_material(leer_cuerpo())
    with db_lock:
        items = leer_json(MATERIALES_DB, [])
        item = {"id": siguiente_id(items), **datos}
        items.append(item)
        guardar_json(MATERIALES_DB, items)
    return jsonify(item), 201


@app.put("/api/materiales/<int:material_id>")
def materiales_actualizar(material_id: int):
    with db_lock:
        items = leer_json(MATERIALES_DB, [])
        indice = next((i for i, m in enumerate(items) if m["id"] == material_id), None)
        if indice is None:
            raise ApiError("Material no encontrado.", 404)
        datos = validar_material(leer_cuerpo())
        items[indice] = {"id": material_id, **datos}
        guardar_json(MATERIALES_DB, items)
        return jsonify(items[indice])


@app.delete("/api/materiales/<int:material_id>")
def materiales_eliminar(material_id: int):
    with db_lock:
        items = leer_json(MATERIALES_DB, [])
        indice = next((i for i, m in enumerate(items) if m["id"] == material_id), None)
        if indice is None:
            raise ApiError("Material no encontrado.", 404)
        eliminado = items.pop(indice)
        guardar_json(MATERIALES_DB, items)
    return jsonify({"message": "Material eliminado.", "material": eliminado})


# --------------------------------------------------------------------------
# HISTORIAL DE CÁLCULOS
# --------------------------------------------------------------------------
@app.get("/api/historial")
def historial_listar():
    with db_lock:
        return jsonify(leer_json(HISTORIAL_DB, []))


@app.post("/api/historial")
def historial_crear():
    d = leer_cuerpo()
    if not d.get("tipo") or not d.get("resultado"):
        raise ApiError("Faltan datos del cálculo.")

    datos_entrada = d.get("datos")
    with db_lock:
        historial = leer_json(HISTORIAL_DB, [])
        item = {
            "id": siguiente_id(historial),
            "tipo": str(d["tipo"])[:100],
            "pagina": str(d.get("pagina") or "")[:100],
            "fecha": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "datos": datos_entrada if isinstance(datos_entrada, dict) else {},
            "resultado": str(d["resultado"])[:10000],
        }
        historial.insert(0, item)  # el más reciente primero
        guardar_json(HISTORIAL_DB, historial)
    return jsonify(item), 201


@app.delete("/api/historial/<int:item_id>")
def historial_eliminar(item_id: int):
    with db_lock:
        historial = leer_json(HISTORIAL_DB, [])
        indice = next((i for i, h in enumerate(historial) if int(h.get("id", 0)) == item_id), None)
        if indice is None:
            raise ApiError("Cálculo no encontrado en el historial.", 404)
        eliminado = historial.pop(indice)
        guardar_json(HISTORIAL_DB, historial)
    return jsonify({"message": "Cálculo eliminado.", "item": eliminado})


# --------------------------------------------------------------------------
# ARCHIVOS DEL FRONTEND
# --------------------------------------------------------------------------
def preparar_html(nombre: str, html: str) -> str:
    """Igual que el backend anterior: agrega el enlace y el script del historial
    a las páginas de cálculo (muro, viga, etc.) sin tocar los .html originales."""
    pagina = nombre.lower()

    if pagina in PAGINAS_CALCULOS:
        menu = '<nav class="menu-calculos">'
        enlace = (
            '\n                <a href="historial.html" class="btn-menu">'
            '\n                    <i class="fa-solid fa-clock-rotate-left"></i>'
            "\n                    Historial de cálculos"
            "\n                </a>"
        )
        if menu in html:
            html = html.replace(menu, menu + enlace, 1)

    if pagina in PAGINAS_CALCULOS or pagina == "panelprincipal.html":
        if "historial-bridge.js" not in html:
            html = html.replace(
                "</body>", '    <script src="historial-bridge.js" defer></script></body>', 1
            )
    return html


@app.get("/")
def raiz():
    return archivos("index.html")


@app.get("/<path:ruta>")
def archivos(ruta: str):
    if ruta.startswith("api/"):
        abort(404)

    partes = Path(ruta).parts
    if not partes or any(p.startswith(".") for p in partes) or partes[0] in CARPETAS_PRIVADAS:
        abort(404)

    extension = Path(ruta).suffix.lower()
    if extension not in EXTENSIONES_PUBLICAS:
        abort(404)

    if extension == ".html":
        archivo = (ROOT / ruta).resolve()
        if ROOT not in archivo.parents or not archivo.is_file():
            abort(404)
        html = preparar_html(archivo.name, archivo.read_text(encoding="utf-8"))
        resp = Response(html, mimetype="text/html")
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    return send_from_directory(ROOT, ruta)


# --------------------------------------------------------------------------
if __name__ == "__main__":
    DATA_DIR.mkdir(exist_ok=True)
    for ruta in (MATERIALES_DB, HISTORIAL_DB, USUARIOS_DB):
        if not ruta.exists():
            guardar_json(ruta, [])
    print(f"ConstrucCalc disponible en http://localhost:{PORT}")
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
