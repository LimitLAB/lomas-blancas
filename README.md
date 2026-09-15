# Cerro Lomas Blancas — Inscripción

Página de inscripción a la expedición del **26 de septiembre** (Vallecitos,
Mendoza). **20 cupos**, inscripción **$20.000**.

Sitio estático con tres funciones serverless que guardan las inscripciones en
Notion. Hecho con [kit-paginas](https://github.com/LimitLAB/kit-paginas).

## Estructura

```
design/            export original de Claude Design (no se publica)
pagina.config.json qué campos tiene el form y a qué propiedad de Notion va cada uno
index.html         GENERADO por tools/build.py — no editar a mano
api/               estado (cupos), enviar (alta) y diagnostico (chequeo)
tools/             build, parches, backend simulado y pruebas
```

## Campos

| Formulario | Propiedad en Notion | Tipo |
|---|---|---|
| Nombre y apellido | `Nombre y apellido` | title |
| DNI | `DNI` | text |
| WhatsApp | `WhatsApp` | phone_number |
| ¿Cómo vas a Vallecitos? | `Traslado` | select |
| Comprobante | `Comprobante` | file |
| — | `Estado` | status (se crea en `Sin empezar`) |

Al llegar a 20 inscriptos, el formulario se reemplaza por un cartel de cupo
completo. El servidor revalida el cupo antes de escribir, porque el número que
tiene el navegador se leyó al cargar la página.

Si Notion no responde, el formulario queda **abierto**: para una inscripción es
preferible una anotación de más que un "agotado" falso.

## Puesta en marcha

1. **Vercel** — importar este repo. Sin build command: es HTML estático y Vercel
   detecta `api/` como funciones sin configuración.
2. **Variables de entorno** — agregar `NOTION_TOKEN` y **redesplegar**: las
   variables no se aplican al despliegue que ya está corriendo.
3. **Deployment Protection** → Vercel Authentication → **Disabled**. Si no, la
   página le pide login de Vercel a todo el mundo.
4. **Verificar** — abrir `/api/diagnostico`.

## Trabajo local

```bash
python3 tools/build.py                       # regenera index.html
python3 tools/simular.py --escenario libre   # backend falso, no toca Notion
node tools/probar.js --capturas              # revisa la página en 4 anchos
node tools/probar-flujo.js                   # completa el formulario y verifica
node tools/probar-api.js                     # prueba la API con fetch stubeado
```

Escenarios de `simular.py`: `libre`, `lleno`, `caido`.

## Editar

`index.html` es generado. Los cambios van en `tools/parches.py` (diseño y
cableado) o en `pagina.config.json` (campos y cupos), y después `build.py`.

Si el diseño se re-exporta desde Claude Design, pisá el archivo de `design/` y
volvé a construir: si algún parche ya no encuentra su lugar, el script dice cuál.
