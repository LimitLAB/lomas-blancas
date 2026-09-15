// Validacion de lo que manda el formulario, manejada por pagina.config.json.
//
// El navegador ya valida, pero esta es la validacion que cuenta: es la unica que
// no se puede saltear abriendo las herramientas de desarrollo.

const { cargar } = require('./_config');

// Vercel corta los cuerpos de request en 4,5 MB y base64 agrega ~33%, asi que el
// tope del archivo original queda bastante por debajo.
const MAX_ARCHIVO_BYTES = 2.5 * 1024 * 1024;

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

function comoTexto(valor, max = 500) {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function nombreDe(campo) {
  return campo.etiqueta || `"${campo.propiedad}"`;
}

function soloDigitos(valor) {
  return valor.replace(/\D/g, '').length;
}

// Devuelve { valores } o { error }. Los archivos quedan como
// { filename, contentType, buffer } listos para subir.
function validarEntrada(datos) {
  const config = cargar();
  const valores = {};

  for (const campo of config.notion.campos) {
    const crudo = datos[campo.id];
    const vacio = crudo === undefined || crudo === null || crudo === '';

    if (vacio) {
      if (campo.requerido) return { error: `Falta completar ${nombreDe(campo)}.` };
      continue;
    }

    switch (campo.tipo) {
      case 'title':
      case 'texto': {
        const v = comoTexto(crudo, campo.maxLargo || 2000);
        if (!v) return { error: `Falta completar ${nombreDe(campo)}.` };
        if (campo.minDigitos && soloDigitos(v) < campo.minDigitos) {
          return { error: `${nombreDe(campo)} esta incompleto.` };
        }
        valores[campo.id] = v;
        break;
      }
      case 'email': {
        const v = comoTexto(crudo, 200);
        if (!EMAIL.test(v)) return { error: `El email no parece valido.` };
        valores[campo.id] = v;
        break;
      }
      case 'telefono': {
        const v = comoTexto(crudo, 40);
        if (soloDigitos(v) < (campo.minDigitos || 8)) {
          return { error: `${nombreDe(campo)} esta incompleto.` };
        }
        valores[campo.id] = v;
        break;
      }
      case 'numero': {
        const v = Number(crudo);
        if (!Number.isFinite(v)) return { error: `${nombreDe(campo)} tiene que ser un numero.` };
        if (campo.min != null && v < campo.min) return { error: `${nombreDe(campo)} tiene que ser ${campo.min} o mas.` };
        if (campo.max != null && v > campo.max) return { error: `${nombreDe(campo)} tiene que ser ${campo.max} o menos.` };
        valores[campo.id] = v;
        break;
      }
      case 'url': {
        const v = comoTexto(crudo, 500);
        try {
          new URL(v);
        } catch {
          return { error: `${nombreDe(campo)} tiene que ser un enlace valido.` };
        }
        valores[campo.id] = v;
        break;
      }
      case 'fecha': {
        const v = comoTexto(crudo, 40);
        if (Number.isNaN(Date.parse(v))) return { error: `${nombreDe(campo)} no es una fecha valida.` };
        valores[campo.id] = v;
        break;
      }
      case 'opcion': {
        const v = comoTexto(crudo, 100);
        if (!campo.opciones.includes(v)) return { error: `Elegi una opcion valida en ${nombreDe(campo)}.` };
        valores[campo.id] = v;
        break;
      }
      case 'opciones': {
        const lista = Array.isArray(crudo) ? crudo.map((x) => comoTexto(x, 100)) : [];
        if (lista.some((v) => !campo.opciones.includes(v))) {
          return { error: `Hay una opcion invalida en ${nombreDe(campo)}.` };
        }
        if (campo.requerido && lista.length === 0) return { error: `Elegi al menos una opcion en ${nombreDe(campo)}.` };
        valores[campo.id] = lista;
        break;
      }
      case 'si_no': {
        if (typeof crudo !== 'boolean') return { error: `Falta responder ${nombreDe(campo)}.` };
        valores[campo.id] = crudo;
        break;
      }
      case 'casilla': {
        if (campo.requerido && crudo !== true) return { error: `Hay que aceptar ${nombreDe(campo)}.` };
        valores[campo.id] = Boolean(crudo);
        break;
      }
      case 'archivo': {
        const contentType = comoTexto(crudo.contentType, 100) || 'application/octet-stream';
        const permitidos = campo.tiposPermitidos || ['image/', 'application/pdf'];
        if (!permitidos.some((t) => contentType.startsWith(t))) {
          return { error: `El archivo de ${nombreDe(campo)} no es de un tipo permitido.` };
        }

        let buffer;
        try {
          buffer = Buffer.from(crudo.dataBase64 || '', 'base64');
        } catch {
          return { error: `No pudimos leer el archivo de ${nombreDe(campo)}.` };
        }
        if (!buffer.length) return { error: `El archivo de ${nombreDe(campo)} llego vacio.` };

        const tope = campo.maxBytes || MAX_ARCHIVO_BYTES;
        if (buffer.length > tope) {
          return { error: `El archivo supera los ${(tope / 1024 / 1024).toFixed(1).replace('.', ',')} MB.` };
        }

        valores[campo.id] = { filename: comoTexto(crudo.filename, 100) || 'archivo', contentType, buffer };
        break;
      }
      default:
        return { error: `Tipo de campo desconocido: ${campo.tipo}.` };
    }
  }

  return { valores };
}

module.exports = { MAX_ARCHIVO_BYTES, validarEntrada };
