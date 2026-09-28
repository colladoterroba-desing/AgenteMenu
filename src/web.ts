import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcularNecesidades, kcalDeporteDiarias, tasaMetabolicaBasal } from "./nutricion.js";
import { componerMenu, listaCompra, SECCIONES, type DiaDelMenu, type LineaCompra, type MenuSemana, type Racion, type Receta, type Seccion } from "./menu.js";
import { type TipoComida } from "./planificacion.js";
import { NOMBRE_DIA, type Despensa, type Dia, type Familia, type Miembro } from "./tipos.js";

interface PlatoTupper {
  dia: Dia;
  plato: string;
  detalle: string;
  kcal: number;
  cocina?: string;
}

export interface PropuestaTuppers {
  ajusteConObjetivo: Record<string, string>;
  semanas: Record<string, Record<string, PlatoTupper[]>>;
}

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (n: number, decimales = 0) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const DEPORTE: Record<string, string> = {
  running: "Running",
  yoga_funcional: "Yoga funcional",
  natacion: "Natación",
  futbol_entrenamiento: "Fútbol (entreno)",
  futbol_partido: "Fútbol (partido)",
  educacion_fisica: "Educación física",
};

const COMIDAS: { tipo: TipoComida; nombre: string }[] = [
  { tipo: "desayuno", nombre: "Desayuno" },
  { tipo: "almuerzo", nombre: "Almuerzo" },
  { tipo: "comida", nombre: "Comida" },
  { tipo: "merienda", nombre: "Merienda" },
  { tipo: "cena", nombre: "Cena" },
];

// Escala del IMC que se dibuja (kg/m²).
const IMC_MIN = 16;
const IMC_MAX = 34;
const posImc = (v: number) => ((Math.min(Math.max(v, IMC_MIN), IMC_MAX) - IMC_MIN) / (IMC_MAX - IMC_MIN)) * 100;

function tarjetaMiembro(m: Miembro, familia: Familia): string {
  const n = calcularNecesidades(m, familia.objetivos[m.id]);
  const estado =
    n.clasificacion === "normopeso"
      ? { clase: "bien", texto: "Normopeso" }
      : n.clasificacion === "sobrepeso" || n.clasificacion === "obesidad"
        ? { clase: "aviso", texto: n.clasificacion === "sobrepeso" ? "Sobrepeso" : "Obesidad" }
        : n.clasificacion === "bajo peso"
          ? { clase: "aviso", texto: "Bajo peso" }
          : { clase: "info", texto: "Menor: percentiles" };
  const deportes = m.actividades
    .map((a) => `<li>${esc(DEPORTE[a.deporte] ?? a.deporte)} <span class="mono">${a.dias.join(" ")} · ${a.minutos} min</span></li>`)
    .join("");
  const objetivo = n.objetivoActivo
    ? `<p class="nota bien-borde"><strong>Objetivo acordado:</strong> ${num(n.objetivoActivo.pesoObjetivoKg, 1)} kg en ${n.objetivoActivo.semanas} semanas · ${num(n.objetivoActivo.kcalDiarias)} kcal/día</p>`
    : n.propuestaObjetivo
      ? `<p class="nota aviso-borde"><strong>Propuesta pendiente de acordar:</strong> ${num(n.propuestaObjetivo.pesoObjetivoKg, 1)} kg en unas ${n.propuestaObjetivo.semanas} semanas, con ${num(n.propuestaObjetivo.kcalDiarias)} kcal/día. Conviene consultarlo con su médico.</p>`
      : !m.edad || m.edad < 18
        ? `<p class="nota">Sin restricciones calóricas: prioridad al crecimiento y al deporte. Dudas de peso, con su pediatra.</p>`
        : "";
  const imcEscala =
    m.edad >= 18
      ? `<div class="imc" aria-label="IMC ${num(n.imc, 1)} en una escala de ${IMC_MIN} a ${IMC_MAX}">
          <div class="imc-bandas">
            <span style="width:${posImc(18.5)}%" class="b-bajo"></span>
            <span style="width:${posImc(25) - posImc(18.5)}%" class="b-normal"></span>
            <span style="width:${posImc(30) - posImc(25)}%" class="b-sobre"></span>
            <span style="width:${100 - posImc(30)}%" class="b-obes"></span>
          </div>
          <span class="imc-marca" style="left:${posImc(n.imc)}%"></span>
          <div class="imc-ejes mono"><span style="left:${posImc(18.5)}%">18,5</span><span style="left:${posImc(25)}%">25</span><span style="left:${posImc(30)}%">30</span></div>
        </div>`
      : "";

  return `<article class="persona">
    <header class="persona-cab">
      <div>
        <h3>${esc(m.id)}</h3>
        <p class="sub">${m.edad} años · ${m.sexo === "V" ? "varón" : "mujer"} · ${m.alturaCm} cm · ${m.pesoKg} kg</p>
      </div>
      <span class="chip ${estado.clase}">${estado.texto}</span>
    </header>
    <dl class="cifras">
      <div><dt>IMC</dt><dd class="mono">${num(n.imc, 1)}</dd></div>
      <div><dt>Gasto diario</dt><dd class="mono">${num(n.gastoDiario)}<small> kcal</small></dd></div>
      <div><dt>Ración</dt><dd class="mono">×${num(n.factorRacion, 2)}</dd></div>
    </dl>
    ${imcEscala}
    <ul class="deportes">${deportes || "<li>Sin deporte registrado</li>"}</ul>
    <p class="rol"><span class="etq">En la cocina</span> ${esc(familia.roles[m.id] ?? "—")}${m.gustos.length ? ` · <span class="etq">Gustos</span> ${esc(m.gustos.join(", "))}` : ""}</p>
    ${objetivo}
  </article>`;
}

