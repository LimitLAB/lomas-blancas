#!/usr/bin/env node
// Prueba los endpoints contra un Notion falso.
//
//   node tools/probar-api.js
//
// Stubea fetch, asi que no toca la base ni necesita token. Verifica la forma
// exacta de los requests que saldrian hacia Notion segun pagina.config.json, que
// es donde se cuelan los errores de mapeo.

const assert = require('assert');
const path = require('path');

process.env.NOTION_TOKEN = 'token_de_prueba';

const RAIZ = path.dirname(__dirname);
const { cargar } = require(path.join(RAIZ, 'api/_config'));

const llamadas = [];
function stub(respuestas) {
  llamadas.length = 0;
  global.fetch = async (url, opts = {}) => {
    llamadas.push({ url: String(url), body: opts.body, esForm: opts.body instanceof FormData });
    const r = respuestas.shift();
    if (!r) throw new Error('fetch inesperado hacia ' + url);
    return { ok: r.ok !== false, status: r.status || 200, statusText: '', text: async () => JSON.stringify(r.json ?? {}) };
  };
}

function respuesta() {
  const o = { code: null, payload: null, headers: {} };
  o.setHeader = (k, v) => { o.headers[k] = v; };
  o.status = (c) => { o.code = c; return { json: (p) => { o.payload = p; return o; } }; };
  return o;
}

// Arma un envio valido a partir de la configuracion, para no tener que
// mantener a mano un ejemplo por cada pagina.
function envioValido(config) {
  const datos = {};
  for (const campo of config.notion.campos) {
    switch (campo.tipo) {
      case 'title':
      case 'texto':    datos[campo.id] = campo.minDigitos ? '1'.repeat(campo.minDigitos + 1) : 'Texto de prueba'; break;
      case 'email':    datos[campo.id] = 'prueba@ejemplo.com'; break;
      case 'telefono': datos[campo.id] = '1'.repeat((campo.minDigitos || 8) + 2); break;
      case 'numero':   datos[campo.id] = campo.min ?? 1; break;
      case 'url':      datos[campo.id] = 'https://ejemplo.com'; break;
      case 'fecha':    datos[campo.id] = new Date().toISOString(); break;
      case 'opcion':   datos[campo.id] = campo.opciones[0]; break;
      case 'opciones': datos[campo.id] = [campo.opciones[0]]; break;
      case 'si_no':    datos[campo.id] = true; break;
      case 'casilla':  datos[campo.id] = true; break;
      case 'archivo':
        datos[campo.id] = {
          filename: 'prueba.png', contentType: 'image/png',
          dataBase64: Buffer.from('datos-de-prueba').toString('base64'),
        };
        break;
    }
  }
  return datos;
}

function filaCon(config, opcion) {
  const properties = {};
  if (config.cupos.campo) {
    const campo = config.notion.campos.find((c) => c.id === config.cupos.campo);
    properties[campo.propiedad] = { select: { name: opcion } };
  }
  return { properties };
}

