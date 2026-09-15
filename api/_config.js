// Lee pagina.config.json y lo valida al arrancar.
//
// La configuracion es el contrato entre el formulario y la base de Notion: dice
// que campos existen, a que propiedad va cada uno y como se validan. Si esta mal
// escrita conviene enterarse con un error claro y no con un 502 de Notion tres
// pasos mas adelante, asi que se valida entera la primera vez que se carga.

const fs = require('fs');
const path = require('path');

// Cada tipo declara como se valida la entrada y como se arma la propiedad de
// Notion. Agregar un tipo nuevo es agregar una entrada aca.
const TIPOS = {
  title:    { notion: 'title' },
  texto:    { notion: 'rich_text' },
  email:    { notion: 'email' },
  telefono: { notion: 'phone_number' },
  numero:   { notion: 'number' },
  url:      { notion: 'url' },
  fecha:    { notion: 'date' },
  opcion:   { notion: 'select', requiereOpciones: true },
  opciones: { notion: 'multi_select', requiereOpciones: true },
  si_no:    { notion: 'select' },
  casilla:  { notion: 'checkbox' },
  archivo:  { notion: 'files' },
};

const TIPOS_FIJOS = {
  estado:  'status',
  opcion:  'select',
  texto:   'rich_text',
  casilla: 'checkbox',
  fecha:   'date',
};

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function error(mensaje) {
  throw new Error(`pagina.config.json: ${mensaje}`);
}

function validar(config) {
  const notion = config.notion;
  if (!notion) error('falta la seccion "notion".');

  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID || notion.dataSourceId;
  if (!dataSourceId || !UUID.test(dataSourceId)) {
    error('"notion.dataSourceId" tiene que ser el UUID de la data source. Se saca con la URL de la base (ver docs/runbook.md).');
  }

  if (!Array.isArray(notion.campos) || notion.campos.length === 0) {
    error('"notion.campos" tiene que ser una lista con al menos un campo.');
  }

  const ids = new Set();
  let titulos = 0;

  for (const campo of notion.campos) {
    if (!campo.id) error('hay un campo sin "id".');
    if (ids.has(campo.id)) error(`el id "${campo.id}" esta repetido.`);
    ids.add(campo.id);

    if (!campo.propiedad) error(`el campo "${campo.id}" no dice a que "propiedad" de Notion va.`);
    if (!TIPOS[campo.tipo]) {
      error(`el campo "${campo.id}" usa el tipo "${campo.tipo}", que no existe. Tipos validos: ${Object.keys(TIPOS).join(', ')}.`);
    }
    if (TIPOS[campo.tipo].requiereOpciones && !Array.isArray(campo.opciones)) {
      error(`el campo "${campo.id}" es de tipo "${campo.tipo}" y necesita la lista "opciones".`);
    }
    if (campo.tipo === 'title') titulos += 1;
  }

  // Notion exige exactamente una propiedad title por fila, y la rechaza sin ella.
  if (titulos !== 1) {
    error(`tiene que haber exactamente un campo de tipo "title" (hay ${titulos}). Es la columna que Notion usa como nombre de la fila.`);
  }

  for (const fijo of notion.valoresFijos || []) {
    if (!fijo.propiedad) error('hay un valor fijo sin "propiedad".');
    if (!TIPOS_FIJOS[fijo.tipo]) {
      error(`el valor fijo de "${fijo.propiedad}" usa el tipo "${fijo.tipo}". Tipos validos: ${Object.keys(TIPOS_FIJOS).join(', ')}.`);
    }
  }

  const cupos = config.cupos || { activo: false };
  if (cupos.activo) {
    if (cupos.total == null && cupos.porOpcion == null) {
      error('"cupos.activo" esta en true pero no hay ni "total" ni "porOpcion".');
    }
    if (cupos.porOpcion != null) {
      if (!cupos.campo) error('"cupos.porOpcion" necesita que "cupos.campo" diga por que campo agrupar.');
      const campo = notion.campos.find((c) => c.id === cupos.campo);
      if (!campo) error(`"cupos.campo" apunta a "${cupos.campo}", que no es ninguno de los campos.`);
      if (campo.tipo !== 'opcion') error(`"cupos.campo" tiene que apuntar a un campo de tipo "opcion" (${cupos.campo} es "${campo.tipo}").`);
    }
  }

  return { ...config, cupos, notion: { ...notion, dataSourceId } };
}

let cache;

function cargar() {
  if (cache) return cache;
  const ruta = path.join(__dirname, '..', 'pagina.config.json');
  let crudo;
  try {
    crudo = fs.readFileSync(ruta, 'utf8');
  } catch {
    throw new Error('No se encontro pagina.config.json en la raiz del proyecto.');
  }
  cache = validar(JSON.parse(crudo));
  return cache;
}

// Devuelve el tope de cupo de una opcion. porOpcion acepta un numero (mismo tope
// para todas) o un objeto con un tope distinto por opcion.
function cupoDeOpcion(cupos, opcion) {
  if (cupos.porOpcion == null) return null;
  if (typeof cupos.porOpcion === 'number') return cupos.porOpcion;
  return cupos.porOpcion[opcion] ?? null;
}

module.exports = { TIPOS, TIPOS_FIJOS, cargar, cupoDeOpcion, validar };
