#!/usr/bin/env python3
"""Backend simulado para probar la pagina sin tocar Notion.

    python3 tools/simular.py [--puerto 8100] [--escenario libre|opcion-llena|lleno|caido]

Sirve index.html y responde /api/estado y /api/enviar con datos inventados a
partir de pagina.config.json. Lo que manda el formulario queda en
.recibido.json, para verificar que llega lo que tiene que llegar.
"""

import argparse
import base64
import http.server
import json
import os
import socketserver

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = json.load(open(os.path.join(RAIZ, "pagina.config.json"), encoding="utf-8"))
RECIBIDO = os.path.join(RAIZ, ".recibido.json")


def opciones_de_cupo():
    cupos = CONFIG.get("cupos") or {}
    if not cupos.get("campo"):
        return []
    campo = next((c for c in CONFIG["notion"]["campos"] if c["id"] == cupos["campo"]), None)
    return campo.get("opciones", []) if campo else []


def estado(escenario):
    cupos = CONFIG.get("cupos") or {}
    activo = cupos.get("activo", False)
    total_cupo = cupos.get("total")
    opciones = opciones_de_cupo()

    def tope(opcion):
        por = cupos.get("porOpcion")
        if por is None:
            return None
        return por if isinstance(por, (int, float)) else por.get(opcion)

    por_opcion = {o: 0 for o in opciones}
    llenas = []
    total = 0

    if escenario == "opcion-llena" and opciones:
        primera = opciones[0]
        por_opcion[primera] = tope(primera) or 0
        llenas = [primera]
        total = por_opcion[primera]
    elif escenario == "lleno":
        total = total_cupo or 0
        for o in opciones:
            por_opcion[o] = tope(o) or 0
        llenas = list(opciones)
    else:
        total = 2
        for i, o in enumerate(opciones):
            por_opcion[o] = 1 if i == 0 else 0

    return {
        "total": total,
        "cupoTotal": total_cupo if activo else None,
        "lleno": bool(activo and total_cupo is not None and total >= total_cupo),
        "porOpcion": por_opcion,
        "cupoPorOpcion": {o: tope(o) for o in opciones},
        "opcionesLlenas": llenas,
    }


def servidor(puerto, escenario):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=RAIZ, **k)

        def log_message(self, *a):
            pass

        def _json(self, code, obj):
            cuerpo = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_GET(self):
            if self.path.startswith("/api/estado"):
                if escenario == "caido":
                    return self._json(503, {"error": "simulando Notion caido"})
                return self._json(200, estado(escenario))
            return super().do_GET()

        def do_POST(self):
            if not self.path.startswith("/api/enviar"):
                return self._json(404, {"error": "ruta desconocida"})

            datos = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))

            # Los archivos se guardan resumidos: interesa el tamano, no el contenido.
            resumen = {}
            for clave, valor in datos.items():
                if isinstance(valor, dict) and "dataBase64" in valor:
                    crudo = base64.b64decode(valor["dataBase64"] or "")
                    resumen[clave] = {
                        "filename": valor.get("filename"),
                        "contentType": valor.get("contentType"),
                        "bytes": len(crudo),
                    }
                else:
                    resumen[clave] = valor
            with open(RECIBIDO, "w", encoding="utf-8") as f:
                json.dump(resumen, f, ensure_ascii=False, indent=2)

            if escenario == "lleno":
                return self._json(409, {"error": "Se agotaron los lugares.", "estado": estado(escenario)})
            return self._json(201, {"ok": True, "estado": estado(escenario)})

    socketserver.TCPServer.allow_reuse_address = True
    return socketserver.TCPServer(("127.0.0.1", puerto), Handler)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--puerto", type=int, default=8100)
    p.add_argument("--escenario", default="libre",
                   choices=["libre", "opcion-llena", "lleno", "caido"])
    args = p.parse_args()
    print(f"simulando '{args.escenario}' en http://127.0.0.1:{args.puerto}")
    servidor(args.puerto, args.escenario).serve_forever()
