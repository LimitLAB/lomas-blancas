#!/usr/bin/env node
// Revisa index.html en un navegador real, a varios anchos.
//
//   node tools/probar.js [--puerto 8100] [--capturas]
//
// Busca lo que rompe una pagina y no se ve leyendo el codigo: errores de
// JavaScript, scroll horizontal y elementos que se salen de la pantalla. Requiere
// tools/simular.py corriendo.
//
// Si falta playwright:  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright

const fs = require('fs');
const path = require('path');

const RAIZ = path.dirname(__dirname);
const ANCHOS = [
  ['mobile', 390, 844],
  ['mobile grande', 430, 932],
  ['tablet', 768, 1024],
  ['desktop', 1440, 900],
];

function chromium() {
  const { chromium } = require('playwright');
  // En algunos entornos el chromium que trae playwright no coincide con el que
  // hay instalado; si existe una ruta conocida se usa esa.
  const rutas = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter(Boolean);
  const encontrada = rutas.find((r) => fs.existsSync(r));
  return chromium.launch(
    encontrada ? { executablePath: encontrada, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }
  );
}

(async () => {
  const puerto = (process.argv.find((a) => a.startsWith('--puerto=')) || '').split('=')[1] || '8100';
  const capturas = process.argv.includes('--capturas');
  const base = `http://127.0.0.1:${puerto}/index.html`;

  const navegador = await chromium();
  let problemas = 0;

  for (const [etiqueta, w, h] of ANCHOS) {
    const pagina = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w <= 430 ? 2 : 1 });
    const errores = [];
    pagina.on('pageerror', (e) => errores.push('JS: ' + e.message));
    // Los 404 se detectan por la respuesta y no por la consola: el mensaje de
    // consola no dice que recurso fallo, y sin la URL el aviso no sirve de nada.
    pagina.on('response', (r) => {
      if (r.status() < 400) return;
      const url = r.url();
      if (/favicon/.test(url)) return;
      errores.push(`HTTP ${r.status()} en ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    });
    pagina.on('requestfailed', (r) => {
      if (!/favicon/.test(r.url())) errores.push('no cargo: ' + r.url().slice(0, 80));
    });

    try {
      await pagina.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (e) {
      console.log(`${etiqueta.padEnd(14)} NO CARGA — ¿está corriendo tools/simular.py?`);
      problemas += 1;
      await pagina.close();
      continue;
    }
    // El bundle tarda en desempaquetar: sin esta espera se mide una pagina vacia.
    await pagina.waitForTimeout(3500);

    const medida = await pagina.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const desbordan = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          // Los decorativos suelen estar posicionados a proposito fuera de la caja.
          if (getComputedStyle(el).position === 'absolute') return false;
          return r.right > vw + 1;
        })
        .slice(0, 5)
        .map((el) => el.tagName.toLowerCase() + ': ' + (el.textContent || '').trim().slice(0, 30));
      return {
        vw,
        scroll: document.documentElement.scrollWidth,
        desbordan,
        runtime: typeof window.PaginaNotion === 'object',
        texto: document.body.innerText.trim().length,
      };
    });

    const fallas = [];
    if (medida.scroll > medida.vw + 1) fallas.push(`scroll horizontal (${medida.scroll} > ${medida.vw})`);
    if (medida.desbordan.length) fallas.push(`${medida.desbordan.length} elemento(s) se salen: ${medida.desbordan.join(' | ')}`);
    if (!medida.runtime) fallas.push('PaginaNotion no esta definido (¿corriste tools/build.py?)');
    if (medida.texto < 50) fallas.push('la pagina se ve vacia (el bundle no desempaquetó)');
    fallas.push(...errores);

    if (fallas.length) {
      problemas += fallas.length;
      console.log(`${etiqueta.padEnd(14)} ${w}px  FALLA`);
      fallas.forEach((f) => console.log(`               - ${f}`));
    } else {
      console.log(`${etiqueta.padEnd(14)} ${w}px  ok`);
    }

    if (capturas) {
      const dir = path.join(RAIZ, '.capturas');
      fs.mkdirSync(dir, { recursive: true });
      await pagina.screenshot({ path: path.join(dir, `${w}.png`), fullPage: true });
    }
    await pagina.close();
  }

  await navegador.close();
  if (capturas) console.log('\ncapturas en .capturas/');
  console.log(problemas ? `\n${problemas} problema(s).` : '\nTodo ok.');
  process.exit(problemas ? 1 : 0);
})();