function graficoEnergia(familia: Familia): string {
  const filas = familia.miembros.map((m) => {
    const tmb = tasaMetabolicaBasal(m);
    return { id: m.id, tmb, vida: tmb * 0.4, deporte: kcalDeporteDiarias(m) };
  });
  const max = Math.ceil(Math.max(...filas.map((f) => f.tmb + f.vida + f.deporte)) / 500) * 500;
  const ticks = Array.from({ length: max / 500 + 1 }, (_, i) => i * 500);
  const pct = (v: number) => (v / max) * 100;
  const segmento = (clase: string, nombre: string, id: string, v: number) =>
    `<span class="seg ${clase}" style="width:${pct(v)}%" tabindex="0" data-tip="${esc(`${id} · ${nombre}: ${num(v)} kcal`)}"></span>`;

  return `<figure class="grafico" aria-labelledby="g-titulo">
    <figcaption>
      <h3 id="g-titulo">De dónde sale el gasto diario</h3>
      <p class="sub">kcal al día: metabolismo basal, actividad cotidiana y deporte semanal repartido entre 7 días</p>
      <ul class="leyenda">
        <li><span class="muestra s1"></span>Metabolismo basal</li>
        <li><span class="muestra s2"></span>Actividad cotidiana</li>
        <li><span class="muestra s3"></span>Deporte</li>
      </ul>
    </figcaption>
    <div class="barras">
      ${filas
        .map(
          (f) => `<div class="fila">
        <span class="fila-id">${esc(f.id)}</span>
        <div class="pista">
          ${ticks.map((t) => `<span class="rejilla" style="left:${pct(t)}%"></span>`).join("")}
          <div class="pila">${segmento("s1", "metabolismo basal", f.id, f.tmb)}${segmento("s2", "actividad cotidiana", f.id, f.vida)}${segmento("s3", "deporte", f.id, f.deporte)}</div>
          <span class="total mono" style="left:${pct(f.tmb + f.vida + f.deporte)}%">${num(f.tmb + f.vida + f.deporte)}</span>
        </div>
      </div>`,
        )
        .join("")}
      <div class="fila ejes"><span class="fila-id"></span><div class="pista">${ticks
        .map((t) => `<span class="tick mono" style="left:${pct(t)}%">${num(t)}</span>`)
        .join("")}</div></div>
    </div>
    <details class="tabla-datos">
      <summary>Ver los datos en tabla</summary>
      <div class="scroll"><table>
        <thead><tr><th>Miembro</th><th>Basal</th><th>Cotidiana</th><th>Deporte</th><th>Total</th></tr></thead>
        <tbody>${filas
          .map(
            (f) =>
              `<tr><td>${esc(f.id)}</td><td class="mono">${num(f.tmb)}</td><td class="mono">${num(f.vida)}</td><td class="mono">${num(f.deporte)}</td><td class="mono">${num(f.tmb + f.vida + f.deporte)}</td></tr>`,
          )
          .join("")}</tbody>
      </table></div>
    </details>
  </figure>`;
}

const TECNICA: Record<string, string> = {
  "sin cocinar": "Sin cocinar",
  plancha: "Plancha",
  horno: "Horno",
  guiso: "Cazuela",
  frío: "Frío",
};

const comensalesChips = (r: Racion) =>
  r.comensales
    .map((c) => `<span class="comensal" title="${esc(`${c.id}: ${num(c.kcal)} kcal`)}">${esc(c.id)}</span>`)
    .join("");

function celdaMenu(dia: DiaDelMenu, tipo: TipoComida): string {
  const c = dia.comidas.find((x) => x.tipo === tipo);
  if (!c || !c.platos.length) return `<td class="vacia"><span class="sub">—</span></td>`;
  if (tipo === "desayuno" && c.platos.length > 1) {
    return `<td><ul class="desayunos-dia">${c.platos
      .map((p) => `<li>${comensalesChips(p)} <a href="#r-${esc(p.receta.id)}">${esc(p.receta.nombre)}</a></li>`)
      .join("")}</ul></td>`;
  }
  const [principal, ...variantes] = c.platos;
  const variantesHtml = variantes
    .map(
      (v) => `<p class="variante"><span class="comensal">${esc(v.comensales[0].id)}</span> <a href="#r-${esc(v.receta.id)}">${esc(v.receta.nombre)}</a></p>`,
    )
    .join("");
  const tuppers = c.tuppers
    .map(
      (t) => `<div class="tupper-linea ${t.tipoTupper === "frío" ? "frio" : "calor"}">
        <span class="tupper-etq">Tupper ${esc(t.para)} · ${esc(t.tipoTupper)}</span>
        <a href="#r-${esc(t.receta.id)}">${esc(t.receta.nombre)}</a>
        ${t.prepara ? `<span class="prepara">${esc(t.prepara)}</span>` : ""}
      </div>`,
    )
    .join("");
  return `<td>
    <a class="plato-menu" href="#r-${esc(principal.receta.id)}">${esc(principal.receta.nombre)}</a>
    <div class="comensales">${comensalesChips(principal)}<span class="raciones mono">×${num(principal.raciones, 2)}</span></div>
    ${variantesHtml}
    ${principal.prepara ? `<p class="prepara">${esc(principal.prepara)}</p>` : ""}
    ${tuppers}
  </td>`;
}

