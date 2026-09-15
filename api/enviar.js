// POST /api/enviar
//
// Recibe el formulario y crea la fila en Notion. El cuerpo es JSON, con un campo
// por cada id declarado en pagina.config.json. Los archivos viajan como
// { filename, contentType, dataBase64 }.

const { cargar, cupoDeOpcion } = require('./_config');
const { crearFila, estado, subirArchivo } = require('./_notion');
const { validarEntrada } = require('./_validar');

async function leerJson(req) {
  // Segun el runtime, Vercel puede haber parseado el cuerpo por nosotros.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const partes = [];
  for await (const parte of req) partes.push(parte);
  const crudo = Buffer.concat(partes).toString('utf8');
  return crudo ? JSON.parse(crudo) : {};
}

// Revisa el cupo contra Notion. El numero que tiene el navegador se leyo al
// cargar la pagina y pudo quedar viejo mientras la persona completaba el form.
function revisarCupo(config, actual, valores) {
  const { cupos } = config;
  if (!cupos.activo) return null;

  if (cupos.total != null && actual.total >= cupos.total) {
    return `Se agotaron los ${cupos.total} lugares.`;
  }
  if (cupos.campo) {
    const opcion = valores[cupos.campo];
    const tope = cupoDeOpcion(cupos, opcion);
    if (tope != null && (actual.porOpcion[opcion] ?? 0) >= tope) {
      return `${opcion} ya llego a ${tope} y esta agotado.`;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  let datos;
  try {
    datos = await leerJson(req);
  } catch {
    return res.status(400).json({ error: 'No pudimos leer los datos del formulario.' });
  }

  const config = cargar();
  const { valores, error } = validarEntrada(datos);
  if (error) return res.status(400).json({ error });

  try {
    const actual = await estado();
    const lleno = revisarCupo(config, actual, valores);
    if (lleno) return res.status(409).json({ error: lleno, estado: actual });

    // Los archivos se suben primero: recien con el id devuelto se puede armar la
    // propiedad file de la fila.
    for (const campo of config.notion.campos) {
      if (campo.tipo !== 'archivo' || !valores[campo.id]) continue;
      const archivo = valores[campo.id];
      archivo.fileUploadId = await subirArchivo(archivo);
    }

    await crearFila(valores);

    return res.status(201).json({ ok: true, estado: await estado() });
  } catch (err) {
    console.error('[enviar] no se pudo registrar el envio:', err);
    return res.status(502).json({ error: 'No pudimos registrar tus datos. Probá de nuevo en un minuto.' });
  }
};
