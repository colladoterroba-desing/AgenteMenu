import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import {
  componerMenu,
  listaCompra,
  menuVisible,
  SECCIONES,
  type DiaDelMenu,
  type MenuSemana,
  type Receta,
} from "./menu.js";
import { costeCesta, type TablaPrecios } from "./precios.js";
import type { Despensa, Familia } from "./tipos.js";
import { cantidad, COMIDAS, esc, num } from "./web.js";

export interface DatosPdf {
  familia: Familia;
  menu: MenuSemana;
  recetas: Receta[];
  despensa?: Despensa;
  precios?: TablaPrecios;
  fecha: string;
}

const BASE = `
*{box-sizing:border-box}
body{margin:0;font-family:"Source Sans 3","Segoe UI","DejaVu Sans",Arial,sans-serif;color:#1c2620;font-size:8.5pt;line-height:1.25}
h1{font-size:15pt;margin:0}
.cab{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1.5pt solid #3d6a33;padding-bottom:4pt;margin-bottom:6pt}
.cab p{margin:2pt 0 0;color:#58655d}
.estado{font-weight:700;padding:2pt 6pt;border-radius:3pt;white-space:nowrap}
.estado.borrador{background:#fbefd2;color:#8f6200;border:0.75pt solid #8f6200}
.estado.validado{background:#e1f0e1;color:#2c7a31;border:0.75pt solid #2c7a31}
.pie{margin-top:6pt;color:#58655d;font-size:7.5pt}
`;

function estado(familia: Familia, menu: MenuSemana): string {
  if (menu.estado === "validado" && menu.validacion) {
    return `<span class="estado validado">Validado por ${esc(menu.validacion.por)} · ${esc(menu.validacion.fecha)}</span>`;
  }
  const quien = familia.permisos?.validarMenu?.join(" o ") || "quien tenga permiso";
  return `<span class="estado borrador">BORRADOR · pendiente de validar por ${esc(quien)}</span>`;
}

function celda(dia: DiaDelMenu, tipo: string): string {
  const c = dia.comidas.find((x) => x.tipo === tipo);
  if (!c || !c.platos.length) return `<td class="vacia">—</td>`;
  const [principal, ...variantes] = c.platos;
  const quien = (ids: string[]) => `<span class="quien">${ids.join(" · ")}</span>`;
  if (tipo === "desayuno") {
    return `<td>${c.platos
      .map((p) => `<div class="linea">${quien(p.comensales.map((x) => x.id))} ${esc(p.receta.nombre)}</div>`)
      .join("")}</td>`;
  }
  return `<td>
    <div class="plato">${esc(principal.receta.nombre)}</div>
    ${principal.segundo ? `<div class="plato segundo">${esc(principal.segundo.receta.nombre)}</div>` : ""}
    <div>${quien(principal.comensales.map((x) => x.id))}</div>
    ${variantes.map((v) => `<div class="linea">${quien([v.comensales[0].id])} ${esc(v.receta.nombre)}</div>`).join("")}
    ${principal.prepara ? `<div class="prepara">${esc(principal.prepara)}</div>` : ""}
    ${c.tuppers
      .map(
        (t) => `<div class="tupper ${t.tipoTupper === "frío" ? "frio" : "calor"}"><b>Tupper ${esc(t.para)} (${esc(t.tipoTupper)})</b> ${esc(t.receta.nombre)}${t.segundo ? ` + ${esc(t.segundo.receta.nombre)}` : ""}${t.prepara ? ` <i>· ${esc(t.prepara)}</i>` : ""}</div>`,
      )
      .join("")}
  </td>`;
}