function desayunosHabituales(familia: Familia, dias: DiaDelMenu[]): string {
  if (!familia.desayunos) return "";
  const platos = dias[0]?.comidas.find((c) => c.tipo === "desayuno")?.platos ?? [];
  const receta = (id: string) => platos.find((p) => p.comensales.some((c) => c.id === id));
  const almuerzo = familia.regimen.almuerzo ?? {};
  return `<aside class="batch desayunos">
    <h3>Desayunos de cada uno, todos los días</h3>
    <ul>${Object.entries(familia.desayunos)
      .map(([id, d]) => {
        const r = receta(id);
        const kcal = r?.comensales.find((c) => c.id === id)?.kcal;
        const a = almuerzo[id];
        return `<li><span class="comensal">${esc(id)}</span> <a href="#r-${esc(d.receta)}">${esc(r?.receta.nombre ?? d.receta)}</a>${kcal ? ` <span class="sub mono">~${num(kcal)} kcal objetivo</span>` : ""}${
          d.nota ? `<br><span class="sub">${esc(d.nota)}</span>` : ""
        }${a ? `<br><span class="sub">Se lleva almuerzo al ${esc(a.lugar)} (${a.dias.join(" ")}).</span>` : ""}</li>`;
      })
      .join("")}</ul>
    ${familia.preferencias?.length ? `<p class="sub"><strong>En casa:</strong> ${esc(familia.preferencias.join(" · "))}</p>` : ""}
  </aside>`;
}

function seccionMenu(familia: Familia, dias: DiaDelMenu[], menu: MenuSemana): string {
  const batch = (menu.batch ?? [])
    .map(
      (b) => `<aside class="batch">
        <h3>Batch del ${esc(NOMBRE_DIA[b.dia].toLowerCase())}</h3>
        <ul>${b.tareas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </aside>`,
    )
    .join("");
  return `<div class="avisos-menu">${desayunosHabituales(familia, dias)}${batch}</div>
  <div class="scroll semana-scroll"><table class="semana">
    <thead><tr><th scope="col"><span class="sr">Comida</span></th>${dias
      .map((d) => `<th scope="col">${esc(d.nombre)}</th>`)
      .join("")}</tr></thead>
    <tbody>${COMIDAS.map(
      ({ tipo, nombre }) => `<tr><th scope="row">${nombre}</th>${dias.map((d) => celdaMenu(d, tipo)).join("")}</tr>`,
    ).join("")}</tbody>
  </table></div>`;
}

interface UsoReceta {
  donde: string;
  categoria: string;
  raciones: number;
}

function usosDeRecetas(dias: DiaDelMenu[]): Map<string, UsoReceta[]> {
  const usos = new Map<string, UsoReceta[]>();
  const anotar = (id: string, uso: UsoReceta) => usos.set(id, [...(usos.get(id) ?? []), uso]);
  for (const d of dias) {
    for (const c of d.comidas) {
      const nombre = COMIDAS.find((x) => x.tipo === c.tipo)!.nombre.toLowerCase();
      c.platos.forEach((p, i) =>
        anotar(p.receta.id, {
          donde: `${d.nombre} ${nombre}${i > 0 ? ` (${p.comensales[0].id})` : ""}`,
          categoria: c.tipo,
          raciones: p.raciones,
        }),
      );
      for (const t of c.tuppers) {
        anotar(t.receta.id, { donde: `${d.nombre}, tupper ${t.para}`, categoria: "tupper", raciones: t.raciones });
      }
    }
  }
  return usos;
}

const cantidad = (n: number, unidad: string) => {
  if (unidad === "g" && n >= 1000) return `${num(n / 1000, 2)} kg`;
  if (unidad === "ml" && n >= 1000) return `${num(n / 1000, 2)} l`;
  if (unidad === "ud") return `${num(n, n % 1 ? 1 : 0)} ud`;
  return `${num(n)} ${unidad}`;
};

