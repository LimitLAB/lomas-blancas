// Cliente de Notion manejado por pagina.config.json.
//
// Cubre lo que necesita una pagina con formulario: contar filas, crear una fila
// nueva y adjuntar archivos. Sin dependencias: usa fetch, FormData y Blob, que
// vienen en el runtime de Node de Vercel.

const { TIPOS, cargar, cupoDeOpcion } = require('./_config');

const NOTION_API = 'https://api.notion.com/v1';

// Version de la API de Notion. La 2025-09-03 es la que introduce las data
// sources; con una anterior las rutas /data_sources no existen.
const NOTION_VERSION = '2025-09-03';

class NotionError extends Error {
  constructor(mensaje, status) {
    super(mensaje);
    this.status = status;
  }
}

function token() {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new NotionError('Falta la variable de entorno NOTION_TOKEN.', 500);
  return t;
}

async function notion(ruta, { method = 'POST', body } = {}) {
  const res = await fetch(`${NOTION_API}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* Notion devolvio algo que no es JSON; queda el texto crudo en el error. */
  }

  if (!res.ok) {
    const detalle = (json && json.message) || texto || res.statusText;
    throw new NotionError(`Notion respondio ${res.status}: ${detalle}`, res.status);
  }
  return json;
}

// Recorre la data source entera. Notion pagina de a 100 filas.
async function filas() {
  const { notion: cfg } = cargar();
  const todas = [];
  let cursor;
  do {
    const pagina = await notion(`/data_sources/${cfg.dataSourceId}/query`, {
      body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    todas.push(...(pagina.results || []));
    cursor = pagina.has_more ? pagina.next_cursor : null;
  } while (cursor);
  return todas;
}

// Estado de ocupacion, en la forma que consume la pagina.
async function estado() {
  const config = cargar();
  const { cupos } = config;
  const todas = await filas();

  const salida = {
    total: todas.length,
    cupoTotal: cupos.activo ? cupos.total ?? null : null,
    lleno: false,
    porOpcion: {},
    cupoPorOpcion: {},
    opcionesLlenas: [],
  };

  if (!cupos.activo) return salida;

  if (cupos.total != null && todas.length >= cupos.total) salida.lleno = true;

  if (cupos.campo) {
    const campo = config.notion.campos.find((c) => c.id === cupos.campo);
    for (const opcion of campo.opciones) {
      salida.porOpcion[opcion] = 0;
      salida.cupoPorOpcion[opcion] = cupoDeOpcion(cupos, opcion);
    }
    for (const fila of todas) {
      const valor = fila.properties?.[campo.propiedad]?.select?.name;
      if (valor && valor in salida.porOpcion) salida.porOpcion[valor] += 1;
    }
    for (const opcion of campo.opciones) {
      const tope = salida.cupoPorOpcion[opcion];
      if (tope != null && salida.porOpcion[opcion] >= tope) salida.opcionesLlenas.push(opcion);
    }
  }

  return salida;
}

// Sube un archivo y devuelve el id que se referencia desde la propiedad file.
// Notion acepta hasta 20 MB por esta ruta de un solo paso.
async function subirArchivo({ filename, contentType, buffer }) {
  const subida = await notion('/file_uploads', {
    body: { filename, content_type: contentType },
  });

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);

  const res = await fetch(subida.upload_url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Notion-Version': NOTION_VERSION },
    body: form,
  });

  if (!res.ok) throw new NotionError(`Falló la subida de "${filename}": ${await res.text()}`, 502);
  return subida.id;
}

// Traduce un valor ya validado a la forma que espera la API de Notion.
function propiedadDeCampo(campo, valor) {
  switch (campo.tipo) {
    case 'title':    return { title: [{ text: { content: valor } }] };
    case 'texto':    return { rich_text: [{ text: { content: valor } }] };
    case 'email':    return { email: valor };
    case 'telefono': return { phone_number: valor };
    case 'numero':   return { number: valor };
    case 'url':      return { url: valor };
    case 'fecha':    return { date: { start: valor } };
    case 'opcion':   return { select: { name: valor } };
    case 'opciones': return { multi_select: valor.map((v) => ({ name: v })) };
    case 'casilla':  return { checkbox: valor };
    case 'si_no': {
      const etiquetas = campo.etiquetas || { si: 'Sí', no: 'No' };
      return { select: { name: valor ? etiquetas.si : etiquetas.no } };
    }
    case 'archivo':
      return {
        files: [{ type: 'file_upload', file_upload: { id: valor.fileUploadId }, name: valor.filename }],
      };
    default:
      throw new NotionError(`Tipo de campo sin traduccion a Notion: ${campo.tipo}`, 500);
  }
}

function propiedadFija(fijo) {
  switch (fijo.tipo) {
    case 'estado':  return { status: { name: fijo.valor } };
    case 'opcion':  return { select: { name: fijo.valor } };
    case 'texto':   return { rich_text: [{ text: { content: fijo.valor } }] };
    case 'casilla': return { checkbox: Boolean(fijo.valor) };
    case 'fecha':
      // "hoy" evita tener que hardcodear una fecha en la configuracion.
      return { date: { start: fijo.valor === 'hoy' ? new Date().toISOString() : fijo.valor } };
    default:
      throw new NotionError(`Tipo de valor fijo sin traduccion: ${fijo.tipo}`, 500);
  }
}

// Crea la fila. `valores` viene de validarEntrada(), ya limpio.
async function crearFila(valores) {
  const config = cargar();
  const properties = {};

  for (const campo of config.notion.campos) {
    const valor = valores[campo.id];
    if (valor === undefined || valor === null || valor === '') continue;
    properties[campo.propiedad] = propiedadDeCampo(campo, valor);
  }
  for (const fijo of config.notion.valoresFijos || []) {
    properties[fijo.propiedad] = propiedadFija(fijo);
  }

  return notion('/pages', {
    body: {
      parent: { type: 'data_source_id', data_source_id: config.notion.dataSourceId },
      properties,
    },
  });
}

module.exports = { NOTION_VERSION, NotionError, crearFila, estado, filas, notion, subirArchivo, TIPOS };
