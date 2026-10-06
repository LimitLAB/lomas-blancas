# lomas-blancas

Pagina estatica con formulario conectado a Notion, desplegada en Vercel.

## Estructura

```
design/            export de Claude Design (el original, no se publica)
pagina.config.json que campos tiene el form y a que propiedad de Notion va cada uno
index.html         GENERADO por tools/build.py — no editar a mano
api/               funciones serverless (estado, envio, diagnostico)
tools/             build, parches, backend simulado y pruebas
```

## Flujo de trabajo

```bash
# 1. Regenerar la pagina despues de tocar el diseno o los parches
python3 tools/build.py

# 2. Levantar el backend simulado (no toca Notion)
python3 tools/simular.py --escenario libre

# 3. En otra terminal, revisar la pagina en un navegador real
node tools/probar.js --capturas
```

Escenarios de `simular.py`: `libre`, `opcion-llena`, `lleno`, `caido`.
Lo que manda el formulario queda en `.recibido.json`.

## Puesta en marcha

1. **Notion** — crear la integracion, copiar el token y conectarla a la base
   (menu `···` → Conexiones). Sin ese ultimo paso el token existe pero no ve nada.
2. **Vercel** — importar el repo y agregar `NOTION_TOKEN` en las variables de
   entorno. Redesplegar: las variables no se aplican al despliegue que ya corre.
3. **Verificar** — abrir `/api/diagnostico`.
4. **Publicar** — Settings → Deployment Protection → Vercel Authentication →
   **Disabled**, o la pagina sigue pidiendo login de Vercel.

El paso a paso completo esta en el `docs/runbook.md` del kit.

## Variables de entorno

| Variable | Obligatoria | Para que |
|---|---|---|
| `NOTION_TOKEN` | si | Token de la integracion |
| `NOTION_DATA_SOURCE_ID` | no | Pisa el `dataSourceId` de la configuracion |