function seccionRecetas(recetas: Receta[], dias: DiaDelMenu[]): string {
  const usos = usosDeRecetas(dias);
  const usadas = recetas.filter((r) => usos.has(r.id));
  const filtros = [
    ["todas", "Todas"],
    ["desayuno", "Desayunos"],
    ["almuerzo", "Almuerzos"],
    ["comida", "Comidas"],
    ["merienda", "Meriendas"],
    ["cena", "Cenas"],
    ["tupper", "Tuppers"],
  ];
  const tarjetas = usadas
    .map((r) => {
      const u = usos.get(r.id)!;
      const raciones = u.reduce((s, x) => s + x.raciones, 0);
      const categorias = [...new Set(u.map((x) => x.categoria))].join(" ");
      return `<article class="receta" id="r-${esc(r.id)}" data-categorias="${esc(categorias)}">
        <header>
          <h3>${esc(r.nombre)}</h3>
          <p class="meta"><span class="chip info">${esc(TECNICA[r.tecnica] ?? r.tecnica)}</span><span class="mono">${r.tiempoMin} min</span></p>
          <p class="usos"><span class="etq">Esta semana</span> ${u.map((x) => esc(x.donde)).join(" · ")}</p>
        </header>
        <table class="ingredientes">
          <thead><tr><th>Ingrediente</th><th class="num">1 ración</th><th class="num">Semana <span class="mono">×${num(raciones, 2)}</span></th></tr></thead>
          <tbody>${r.ingredientes
            .map(
              (i) =>
                `<tr><td>${esc(i.nombre)}</td><td class="num mono">${cantidad(i.cantidad, i.unidad)}</td><td class="num mono">${cantidad(Math.round(i.cantidad * raciones * 10) / 10, i.unidad)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
        <ol class="pasos">${r.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
        ${r.conservacion ? `<p class="nota"><strong>Conservación:</strong> ${esc(r.conservacion)}</p>` : ""}
      </article>`;
    })
    .join("");
  return `<div class="filtros" role="group" aria-label="Filtrar recetas">${filtros
    .map(([id, texto], i) => `<button type="button" data-filtro="${id}" aria-pressed="${i === 0}">${texto}</button>`)
    .join("")}</div>
  <p class="sub">Cantidades para una ración de referencia (adulto de 2.000 kcal). La columna «Semana» ya multiplica por las raciones de todos los comensales. Sal, especias y caldo no se cuentan.</p>
  <div class="recetas">${tarjetas}</div>`;
}

function seccionCompra(lista: Record<Seccion, LineaCompra[]>): string {
  const bloques = SECCIONES.filter((s) => lista[s].length)
    .map(
      (s) => `<section class="pasillo">
        <h3>${esc(s)} <span class="sub mono">${lista[s].length}</span></h3>
        <ul>${lista[s]
          .map((l, i) => {
            const id = `c-${s.normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}-${i}`;
            const texto = `${l.nombre}: ${cantidad(l.comprar, l.unidad)}`;
            return `<li${l.comprar === 0 ? ' class="en-casa"' : ""}>
              <input type="checkbox" id="${id}" data-texto="${esc(texto)}">
              <label for="${id}"><span class="producto">${esc(l.nombre)}</span>
                <span class="cant mono">${l.comprar === 0 ? "en casa" : cantidad(l.comprar, l.unidad)}</span>
                <span class="para">${esc(l.recetas.length > 3 ? `${l.recetas.slice(0, 2).join(" · ")} y ${l.recetas.length - 2} recetas más` : l.recetas.join(" · "))}${l.enDespensa ? ` · en despensa ${cantidad(l.enDespensa, l.unidad)}` : ""}</span>
              </label>
            </li>`;
          })
          .join("")}</ul>
      </section>`,
    )
    .join("");
  const total = SECCIONES.reduce((s, x) => s + lista[x].length, 0);
  return `<div class="compra-acciones">
    <p class="sub"><span id="compra-marcados">0</span> de ${total} productos en el carro</p>
    <button type="button" id="copiar-lista">Copiar lo que falta</button>
    <button type="button" id="desmarcar" class="secundario">Desmarcar todo</button>
    <span id="copiado" class="sub" role="status"></span>
  </div>
  <div class="pasillos">${bloques}</div>`;
}

function seccionTuppers(propuesta: PropuestaTuppers, familia: Familia): string {
  const tipos = familia.regimen.tupper ?? {};
  const columnas = (semana: string) =>
    Object.entries(propuesta.semanas[semana])
      .map(([id, platos]) => {
        const frio = tipos[id]?.tipo === "frío";
        return `<section class="col-tupper ${frio ? "frio" : "calor"}">
          <h4>${esc(id)} <span class="chip ${frio ? "frio" : "calor"}">${frio ? "Frío" : "Para recalentar"}</span></h4>
          <ol class="platos">${platos
            .map(
              (p) => `<li>
              <span class="dia mono">${p.dia}</span>
              <div>
                <p class="plato">${esc(p.plato)}</p>
                <p class="detalle">${esc(p.detalle)}</p>
                ${p.cocina ? `<p class="detalle"><span class="etq">Se cocina</span> ${esc(p.cocina)}</p>` : ""}
              </div>
              <span class="kcal mono">${num(p.kcal)}<small> kcal</small></span>
            </li>`,
            )
            .join("")}</ol>
          <p class="nota"><strong>Con objetivo de peso:</strong> ${esc(propuesta.ajusteConObjetivo[id] ?? "—")}</p>
        </section>`;
      })
      .join("");
  const semanas = Object.keys(propuesta.semanas);
  return `<div class="pestanas" role="tablist" aria-label="Semana de la rotación">
      ${semanas
        .map(
          (s, i) =>
            `<button role="tab" id="tab-${s}" aria-controls="panel-${s}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">Semana ${s}</button>`,
        )
        .join("")}
    </div>
    ${semanas
      .map(
        (s, i) =>
          `<div role="tabpanel" id="panel-${s}" aria-labelledby="tab-${s}" class="panel-tuppers"${i === 0 ? "" : " hidden"}>${columnas(s)}</div>`,
      )
      .join("")}`;
}

const ESTILOS = `
:root{
  --bg:#f2f4f0;--surface:#ffffff;--ink:#1c2620;--muted:#58655d;--line:#dbe1d8;
  --accent:#3d6a33;--accent-soft:#e3ecde;
  --frio:#2c628c;--frio-soft:#e1ebf3;--calor:#a4541a;--calor-soft:#f6e7da;
  --bien:#2c7a31;--bien-soft:#e1f0e1;--aviso:#8f6200;--aviso-soft:#fbefd2;--info:#58655d;--info-soft:#eaeee8;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;
  --imc-bajo:#cfd8e6;--imc-normal:#cfe6cf;--imc-sobre:#f5e2b3;--imc-obes:#f2c9b8;
  --f-display:"Bricolage Grotesque","Avenir Next","Segoe UI",system-ui,sans-serif;
  --f-body:"Source Sans 3","Segoe UI",system-ui,sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;
  --bg:#0f1411;--surface:#19211c;--ink:#e5ece6;--muted:#9ba89f;--line:#2b3730;
  --accent:#98c58a;--accent-soft:#24331f;
  --frio:#88b9e0;--frio-soft:#1a2a36;--calor:#e6a46c;--calor-soft:#33251a;
  --bien:#80c882;--bien-soft:#1c3020;--aviso:#e8ba4c;--aviso-soft:#372c11;--info:#9ba89f;--info-soft:#232b26;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;
  --imc-bajo:#2a3544;--imc-normal:#243a26;--imc-sobre:#43391c;--imc-obes:#4a2d24;}}
:root[data-theme="dark"]{color-scheme:dark;
  --bg:#0f1411;--surface:#19211c;--ink:#e5ece6;--muted:#9ba89f;--line:#2b3730;
  --accent:#98c58a;--accent-soft:#24331f;
  --frio:#88b9e0;--frio-soft:#1a2a36;--calor:#e6a46c;--calor-soft:#33251a;
  --bien:#80c882;--bien-soft:#1c3020;--aviso:#e8ba4c;--aviso-soft:#372c11;--info:#9ba89f;--info-soft:#232b26;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;
  --imc-bajo:#2a3544;--imc-normal:#243a26;--imc-sobre:#43391c;--imc-obes:#4a2d24;}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{background:var(--bg);color:var(--ink);font:16px/1.5 var(--f-body);}
.pagina{max-width:1180px;margin:0 auto;padding-inline:clamp(16px,4vw,40px);padding-block:32px 56px;display:grid;gap:48px}
h1,h2,h3,h4{font-family:var(--f-display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(1.9rem,4.5vw,2.8rem);font-weight:700;letter-spacing:-.02em}
h2{font-size:1.5rem;font-weight:650}
h3{font-size:1.2rem;font-weight:650}
h4{font-size:1.05rem;font-weight:650;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
p{margin:0}
.mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
.sub{color:var(--muted);font-size:.93rem}
.etq{font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cab{display:grid;gap:12px}
.cab .etq{color:var(--accent)}
.cab p.sub{max-width:62ch;font-size:1.02rem}
.resumen{display:flex;flex-wrap:wrap;gap:8px 28px;margin-top:8px}
.resumen div{display:grid}
.resumen dt{font-size:.78rem;color:var(--muted)}
.resumen dd{margin:0;font:600 1.35rem var(--f-mono);font-variant-numeric:tabular-nums}
.seccion{display:grid;gap:20px}
.seccion > header{display:grid;gap:6px}
.personas{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
.persona{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:14px;align-content:start}
.persona-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.persona h3{font-size:1.5rem}
.chip{display:inline-block;font-size:.76rem;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap;font-family:var(--f-body)}
.chip.bien{background:var(--bien-soft);color:var(--bien)}
.chip.aviso{background:var(--aviso-soft);color:var(--aviso)}
.chip.info{background:var(--info-soft);color:var(--info)}
.chip.frio{background:var(--frio-soft);color:var(--frio)}
.chip.calor{background:var(--calor-soft);color:var(--calor)}
.cifras{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0}
.cifras dt{font-size:.75rem;color:var(--muted)}
.cifras dd{margin:0;font-size:1.2rem;font-weight:600}
.cifras small{font-size:.7rem;color:var(--muted);font-weight:400}
.imc{position:relative;padding-bottom:18px}
.imc-bandas{display:flex;height:8px;border-radius:4px;overflow:hidden;gap:2px}
.b-bajo{background:var(--imc-bajo)}.b-normal{background:var(--imc-normal)}.b-sobre{background:var(--imc-sobre)}.b-obes{background:var(--imc-obes)}
.imc-marca{position:absolute;top:-4px;width:4px;height:16px;margin-left:-2px;border-radius:2px;background:var(--ink);box-shadow:0 0 0 2px var(--surface)}
.imc-ejes span{position:absolute;top:12px;transform:translateX(-50%);font-size:.68rem;color:var(--muted)}
.deportes{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:.92rem}
.deportes .mono{color:var(--muted);font-size:.8rem;margin-left:4px}
.rol{font-size:.9rem}
.nota{font-size:.88rem;background:var(--info-soft);padding:10px 12px;border-radius:6px;color:var(--ink)}
.nota.aviso-borde{background:var(--aviso-soft)}
.nota.bien-borde{background:var(--bien-soft)}
.grafico{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px;display:grid;gap:18px}
.grafico figcaption{display:grid;gap:6px}
.leyenda{list-style:none;padding:0;margin:4px 0 0;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.85rem;color:var(--ink)}
.leyenda li{display:flex;align-items:center;gap:6px}
.muestra{width:12px;height:12px;border-radius:3px;display:inline-block}
.s1{background:var(--s1)}.s2{background:var(--s2)}.s3{background:var(--s3)}
.barras{display:grid;gap:12px}
.fila{display:grid;grid-template-columns:44px 1fr;align-items:center;gap:10px}
.fila-id{font-weight:600;font-size:.9rem}
.pista{position:relative;height:22px;margin-right:52px}
.rejilla{position:absolute;top:-6px;bottom:-6px;width:1px;background:var(--line)}
.pila{position:absolute;inset:0 auto 0 0;display:flex;gap:2px;width:100%}
.seg{height:100%;display:block;outline-offset:2px}
.seg:first-child{border-radius:4px 0 0 4px}
.seg:last-child{border-radius:0 4px 4px 0}
.seg:hover,.seg:focus-visible{filter:brightness(1.12)}
.seg.s1{background:var(--s1)}.seg.s2{background:var(--s2)}.seg.s3{background:var(--s3)}
.total{position:absolute;top:50%;transform:translateY(-50%);margin-left:8px;font-size:.8rem;color:var(--ink)}
.fila.ejes .pista{height:14px}
.tick{position:absolute;transform:translateX(-50%);font-size:.7rem;color:var(--muted)}
.tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface);font-size:.8rem;padding:5px 9px;border-radius:5px;z-index:10;white-space:nowrap}
.tabla-datos summary{cursor:pointer;color:var(--accent);font-size:.88rem;font-weight:600}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.semana-scroll{background:var(--surface);border:1px solid var(--line);border-radius:10px}
.semana{min-width:980px}
.semana tbody th{font-family:var(--f-display);font-weight:650;white-space:nowrap}
.semana tbody tr:last-child td,.semana tbody tr:last-child th{border-bottom:0}
.semana td{min-width:128px}
.semana td{min-width:150px}
.plato-menu{display:block;font-weight:600;color:var(--ink);text-decoration:none;line-height:1.3}
.plato-menu:hover,.variante a:hover,.tupper-linea a:hover{text-decoration:underline;text-decoration-color:var(--accent)}
.comensales{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin-top:6px}
.comensal{font-size:.7rem;background:var(--accent-soft);color:var(--ink);padding:0 5px;border-radius:3px;font-weight:600}
.raciones{font-size:.72rem;color:var(--muted);margin-left:3px}
.variante{margin-top:6px;font-size:.8rem;line-height:1.3}
.variante a,.tupper-linea a{color:var(--ink);text-decoration:none}
.prepara{display:block;margin-top:5px;font-size:.74rem;color:var(--aviso);font-weight:600;line-height:1.3}
.tupper-linea{margin-top:8px;padding:6px 8px;border-radius:6px;font-size:.8rem;line-height:1.3;display:grid;gap:2px;border-left:3px solid}
.tupper-linea.frio{background:var(--frio-soft);border-left-color:var(--frio)}
.tupper-linea.calor{background:var(--calor-soft);border-left-color:var(--calor)}
.tupper-etq{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
.frio .tupper-etq{color:var(--frio)}.calor .tupper-etq{color:var(--calor)}
.tupper-linea .prepara{margin-top:0;color:var(--muted);font-weight:400}
.batch{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;display:grid;gap:6px}
.batch h3{font-size:1rem}
.avisos-menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;align-items:start}
.desayunos ul{list-style:none;padding:0;gap:8px}
.desayunos a{color:var(--ink);font-weight:600;text-decoration:none}
.desayunos-dia{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:.8rem;line-height:1.25}
.desayunos-dia a{color:var(--ink);text-decoration:none}
.desayunos-dia a:hover,.desayunos a:hover{text-decoration:underline;text-decoration-color:var(--accent)}
.batch ul{margin:0;padding-left:1.1em;display:grid;gap:2px;font-size:.92rem}
.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);margin-inline:calc(-1 * clamp(16px,4vw,40px));padding:10px clamp(16px,4vw,40px);display:flex;gap:4px 18px;flex-wrap:wrap;font-size:.9rem;font-weight:600}
.nav a{color:var(--muted);text-decoration:none}
.nav a:hover,.nav a:focus-visible{color:var(--accent)}
section[id]{scroll-margin-top:64px}
.receta[id]{scroll-margin-top:64px}
.filtros{display:flex;flex-wrap:wrap;gap:6px}
.filtros button,.compra-acciones button{font:600 .88rem var(--f-body);border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:5px 12px;border-radius:999px;cursor:pointer}
.filtros button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.filtros button:focus-visible,.compra-acciones button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.recetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:start}
.receta{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:12px}
.receta:target{outline:2px solid var(--accent)}
.receta header{display:grid;gap:6px}
.meta{display:flex;gap:10px;align-items:center;font-size:.85rem;color:var(--muted)}
.usos{font-size:.84rem;color:var(--muted)}
.ingredientes{font-size:.86rem}
.ingredientes th,.ingredientes td{padding:4px 6px}
.ingredientes .num{text-align:right;white-space:nowrap}
.ingredientes thead .mono{text-transform:none;letter-spacing:0}
.pasos{margin:0;padding-left:1.3em;display:grid;gap:5px;font-size:.92rem}
.compra-acciones{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.compra-acciones p{margin-right:auto}
.compra-acciones button{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.compra-acciones button.secundario{background:var(--surface);border-color:var(--line);color:var(--ink)}
.pasillos{columns:3 300px;column-gap:16px}
.pasillo{break-inside:avoid;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:grid;gap:8px}
.pasillo h3{font-size:1rem;display:flex;justify-content:space-between;align-items:baseline}
.pasillo ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.pasillo li{display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-bottom:1px dashed var(--line)}
.pasillo li:last-child{border-bottom:0}
.pasillo input{margin-top:4px;accent-color:var(--accent);width:16px;height:16px;flex:none}
.pasillo label{display:grid;grid-template-columns:1fr auto;gap:0 10px;width:100%;cursor:pointer}
.producto{font-weight:600;font-size:.92rem}
.cant{font-size:.88rem;white-space:nowrap}
.para{grid-column:1 / -1;font-size:.74rem;color:var(--muted);line-height:1.3}
.pasillo input:checked + label .producto,.pasillo input:checked + label .cant{text-decoration:line-through;color:var(--muted)}
.en-casa .cant{color:var(--bien)}
.pestanas{display:flex;gap:4px;border-bottom:1px solid var(--line)}
.pestanas button{font:600 .95rem var(--f-body);color:var(--muted);background:none;border:0;border-bottom:3px solid transparent;padding:8px 14px;cursor:pointer;margin-bottom:-1px}
.pestanas button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent)}
.pestanas button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.panel-tuppers{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;padding-top:16px}
.col-tupper{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:14px;align-content:start;border-top:4px solid}
.col-tupper.frio{border-top-color:var(--frio)}
.col-tupper.calor{border-top-color:var(--calor)}
.platos{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.platos li{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start}
.dia{font-weight:600;font-size:.95rem;color:var(--muted);padding-top:1px}
.plato{font-weight:600}
.detalle{font-size:.86rem;color:var(--muted);margin-top:2px}
.kcal{font-weight:600;white-space:nowrap}
.kcal small{font-weight:400;color:var(--muted);font-size:.72rem}
.pie{font-size:.85rem;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;max-width:75ch}
@media (max-width:520px){.cifras dd{font-size:1.05rem}.platos li{grid-template-columns:24px 1fr}.platos .kcal{grid-column:2}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const SCRIPT = `
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const activar = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => activar(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") activar(tabs[(i + 1) % tabs.length]);
      if (e.key === "ArrowLeft") activar(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });

  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; document.body.append(tip);
  const mostrar = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false;
    const w = tip.offsetWidth; tip.style.left = Math.min(Math.max(8, x - w / 2), innerWidth - w - 8) + "px"; tip.style.top = (y - 36) + "px"; };
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointermove", (e) => mostrar(el, e.clientX, e.clientY));
    el.addEventListener("pointerleave", () => (tip.hidden = true));
    el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top); });
    el.addEventListener("blur", () => (tip.hidden = true));
  });

  const filtros = [...document.querySelectorAll("[data-filtro]")];
  filtros.forEach((b) => b.addEventListener("click", () => {
    filtros.forEach((x) => x.setAttribute("aria-pressed", x === b));
    const f = b.dataset.filtro;
    document.querySelectorAll(".receta").forEach((r) => {
      r.hidden = f !== "todas" && !r.dataset.categorias.split(" ").includes(f);
    });
  }));
  document.querySelectorAll('a[href^="#r-"]').forEach((a) => a.addEventListener("click", () => {
    const todas = filtros.find((b) => b.dataset.filtro === "todas");
    if (todas) todas.click();
  }));

  const CLAVE = "agentemenu-compra-" + document.title;
  const casillas = [...document.querySelectorAll(".pasillo input[type=checkbox]")];
  const marcados = document.getElementById("compra-marcados");
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch { return []; } };
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(casillas.filter((c) => c.checked).map((c) => c.id))); } catch {} };
  const contar = () => { if (marcados) marcados.textContent = casillas.filter((c) => c.checked).length; };
  const previos = new Set(leer());
  casillas.forEach((c) => { c.checked = previos.has(c.id); c.addEventListener("change", () => { guardar(); contar(); }); });
  contar();
  document.getElementById("desmarcar")?.addEventListener("click", () => { casillas.forEach((c) => (c.checked = false)); guardar(); contar(); });
  const aviso = document.getElementById("copiado");
  document.getElementById("copiar-lista")?.addEventListener("click", () => {
    const texto = [...document.querySelectorAll(".pasillo")].map((p) => {
      const lineas = [...p.querySelectorAll("li:not(.en-casa) input")].filter((c) => !c.checked).map((c) => "- " + c.dataset.texto);
      return lineas.length ? p.querySelector("h3").firstChild.textContent.trim() + "\\n" + lineas.join("\\n") : "";
    }).filter(Boolean).join("\\n\\n");
    navigator.clipboard.writeText(texto).then(
      () => { aviso.textContent = "Lista copiada"; },
      () => { aviso.textContent = "No se ha podido copiar; selecciona la lista a mano."; },
    );
  });
})();
`;

export interface DatosWeb {
  familia: Familia;
  propuesta: PropuestaTuppers;
  menu: MenuSemana;
  recetas: Receta[];
  despensa?: Despensa;
  fecha: string;
}

export function generarHtml({ familia, propuesta, menu, recetas, despensa, fecha }: DatosWeb): string {
  const dias = componerMenu(familia, menu, recetas);
  const compra = listaCompra(dias, despensa);
  const comidas = dias.flatMap((d) => d.comidas);
  const tuppersSemana = comidas.reduce((s, c) => s + c.tuppers.length, 0);
  const recetasUsadas = new Set(comidas.flatMap((c) => [...c.platos, ...c.tuppers].map((p) => p.receta.id))).size;
  const productos = SECCIONES.reduce((s, x) => s + compra[x].length, 0);

  return `<title>Menú ${esc(familia.nombre)}</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;600&family=Source+Sans+3:wght@400;600&display=swap">
<style>${ESTILOS}</style>
<main class="pagina">
  <header class="cab">
    <span class="etq">AgenteMenú · semana ${esc(menu.semana)}</span>
    <h1>${esc(familia.nombre)}</h1>
    <p class="sub">Menú de la semana con recetas, lista de la compra y raciones calculadas para cada persona. Generado el ${esc(fecha)}.</p>
    <dl class="resumen">
      <div><dt>Comidas planificadas</dt><dd>${comidas.length}</dd></div>
      <div><dt>Tuppers</dt><dd>${tuppersSemana}</dd></div>
      <div><dt>Recetas</dt><dd>${recetasUsadas}</dd></div>
      <div><dt>Productos a comprar</dt><dd>${productos}</dd></div>
    </dl>
  </header>

  <nav class="nav" aria-label="Secciones">
    <a href="#menu">Menú</a><a href="#recetas">Recetas</a><a href="#compra">Lista de la compra</a><a href="#personas">Personas</a><a href="#tuppers">Rotación de tuppers</a>
  </nav>

  <section class="seccion" id="menu" aria-labelledby="h-menu">
    <header><h2 id="h-menu">Menú de la semana</h2>
    <p class="sub">Cada plato enlaza a su receta. Las etiquetas son quién lo come y ×N las raciones totales (1 = adulto de 2.000 kcal). En naranja, cuándo se prepara si no se cocina en el momento.</p></header>
    ${seccionMenu(familia, dias, menu)}
  </section>

  <section class="seccion" id="recetas" aria-labelledby="h-recetas">
    <header><h2 id="h-recetas">Recetas</h2></header>
    ${seccionRecetas(recetas, dias)}
  </section>

  <section class="seccion" id="compra" aria-labelledby="h-compra">
    <header><h2 id="h-compra">Lista de la compra</h2>
    <p class="sub">Suma de los ingredientes de todo el menú y los tuppers, redondeada hacia arriba${despensa?.productos.length ? " y descontando lo que hay en la despensa" : ""}. Marca lo que ya llevas en el carro.</p></header>
    ${seccionCompra(compra)}
  </section>

  <section class="seccion" id="personas" aria-labelledby="h-personas">
    <header><h2 id="h-personas">Personas y raciones</h2>
    <p class="sub">La ración compara las kcal de cada persona con un adulto de referencia de 2.000 kcal: ×1,17 es un 17 % más.</p></header>
    <div class="personas">${familia.miembros.map((m) => tarjetaMiembro(m, familia)).join("")}</div>
    ${graficoEnergia(familia)}
  </section>

  <section class="seccion" id="tuppers" aria-labelledby="h-tuppers">
    <header><h2 id="h-tuppers">Rotación de tuppers de oficina</h2>
    <p class="sub">Propuesta de dos semanas. La semana A es la que está en el menú de arriba.</p></header>
    ${seccionTuppers(propuesta, familia)}
  </section>

  <p class="pie">Cálculos orientativos (Mifflin-St Jeor en adultos, Schofield en menores, deporte por MET). No sustituyen el consejo de un profesional sanitario. Los objetivos de peso solo se aplican cuando se acuerdan.</p>
</main>
<script>${SCRIPT}</script>
`;
}

async function main() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const leer = async <T>(f: string) => JSON.parse(await readFile(path.join(raiz, "data", f), "utf8")) as T;
  const html = generarHtml({
    familia: await leer<Familia>("familia.json"),
    propuesta: await leer<PropuestaTuppers>("propuesta-tuppers.json"),
    menu: await leer<MenuSemana>("menu-semana.json"),
    recetas: (await leer<{ recetas: Receta[] }>("recetas.json")).recetas,
    despensa: await leer<Despensa>("despensa.json"),
    fecha: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
  });
  const destino = path.join(raiz, "salidas", "resultados.html");
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, html);
  console.log(`Vista web generada en ${destino}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
