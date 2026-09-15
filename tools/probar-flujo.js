#!/usr/bin/env node
// Prueba de flujo de esta pagina: completa los dos pasos y verifica el envio.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.dirname(__dirname);
const PUERTO = (process.argv.find((a) => a.startsWith('--puerto=')) || '').split('=')[1] || '8300';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TRASLADO = 'No tengo auto y necesito que me lleven';

(async () => {
  const ruta = path.join(RAIZ, '.comprobante-prueba.png');
  fs.writeFileSync(ruta, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  const navegador = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 1100 } });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));

  await pagina.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(3500);

  await pagina.locator('input[name=nombre]').fill('Prueba Automatica');
  await pagina.locator('input[name=dni]').fill('34123456');
  await pagina.locator('input[name=telefono]').fill('2615551234');
  await pagina.locator('select[name=traslado]').selectOption(TRASLADO);
  await pagina.getByRole('button', { name: /Continuar/ }).click();
  await pagina.waitForTimeout(600);

  const enPaso2 = await pagina.locator('input[name=comprobante]').isVisible().catch(() => false);
  await pagina.locator('input[name=comprobante]').setInputFiles(ruta);
  await pagina.waitForTimeout(300);
  await pagina.getByRole('button', { name: /Confirmar mi lugar|Enviando/ }).click();
  await pagina.waitForTimeout(2500);

  const exito = await pagina.locator('text=Te veo en la montaña').isVisible().catch(() => false);
  const recibido = JSON.parse(fs.readFileSync(path.join(RAIZ, '.recibido.json'), 'utf8'));

  const fallas = [];
  if (!enPaso2) fallas.push('no se llego al paso 02');
  if (!exito) fallas.push('no se llego a la pantalla de exito');
  const esperado = { nombre: 'Prueba Automatica', dni: '34123456', telefono: '2615551234', traslado: TRASLADO };
  for (const [k, v] of Object.entries(esperado)) {
    if (recibido[k] !== v) fallas.push(`${k}: llego ${JSON.stringify(recibido[k])}, se esperaba ${JSON.stringify(v)}`);
  }
  if (!recibido.comprobante || recibido.comprobante.bytes < 1) fallas.push('el comprobante no llego');
  fallas.push(...errores.map((e) => 'JS: ' + e));

  console.log('recibido por el backend:');
  console.log(JSON.stringify(recibido, null, 2));
  console.log(fallas.length ? '\nFALLAS:\n  ' + fallas.join('\n  ') : '\nFlujo completo ok.');
  await navegador.close();
  process.exit(fallas.length ? 1 : 0);
})();
