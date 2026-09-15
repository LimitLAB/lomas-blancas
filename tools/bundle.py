"""Lectura y escritura del template dentro de un export de Claude Design.

Claude Design exporta la pagina como un bundle autocontenido: un HTML que lleva
el HTML real adentro de un <script type="__bundler/template"> como string JSON,
junto con las fuentes, las imagenes y React en base64, y lo desempaqueta en el
navegador.

Este modulo es la parte reutilizable entre paginas: abrir ese sobre sin romperlo
y volver a cerrarlo. Lo especifico de cada pagina va en parches.py.
"""

import json
import re

TEMPLATE_RE = re.compile(
    r'(<script type="__bundler/template">\s*)(.*?)(\s*</script>)', re.S
)


class BundleInvalido(Exception):
    pass


def leer_template(bundle):
    """Devuelve (template, reemplazar) para el bundle dado.

    `reemplazar(nuevo_template)` devuelve el bundle completo con el template
    cambiado, respetando el escapado que espera el navegador.
    """
    match = TEMPLATE_RE.search(bundle)
    if not match:
        raise BundleInvalido(
            "El archivo no parece un export de Claude Design: no tiene "
            '<script type="__bundler/template">.'
        )

    def reemplazar(nuevo):
        # ensure_ascii deja el bundle en ASCII puro, como lo genera Claude Design.
        #
        # El replace de "</" NO es opcional: el template contiene "</script>" y,
        # sin escapar esa barra, el navegador cierra el <script> contenedor en esa
        # primera aparicion en vez de al final, y la pagina queda rota sin ningun
        # error visible. El bundler original hace exactamente lo mismo.
        serializado = json.dumps(nuevo).replace("</", "<\\u002F")
        return (
            bundle[: match.start()]
            + match.group(1) + serializado + match.group(3)
            + bundle[match.end():]
        )

    return json.loads(match.group(2)), reemplazar


def aplicar(texto, parches, donde):
    """Aplica (nombre, viejo, nuevo) exigiendo exactamente una coincidencia.

    Fallar es deliberado: si el diseno se re-exporta y un anclaje ya no existe,
    es mejor cortar que publicar una pagina a medio conectar.
    """
    for nombre, viejo, nuevo in parches:
        if hasattr(viejo, "subn"):
            texto, veces = viejo.subn(nuevo, texto)
        else:
            veces = texto.count(viejo)
            if veces == 1:
                texto = texto.replace(viejo, nuevo)
        if veces != 1:
            raise BundleInvalido(
                f"El parche '{nombre}' ({donde}) esperaba 1 coincidencia y encontro {veces}.\n"
                "El export de Claude Design cambio: hay que actualizar tools/parches.py."
            )
    return texto


def inyectar_css(template, css):
    """Agrega CSS al <style> del <helmet>, que es el que sobrevive al render."""
    ancla = "</style>\n</helmet>"
    if template.count(ancla) != 1:
        raise BundleInvalido("No se encontro el <style> del helmet para inyectar el CSS.")
    return template.replace(ancla, f"\n{css}\n{ancla}")


def inyectar_js(template, js):
    """Agrega un <script> justo antes del componente del diseno.

    Va antes para que el runtime exista cuando el componente corra, aunque en la
    practica el componente recien lo usa en componentDidMount.
    """
    ancla = '<script type="text/x-dc"'
    if template.count(ancla) != 1:
        raise BundleInvalido("No se encontro el <script type=\"text/x-dc\"> del componente.")
    return template.replace(ancla, f"<script>\n{js}\n</script>\n\n{ancla}", 1)