(async () => {
  const config = cargar();
  const enviar = require(path.join(RAIZ, 'api/enviar'));
  const estado = require(path.join(RAIZ, 'api/estado'));
  const archivos = config.notion.campos.filter((c) => c.tipo === 'archivo');

  console.log(`configuracion: ${config.nombre}`);
  console.log(`  ${config.notion.campos.length} campos, cupos ${config.cupos.activo ? 'activos' : 'desactivados'}\n`);

  // --- estado ---------------------------------------------------------------
  stub([{ json: { results: [{ properties: {} }, { properties: {} }], has_more: false } }]);
  let r = respuesta();
  await estado({ method: 'GET' }, r);
  assert.strictEqual(r.code, 200, 'GET /api/estado deberia responder 200');
  assert.strictEqual(r.payload.total, 2);
  assert.strictEqual(r.headers['Cache-Control'], 'no-store, max-age=0', 'el estado no se debe cachear');
  console.log('estado             ok  ->', JSON.stringify(r.payload));

  // --- paginacion -----------------------------------------------------------
  stub([
    { json: { results: [{ properties: {} }], has_more: true, next_cursor: 'c2' } },
    { json: { results: [{ properties: {} }], has_more: false } },
  ]);
  r = respuesta();
  await estado({ method: 'GET' }, r);
  assert.strictEqual(r.payload.total, 2, 'deberia sumar las dos paginas');
  assert.ok(llamadas[1].body.includes('"start_cursor":"c2"'), 'deberia paginar con el cursor');
  console.log('paginacion         ok');

  // --- envio valido ---------------------------------------------------------
  const respuestasEnvio = [{ json: { results: [], has_more: false } }];
  archivos.forEach((_, i) => {
    respuestasEnvio.push({ json: { id: `fu_${i}`, upload_url: `https://notion/subir/${i}` } });
    respuestasEnvio.push({ json: { ok: true } });
  });
  respuestasEnvio.push({ json: { id: 'pagina_1' } });
  respuestasEnvio.push({ json: { results: [], has_more: false } });

  stub(respuestasEnvio);
  r = respuesta();
  await enviar({ method: 'POST', body: envioValido(config) }, r);
  assert.strictEqual(r.code, 201, `POST /api/enviar deberia responder 201, respondio ${r.code}: ${JSON.stringify(r.payload)}`);

  const creacion = JSON.parse(llamadas.find((l) => l.url.endsWith('/v1/pages')).body);
  assert.strictEqual(creacion.parent.data_source_id, config.notion.dataSourceId);
  for (const campo of config.notion.campos) {
    assert.ok(creacion.properties[campo.propiedad], `falta la propiedad "${campo.propiedad}" en la fila`);
  }
  for (const fijo of config.notion.valoresFijos || []) {
    assert.ok(creacion.properties[fijo.propiedad], `falta el valor fijo "${fijo.propiedad}"`);
  }
  console.log('envio valido       ok  -> propiedades:', Object.keys(creacion.properties).join(', '));
  if (archivos.length) {
    assert.ok(llamadas.some((l) => l.esForm), 'el archivo deberia subirse como FormData');
    console.log('subida de archivo  ok  ->', archivos.length, 'archivo(s)');
  }

  // --- validaciones: falta un requerido -------------------------------------
  const requerido = config.notion.campos.find((c) => c.requerido);
  if (requerido) {
    stub([]);
    r = respuesta();
    const incompleto = envioValido(config);
    delete incompleto[requerido.id];
    await enviar({ method: 'POST', body: incompleto }, r);
    assert.strictEqual(r.code, 400, 'un requerido faltante deberia dar 400');
    assert.strictEqual(llamadas.length, 0, 'no deberia llamar a Notion con datos invalidos');
    console.log('requerido faltante ok  ->', JSON.stringify(r.payload.error));
  }

  // --- validaciones: opcion invalida ----------------------------------------
  const opcion = config.notion.campos.find((c) => c.tipo === 'opcion');
  if (opcion) {
    stub([]);
    r = respuesta();
    await enviar({ method: 'POST', body: { ...envioValido(config), [opcion.id]: 'Opcion Inventada' } }, r);
    assert.strictEqual(r.code, 400, 'una opcion fuera de la lista deberia dar 400');
    console.log('opcion invalida    ok  ->', JSON.stringify(r.payload.error));
  }

  // --- cupos ----------------------------------------------------------------
  if (config.cupos.activo && config.cupos.total != null) {
    stub([{ json: { results: Array(config.cupos.total).fill(filaCon(config, null)), has_more: false } }]);
    r = respuesta();
    await enviar({ method: 'POST', body: envioValido(config) }, r);
    assert.strictEqual(r.code, 409, 'con el cupo total lleno deberia dar 409');
    console.log('cupo total lleno   ok  ->', JSON.stringify(r.payload.error));
  }

  if (config.cupos.activo && config.cupos.campo) {
    const campo = config.notion.campos.find((c) => c.id === config.cupos.campo);
    const primera = campo.opciones[0];
    const tope = typeof config.cupos.porOpcion === 'number' ? config.cupos.porOpcion : config.cupos.porOpcion[primera];
    stub([{ json: { results: Array(tope).fill(filaCon(config, primera)), has_more: false } }]);
    r = respuesta();
    await enviar({ method: 'POST', body: { ...envioValido(config), [campo.id]: primera } }, r);
    assert.strictEqual(r.code, 409, 'con la opcion llena deberia dar 409');
    console.log('opcion llena       ok  ->', JSON.stringify(r.payload.error));
  }

  console.log('\nTodo ok.');
})().catch((e) => { console.error('\nFALLO:', e.message); process.exit(1); });
