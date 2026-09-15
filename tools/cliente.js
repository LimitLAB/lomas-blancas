// Runtime que build.py inyecta dentro de la pagina exportada de Claude Design.
//
// Es el unico puente entre el componente del diseno y el backend. La idea es que
// el componente no sepa nada de fetch, base64 ni codigos HTTP: llama a
// PaginaNotion.estado() y PaginaNotion.enviar() y recibe objetos ya masticados.
(function () {
  // Tiene que coincidir con MAX_ARCHIVO_BYTES en api/_validar.js.
  var MAX_ARCHIVO_BYTES = 2.5 * 1024 * 1024;

  function leerArchivo(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      // readAsDataURL devuelve "data:<mime>;base64,<datos>"; mandamos la segunda mitad.
      reader.onload = function () {
        resolve({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          dataBase64: String(reader.result).split(',')[1] || '',
        });
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  // Lee cuantos lugares hay ocupados. Devuelve null si no se pudo averiguar, y
  // la pagina debe interpretarlo como "todavia no se sabe" y quedarse abierta:
  // mostrar agotado por un error de red seria peor que aceptar uno de mas.
  function estado() {
    return fetch('/api/estado', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (e) { return e && typeof e.total === 'number' ? e : null; })
      .catch(function () { return null; });
  }

  // Manda el formulario. `datos` es un objeto con una clave por cada id de
  // pagina.config.json; los File se convierten solos.
  //
  // Siempre resuelve (nunca rechaza) con:
  //   { ok: true,  estado }          el envio quedo registrado
  //   { ok: false, error, estado? }  hubo un problema, `error` es para mostrar
  function enviar(datos) {
    var cuerpo = {};
    var pendientes = [];

    Object.keys(datos).forEach(function (clave) {
      var valor = datos[clave];
      if (valor instanceof File) {
        if (valor.size > MAX_ARCHIVO_BYTES) {
          pendientes.push(Promise.reject(new Error(
            'El archivo supera los 2,5 MB. Probá con una versión más liviana.'
          )));
          return;
        }
        pendientes.push(leerArchivo(valor).then(function (a) { cuerpo[clave] = a; }));
      } else {
        cuerpo[clave] = valor;
      }
    });

    return Promise.all(pendientes)
      .then(function () {
        return fetch('/api/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (res.ok) return { ok: true, estado: (json && json.estado) || null };
          return {
            ok: false,
            // Cuando rechaza por cupo, el servidor manda el estado al dia para
            // que la pagina se actualice sola en vez de seguir ofreciendo lugar.
            estado: (json && json.estado) || null,
            error: (json && json.error) || 'No pudimos registrar tus datos. Probá de nuevo.',
          };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          estado: null,
          error: err && err.message && err.message.indexOf('MB') !== -1
            ? err.message
            : 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.',
        };
      });
  }

  window.PaginaNotion = {
    MAX_ARCHIVO_BYTES: MAX_ARCHIVO_BYTES,
    enviar: enviar,
    estado: estado,
    leerArchivo: leerArchivo,
  };
})();
