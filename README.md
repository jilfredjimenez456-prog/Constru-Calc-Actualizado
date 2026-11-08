# ConstrucCalc

Calculadora de materiales de construcción. Frontend HTML/CSS/JS y backend en Python (Flask).

## Cómo ejecutarlo

```bash
pip install -r requirements.txt
python server.py
```

Abrir http://localhost:3000 (en Windows, si `python` no funciona, usar `py`).

## Qué incluye el backend (`server.py`)

- `POST /api/registro`: crea un usuario y abre sesión. Responde `Bienvenido <usuario>`.
- `POST /api/login`: inicia sesión con usuario o correo.
- `POST /api/logout`: cierra la sesión.
- `GET /api/sesion`: devuelve el usuario con sesión activa.
- `/api/materiales`: CRUD de materiales (igual que antes).
- `/api/historial`: historial de cálculos (igual que antes).

## Datos

Todo se guarda en `data/*.json`. Las contraseñas se guardan con hash (scrypt), nunca en texto plano.
`data/usuarios.json` y `data/secret.key` se crean solos al primer uso y están en `.gitignore`: no se suben a GitHub.
