"""Parches de la pagina Cerro Lomas Blancas.

El diseno usa formularios nativos con `name` en vez de estado de React, asi que
el cableado se apoya en FormData. Ademas no traia lugar para errores, para el
cupo agotado ni para el envio en curso: los tres se agregan aca.
"""

import re

# --- Envoltorio del bundle ---------------------------------------------------

PRECARGA_RE = re.compile(
    r'\n *<div id="__bundler_thumbnail">.*?</div>\n *<div id="__bundler_loading">.*?</div>\n',
    re.S,
)

PARCHES_BUNDLE = [
    ("pantalla de precarga", PRECARGA_RE, "\n"),
]

# --- CSS ---------------------------------------------------------------------

CSS_BASE = """
  /* El boton nativo del <input type="file"> viene con la tipografia del sistema
     y desentona con el blanco y negro del resto. */
  .pn-archivo { width: 100%; max-width: 100%; box-sizing: border-box; }
  .pn-archivo::file-selector-button {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: .18em;
    text-transform: uppercase;
    background: #000;
    color: #fff;
    border: 0;
    padding: 10px 14px;
    margin-right: 12px;
    cursor: pointer;
  }
  .pn-archivo:disabled { opacity: .5; }

  @media (max-width: 640px) {
    /* Apilado, el boton entra en cualquier idioma del navegador y el nombre del
       archivo tiene el ancho completo para mostrarse. */
    .pn-archivo::file-selector-button { display: block; width: 100%; margin: 0 0 10px; }
  }
"""

# --- Textos que el diseno dejo sin completar ---------------------------------
#
# La fecha y el precio quedaron con texto de relleno ("Fecha a confirmar" y
# "$ —"). Hay que cambiarlos en DOS lugares:
#
#   1. El atributo data-props del <script>, que es de donde el runtime saca los
#      valores. Ahi van escapados como entidades HTML.
#   2. El fallback `this.props.X ?? '...'` de renderVals.
#
# Cambiar solo el fallback no alcanza: el runtime completa this.props con los
# defaults de data-props, asi que el ?? nunca llega a dispararse. Se cambian los
# dos para que no queden diciendo cosas distintas.

PROPS_FECHA_VIEJO = "&quot;default&quot;:&quot;Fecha a confirmar&quot;"
PROPS_FECHA_NUEVO = "&quot;default&quot;:&quot;26 de septiembre&quot;"

PROPS_PRECIO_VIEJO = "&quot;default&quot;:&quot;$ —&quot;"
PROPS_PRECIO_NUEVO = "&quot;default&quot;:&quot;$40.000&quot;"

FECHA_VIEJO = "fecha: this.props.fecha ?? 'Fecha a confirmar',"
FECHA_NUEVO = "fecha: this.props.fecha ?? '26 de septiembre',"

PRECIO_VIEJO = "precio: this.props.precio ?? '$ —',"
PRECIO_NUEVO = "precio: this.props.precio ?? '$40.000',"

# --- Componente --------------------------------------------------------------

ESTADO_VIEJO = "  state = { enviado: false, paso: 1 };"

ESTADO_NUEVO = """  state = { enviado: false, paso: 1, datos: null, enviando: false, error: '', estado: null };

  // Si la consulta falla, estado queda en null y el formulario sigue abierto:
  // preferimos una inscripcion de mas que un cupo agotado que no existe.
  componentDidMount() {
    PaginaNotion.estado().then(estado => { if (estado) this.setState({ estado }); });
  }"""

VALS_VIEJO = """  renderVals() {
    const wa = this.props.whatsapp ?? '+54 9 261 304 1556';
    return {"""

VALS_NUEVO = """  renderVals() {
    const wa = this.props.whatsapp ?? '+54 9 261 304 1556';
    const agotado = !!this.state.estado && this.state.estado.lleno === true;
    return {
      agotado,
      error: this.state.error,
      hayError: !!this.state.error,
      enviando: this.state.enviando,
      botonLabel: this.state.enviando ? 'Enviando…' : 'Confirmar mi lugar →',"""

# Con el cupo lleno el formulario no se muestra: lo reemplaza el cartel.
FORM_VISIBLE_VIEJO = "      formVisible: !this.state.enviado,"
FORM_VISIBLE_NUEVO = "      formVisible: !this.state.enviado && !agotado,"

CONTINUAR_VIEJO = "      onContinuar: (e) => { e.preventDefault(); this.setState({ paso: 2 }); },"

CONTINUAR_NUEVO = """      onContinuar: (e) => {
        e.preventDefault();
        // El paso 01 se desmonta al pasar al 02, asi que los valores hay que
        // leerlos ahora: despues esos inputs ya no existen en el DOM.
        const f = new FormData(e.target);
        this.setState({
          paso: 2,
          error: '',
          datos: {
            nombre: f.get('nombre'),
            dni: f.get('dni'),
            telefono: f.get('telefono'),
            traslado: f.get('traslado'),
          },
        });
      },"""

SUBMIT_VIEJO = "      onSubmit: (e) => { e.preventDefault(); this.setState({ enviado: true }); }"

