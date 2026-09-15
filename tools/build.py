#!/usr/bin/env python3
"""Genera index.html a partir del export de Claude Design.

    python3 tools/build.py                 design/*.html  ->  index.html
    python3 tools/build.py --ver-template  imprime el HTML de adentro del bundle

index.html es generado: no editarlo a mano. Para cambiar el diseno se re-exporta
desde Claude Design, se pisa el archivo de design/ y se vuelve a correr esto.
"""

import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parches as P
from bundle import BundleInvalido, aplicar, inyectar_css, inyectar_js, leer_template

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def export():
    encontrados = sorted(glob.glob(os.path.join(RAIZ, "design", "*.html")))
    if not encontrados:
        raise SystemExit(
            "No hay ningun .html en design/.\n"
            "Exporta la pagina desde Claude Design y guardala ahi."
        )
    if len(encontrados) > 1:
        nombres = ", ".join(os.path.basename(e) for e in encontrados)
        raise SystemExit(f"Hay mas de un export en design/ ({nombres}). Dejá solo el vigente.")
    return encontrados[0]


def main(argv):
    origen = export()
    bundle = open(origen, encoding="utf-8").read()

    # El envoltorio se parchea primero: leer_template usa posiciones dentro del
    # string y estas ediciones las correrian.
    bundle = aplicar(bundle, P.PARCHES_BUNDLE, "envoltorio")
    template, reemplazar = leer_template(bundle)

    if "--ver-template" in argv:
        print(template)
        return

    cliente = open(os.path.join(RAIZ, "tools", "cliente.js"), encoding="utf-8").read()
    template = inyectar_js(template, cliente)
    template = inyectar_css(template, P.CSS_BASE)
    template = aplicar(template, P.PARCHES_TEMPLATE, "template")

    salida = os.path.join(RAIZ, "index.html")
    contenido = reemplazar(template)
    open(salida, "w", encoding="utf-8").write(contenido)

    total = len(P.PARCHES_BUNDLE) + len(P.PARCHES_TEMPLATE) + 2
    print(f"index.html: {total} cambios aplicados ({len(contenido):,} bytes)")
    if not P.PARCHES_TEMPLATE:
        print(
            "\n  Aviso: PARCHES_TEMPLATE esta vacio, asi que el formulario todavia\n"
            "  no llama a PaginaNotion y no va a guardar nada en Notion.\n"
            "  Ver tools/parches.py."
        )


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except BundleInvalido as err:
        raise SystemExit(f"\n{err}\n")
