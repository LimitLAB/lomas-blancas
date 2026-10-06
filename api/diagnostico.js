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

  // Nombres (nunca valores) de las variables que el runtime ve y que mencionan
  // Notion. Sirve para distinguir un error de tipeo —un espacio al final, un
  // guion en vez de guion bajo— de una variable que directamente no llego al
  // despliegue. Van entre comillas para que el espacio sobrante se vea.
  const variablesNotion = Object.keys(process.env)
    .filter((k) => /notion/i.test(k))
    .map((k) => JSON.stringify(k));

  const informe = {
    pagina: config.nombre,
    tokenConfigurado: Boolean(process.env.NOTION_TOKEN),
    variablesNotionDetectadas: variablesNotion.length ? variablesNotion : 'ninguna',
    // Vercel inyecta estas solo. Sirven para dos cosas: saber que commit esta
    // sirviendo —y por lo tanto si un redespliegue ya ocurrio— y comprobar que
    // el mecanismo de variables funciona. Si estas llegan y NOTION_TOKEN no, la
    // variable no esta cargada en ESTE proyecto y entorno.
    despliegue: {
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'desconocido',
      entorno: process.env.VERCEL_ENV || 'desconocido',
      proyecto: process.env.VERCEL_PROJECT_PRODUCTION_URL || 'desconocido',
    },
    dataSourceId: config.notion.dataSourceId,
    campos: config.notion.campos.map((c) => `${c.id} → ${c.propiedad} (${c.tipo})`),
    cupos: config.cupos.activo ? config.cupos : 'sin cupos',
  };

  if (!informe.tokenConfigurado) {
    // El caso mas comun no es que falte la variable, sino que este cargada con
    // otro nombre (NOTION, NOTION_KEY, NOTION_TOKEN con un espacio al final).
    // Nombrarla acá ahorra el ida y vuelta de "ya la cargué y sigue sin andar".
    const parecidas = variablesNotion.filter((n) => n !== '"NOTION_TOKEN"');
    return res.status(500).json({
      ...informe,
      ok: false,
      problema: parecidas.length
        ? `El proyecto tiene la variable ${parecidas.join(', ')}, pero el backend lee ` +
          'NOTION_TOKEN: el nombre tiene que ser exactamente ese. Una variable marcada ' +
          'como Sensitive no se puede renombrar, hay que borrarla y crearla de nuevo.'
        : 'Falta NOTION_TOKEN en las variables de entorno del proyecto en Vercel.',
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