SUBMIT_NUEVO = """      onSubmit: async (e) => {
        e.preventDefault();
        if (this.state.enviando) return;

        const comprobante = new FormData(e.target).get('comprobante');
        if (!comprobante || !comprobante.size) {
          return this.setState({ error: 'Subí el comprobante de la transferencia.' });
        }

        this.setState({ enviando: true, error: '' });
        const r = await PaginaNotion.enviar({ ...this.state.datos, comprobante });
        // Cuando rechaza por cupo el servidor manda el estado al dia, asi la
        // pagina se actualiza sola en vez de seguir ofreciendo lugar.
        if (r.estado) this.setState({ estado: r.estado });
        if (!r.ok) return this.setState({ enviando: false, error: r.error });
        this.setState({ enviado: true, enviando: false, error: '' });
      }"""

# --- Markup ------------------------------------------------------------------

ERROR_HTML = """<sc-if value="{{hayError}}" hint-placeholder-val="{{false}}">
              <p style="margin:18px 0 0;border-left:3px solid #000;background:var(--ink-050);padding:11px 14px;font-family:var(--font-mono);font-size:12px;line-height:1.5;color:#000">{{error}}</p>
            </sc-if>
            """

# Los dos botones de submit comparten el mismo style, asi que el anclaje tiene
# que incluir su texto, que es lo unico distinto entre ellos.
BOTON1_VIEJO = '>Continuar →</button>'
BOTON1_NUEVO = '>Continuar →</button>'

PASO1_ANCLA = '<button type="submit" style="width:100%;margin-top:24px;background:#000;color:#fff;border:1.5px solid #000;font-family:var(--font-display);font-weight:600;text-transform:uppercase;letter-spacing:.12em;font-size:15px;padding:17px;min-height:52px;cursor:pointer" style-hover="background:#fff;color:#000">Continuar →</button>'
PASO1_NUEVO = ERROR_HTML + PASO1_ANCLA

PASO2_ANCLA = '<button type="submit" style="width:100%;margin-top:24px;background:#000;color:#fff;border:1.5px solid #000;font-family:var(--font-display);font-weight:600;text-transform:uppercase;letter-spacing:.12em;font-size:15px;padding:17px;min-height:52px;cursor:pointer" style-hover="background:#fff;color:#000">Confirmar mi lugar →</button>'
PASO2_NUEVO = ERROR_HTML + PASO2_ANCLA.replace(
    'style-hover="background:#fff;color:#000">Confirmar mi lugar →</button>',
    'style-hover="background:#fff;color:#000" disabled="{{enviando}}">{{botonLabel}}</button>',
)

ARCHIVO_VIEJO = '<input type="file" name="comprobante" required="required" accept="image/*,.pdf"'
ARCHIVO_NUEVO = '<input type="file" name="comprobante" class="pn-archivo" required="required" accept="image/*,.pdf" disabled="{{enviando}}"'

# El cartel de cupo agotado toma el mismo formato que el de registro recibido.
AGOTADO_ANCLA = '      <sc-if value="{{formVisible}}" hint-placeholder-val="{{true}}">'

AGOTADO_PANEL = """      <sc-if value="{{agotado}}" hint-placeholder-val="{{false}}">
        <div style="padding:clamp(24px,4vw,48px) 0">
          <p style="font-family:var(--font-mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-500);margin:0 0 14px">Inscripciones cerradas</p>
          <h3 style="font-family:var(--font-display);font-weight:600;text-transform:uppercase;font-size:clamp(22px,2.6vw,32px);line-height:1.05;margin:0 0 12px">Cupo completo</h3>
          <p style="margin:0;font-size:15px;line-height:1.7;color:var(--ink-500)">Se agotaron los {{cupo}} lugares de esta salida. Escribinos por WhatsApp y te avisamos si se libera alguno.</p>
        </div>
      </sc-if>

""" + AGOTADO_ANCLA

PARCHES_TEMPLATE = [
    ("fecha en data-props", PROPS_FECHA_VIEJO, PROPS_FECHA_NUEVO),
    ("precio en data-props", PROPS_PRECIO_VIEJO, PROPS_PRECIO_NUEVO),
    ("fecha en renderVals", FECHA_VIEJO, FECHA_NUEVO),
    ("precio en renderVals", PRECIO_VIEJO, PRECIO_NUEVO),
    ("estado del componente", ESTADO_VIEJO, ESTADO_NUEVO),
    ("valores del template", VALS_VIEJO, VALS_NUEVO),
    ("formulario oculto si esta agotado", FORM_VISIBLE_VIEJO, FORM_VISIBLE_NUEVO),
    ("captura de los datos del paso 01", CONTINUAR_VIEJO, CONTINUAR_NUEVO),
    ("envio del formulario", SUBMIT_VIEJO, SUBMIT_NUEVO),
    ("error en el paso 01", PASO1_ANCLA, PASO1_NUEVO),
    ("error y estado de envio en el paso 02", PASO2_ANCLA, PASO2_NUEVO),
    ("clase del input de archivo", ARCHIVO_VIEJO, ARCHIVO_NUEVO),
    ("cartel de cupo agotado", AGOTADO_ANCLA, AGOTADO_PANEL),
]
