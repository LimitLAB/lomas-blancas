// GET /api/diagnostico
//
// Chequeo de configuracion para usar despues de conectar Notion. No devuelve
// datos de las personas ni el token: solo dice si el backend puede hablar con la
// base y, si no puede, por que.

const { cargar } = require('./_config');
const { estado } = require('./_notion');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  let config;
  try {
    config = cargar();
  } catch (err) {
    return res.status(500).json({ ok: false, problema: err.message });
  }

  const informe = {
    pagina: config.nombre,
    tokenConfigurado: Boolean(process.env.NOTION_TOKEN),
    dataSourceId: config.notion.dataSourceId,
    campos: config.notion.campos.map((c) => `${c.id} → ${c.propiedad} (${c.tipo})`),
    cupos: config.cupos.activo ? config.cupos : 'sin cupos',
  };

  if (!informe.tokenConfigurado) {
    return res.status(500).json({
      ...informe,
      ok: false,
      problema: 'Falta NOTION_TOKEN en las variables de entorno del proyecto en Vercel.',
    });
  }

  try {
    return res.status(200).json({ ...informe, ok: true, estado: await estado() });
  } catch (err) {
    return res.status(502).json({
      ...informe,
      ok: false,
      problema:
        'El token existe pero no se pudo leer la base. Revisá que la integración esté ' +
        'conectada a la base en Notion (menú ··· → Conexiones) y que el dataSourceId sea el correcto.',
      detalleDeNotion: err.message,
    });
  }
};
