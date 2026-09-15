// GET /api/estado
//
// Cuantos lugares hay ocupados, en total y por opcion. La pagina lo consulta al
// cargar para decidir que mostrar como agotado.

const { estado } = require('./_notion');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // El estado cambia con cada envio: nunca servir una copia cacheada.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    return res.status(200).json(await estado());
  } catch (err) {
    console.error('[estado] no se pudo leer la base:', err);
    // La pagina trata cualquier fallo como "todavia no se sabe" y deja el
    // formulario abierto: para un formulario es preferible una anotacion de mas
    // que un cartel de agotado que no corresponde.
    return res.status(503).json({ error: 'No se pudo leer el estado.' });
  }
};