/** Menú de la semana para imprimir en A4 horizontal. */
export function htmlMenuPdf({ familia, menu, recetas, fecha }: DatosPdf): string {
  const dias = menuVisible(familia, componerMenu(familia, menu, recetas));
  const filas = COMIDAS.filter(({ tipo }) => dias.some((d) => d.comidas.some((c) => c.tipo === tipo)));
  const batch = (menu.batch ?? []).flatMap((b) => b.tareas);
  const ocultos = Object.entries(familia.desayunos ?? {}).filter(([, d]) => !d.mostrarEnMenu).map(([id]) => id);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Menú semana ${esc(menu.semana)}</title><style>
@page{size:A4 landscape;margin:9mm}
${BASE}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:0.75pt solid #c9d2c6;padding:3pt 4pt;vertical-align:top;text-align:left}
thead th{background:#3d6a33;color:#fff;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em}
tbody th{width:62pt;background:#eef2ec;font-size:9pt}
.plato{font-weight:700;font-size:8.5pt}
.plato.segundo{margin-top:1.5pt;padding-top:1.5pt;border-top:0.5pt dotted #c9d2c6}
.quien{font-size:6.8pt;font-weight:700;color:#3d6a33}
.linea{margin-top:1.5pt;font-size:8pt}
.prepara{margin-top:2pt;font-size:7pt;color:#8f6200;font-style:italic}
.tupper{margin-top:2.5pt;padding:1.5pt 3pt;font-size:7pt;border-left:2pt solid}
.tupper.frio{border-color:#2c628c;background:#e8f0f6}.tupper.calor{border-color:#a4541a;background:#f8ece1}
.vacia{color:#9aa59d;text-align:center}
</style></head><body>
<header class="cab">
  <div><h1>Menú · semana ${esc(menu.semana)}</h1><p>${esc(familia.nombre)} · generado el ${esc(fecha)}</p></div>
  ${estado(familia, menu)}
</header>
<table>
  <thead><tr><th style="width:62pt"></th>${dias.map((d) => `<th>${esc(d.nombre)}</th>`).join("")}</tr></thead>
  <tbody>${filas.map(({ tipo, nombre }) => `<tr><th>${nombre}</th>${dias.map((d) => celda(d, tipo)).join("")}</tr>`).join("")}</tbody>
</table>
<p class="pie">${batch.length ? `<b>Batch del domingo:</b> ${batch.map(esc).join(" · ")}<br>` : ""}${
    ocultos.length ? `Desayunos fijos no incluidos (${ocultos.join(", ")}): se cuentan en la lista de la compra.` : ""
  }</p>
</body></html>`;
}

/** Lista de la compra para imprimir en A4 vertical. */
export function htmlCompraPdf({ familia, menu, recetas, despensa, precios, fecha }: DatosPdf): string {
  const lista = listaCompra(componerMenu(familia, menu, recetas), despensa);
  const total = SECCIONES.reduce((s, x) => s + lista[x].length, 0);
  // Coste por producto en la tienda más barata con precio real; sin precios, no hay columna.
  const cesta = precios ? costeCesta(lista, precios) : undefined;
  const conPrecios = Boolean(cesta?.hayPrecios);
  const costeDe = (nombre: string, unidad: string) => {
    const l = cesta?.lineas.find((x) => x.nombre === nombre && x.unidad === unidad);
    return l?.masBarata ? { coste: l.porTienda[l.masBarata].coste, donde: l.masBarata } : undefined;
  };
  const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de la compra semana ${esc(menu.semana)}</title><style>
@page{size:A4 portrait;margin:10mm 12mm}
${BASE}
body{font-size:9pt}
.secciones{columns:2;column-gap:10mm}
section{break-inside:avoid;margin-bottom:6pt}
h2{font-size:10.5pt;margin:0 0 3pt;color:#3d6a33;border-bottom:0.75pt solid #c9d2c6;padding-bottom:2pt;display:flex;justify-content:space-between}
h2 span{color:#58655d;font-weight:400;font-size:8pt}
ul{list-style:none;margin:0;padding:0}
li{display:grid;grid-template-columns:10pt 1fr auto${conPrecios ? " 40pt" : ""};gap:5pt;align-items:baseline;padding:1.9pt 0;border-bottom:0.5pt dotted #c9d2c6}
.caja{width:8pt;height:8pt;border:0.9pt solid #1c2620;border-radius:1.5pt;display:inline-block;transform:translateY(1pt)}
.cant{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.en-casa{color:#9aa59d;text-decoration:line-through}
.eur{text-align:right;color:#58655d;font-size:8.5pt;white-space:nowrap;font-variant-numeric:tabular-nums}
.eur.real{color:#2c7a31;font-weight:700}
.coste-pdf{margin:0 0 6pt;padding:4pt 8pt;background:#eef2ec;border-radius:3pt;font-size:8.5pt}
</style></head><body>
<header class="cab">
  <div><h1>Lista de la compra · semana ${esc(menu.semana)}</h1><p>${esc(familia.nombre)} · ${total} productos · generado el ${esc(fecha)}</p></div>
  ${estado(familia, menu)}
</header>
${
  cesta && conPrecios
    ? `<p class="coste-pdf"><b>Coste con precios de tickets: ${euros(cesta.optimizada.total)}</b> · ${Object.entries(cesta.optimizada.porTienda)
        .map(([t, v]) => `${esc(t)} ${euros(v)}`)
        .join(" · ")}${cesta.optimizada.sinPrecio ? ` · ${cesta.optimizada.sinPrecio} productos sin precio (—)` : ""}</p>`
    : ""
}
<div class="secciones">${SECCIONES.filter((s) => lista[s].length)
    .map(
      (s) => `<section><h2>${esc(s)} <span>${lista[s].length}</span></h2><ul>${lista[s]
        .map(
          (l) =>
            `<li${l.comprar === 0 ? ' class="en-casa"' : ""}><span class="caja"></span><span>${esc(l.nombre)}</span><span class="cant">${
              l.comprar === 0 ? "en casa" : cantidad(l.comprar, l.unidad)
            }</span>${
              conPrecios
                ? (() => {
                    const c = costeDe(l.nombre, l.unidad);
                    return c
                      ? `<span class="eur real">${euros(c.coste)} <small>${esc(c.donde.slice(0, 3))}</small></span>`
                      : `<span class="eur">—</span>`;
                  })()
                : ""
            }</li>`,
        )
        .join("")}</ul></section>`,
    )
    .join("")}</div>

<p class="pie">Incluye todo el menú, los tuppers y los desayunos fijos, redondeado hacia arriba${
    despensa?.productos.length ? " y descontando la despensa" : ""
  }. Sal, especias y caldo no se cuentan.</p>
</body></html>`;
}

/** Chromium: CHROMIUM_PATH si está definido; si no, el de Playwright o el Chrome instalado. */
async function abrirNavegador(): Promise<Browser> {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

async function main() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const leer = async <T>(f: string) => JSON.parse(await readFile(path.join(raiz, "data", f), "utf8")) as T;
  const datos: DatosPdf = {
    familia: await leer<Familia>("familia.json"),
    menu: await leer<MenuSemana>("menu-semana.json"),
    recetas: (await leer<{ recetas: Receta[] }>("recetas.json")).recetas,
    despensa: await leer<Despensa>("despensa.json"),
    precios: await leer<TablaPrecios>("precios.json").catch(() => undefined),
    fecha: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
  };
  const salida = path.join(raiz, "salidas");
  await mkdir(salida, { recursive: true });

  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    const semana = datos.menu.semana;
    const documentos = [
      { html: htmlMenuPdf(datos), fichero: `menu-semana-${semana}.pdf`, landscape: true },
      { html: htmlCompraPdf(datos), fichero: `lista-compra-semana-${semana}.pdf`, landscape: false },
    ];
    // Propuesta de la semana siguiente, si existe.
    const siguiente = await leer<MenuSemana>("menu-siguiente.json").catch(() => undefined);
    if (siguiente) {
      const datosSiguiente = { ...datos, menu: siguiente };
      documentos.push(
        { html: htmlMenuPdf(datosSiguiente), fichero: `menu-semana-${siguiente.semana}.pdf`, landscape: true },
        { html: htmlCompraPdf(datosSiguiente), fichero: `lista-compra-semana-${siguiente.semana}.pdf`, landscape: false },
      );
    }
    for (const { html, fichero, landscape } of documentos) {
      await pagina.setContent(html, { waitUntil: "load" });
      await pagina.pdf({ path: path.join(salida, fichero), format: "A4", landscape, printBackground: true, preferCSSPageSize: true });
      console.log(`PDF generado: salidas/${fichero}`);
    }
  } finally {
    await navegador.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
