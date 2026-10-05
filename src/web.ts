import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Almacen } from "./almacen.js";
import { fileURLToPath } from "node:url";
import {
  calcularNecesidades,
  coeficientesTmb,
  FACTOR_BASE,
  KCAL_POR_KG,
  KCAL_REFERENCIA,
  kcalDeporteDiarias,
  MET,
  MET_POR_DEFECTO,
  kcalDeportePorKg,
  PERDIDA_KG_SEMANA,
  PERDIDA_MAXIMA_KG_SEMANA,
  PARTE_DESAYUNO_PARA_ALMUERZO,
  REPARTO_FIN_DE_SEMANA,
  REPARTO_LABORABLE,
  tasaMetabolicaBasal,
} from "./nutricion.js";
import { componerMenu, listaCompra, menuVisible, sinCambios, normalizarCantidad, SECCIONES, type DiaDelMenu, type LineaCompra, type MenuSemana, type Racion, type Receta, type Seccion } from "./menu.js";
import { type TipoComida } from "./planificacion.js";
import { costeCesta, MOSTRAR_COSTES, type TablaPrecios } from "./precios.js";
import { NOMBRE_DIA, type Despensa, type Dia, type Familia, type Miembro } from "./tipos.js";
import { densidad, EQUIVALENCIAS, equivalencia, gramosPorUnidad } from "./unidades.js";

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

export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const num = (n: number, decimales = 0) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
/** Como num, pero con punto de miles también en números de 4 cifras (1.250 g). */
export const miles = (n: number, decimales = 0) => {
  const [entero, dec] = n.toFixed(decimales).split(".");
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
};

const DEPORTE: Record<string, string> = {
  running: "Running",
  yoga_funcional: "Yoga funcional",
  natacion: "Natación",
  futbol_entrenamiento: "Fútbol (entreno)",
  futbol_partido: "Fútbol (partido)",
  educacion_fisica: "Educación física",
  caminar: "Caminar",
  bicicleta: "Bicicleta",
  gimnasio: "Gimnasio",
  padel: "Pádel",
};

export const COMIDAS: { tipo: TipoComida; nombre: string }[] = [
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

const DIAS_SEMANA: Dia[] = ["L", "M", "X", "J", "V", "S", "D"];

function estadoImc(clasificacion: string) {
  if (clasificacion === "normopeso") return { clase: "bien", texto: "Normopeso" };
  if (clasificacion === "sobrepeso") return { clase: "aviso", texto: "Sobrepeso" };
  if (clasificacion === "obesidad") return { clase: "aviso", texto: "Obesidad" };
  if (clasificacion === "bajo peso") return { clase: "aviso", texto: "Bajo peso" };
  return { clase: "info", texto: "Menor: percentiles" };
}

function escalaImc(imc: number, id?: string): string {
  return `<div class="imc" aria-label="IMC ${num(imc, 1)} en una escala de ${IMC_MIN} a ${IMC_MAX}">
    <div class="imc-bandas">
      <span style="width:${posImc(18.5)}%" class="b-bajo"></span>
      <span style="width:${posImc(25) - posImc(18.5)}%" class="b-normal"></span>
      <span style="width:${posImc(30) - posImc(25)}%" class="b-sobre"></span>
      <span style="width:${100 - posImc(30)}%" class="b-obes"></span>
    </div>
    <span class="imc-marca" style="left:${posImc(imc)}%"${id ? ` data-m="${esc(id)}" data-campo="imc-marca"` : ""}></span>
    <div class="imc-ejes mono"><span style="left:${posImc(18.5)}%">18,5</span><span style="left:${posImc(25)}%">25</span><span style="left:${posImc(30)}%">30</span></div>
  </div>`;
}

const categoria = (titulo: string, cuerpo: string, clase = "") =>
  `<section class="categoria ${clase}"><h4>${titulo}</h4>${cuerpo}</section>`;

const pares = (filas: [string, string][]) =>
  `<dl class="pares">${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/** Nombre que se muestra de un miembro: su alias o, si no tiene, sus siglas. */
export const nombreMiembro = (familia: Familia, id: string) => familia.miembros.find((m) => m.id === id)?.alias ?? id;

/**
 * Cambia las siglas de cada miembro por su alias en el texto visible del HTML
 * (texto y atributos title, data-tip, aria-label y placeholder). No toca ids,
 * clases, valores de formularios, estilos ni scripts.
 */
export function conAlias(html: string, familia: Familia): string {
  const alias = new Map(familia.miembros.filter((m) => m.alias).map((m) => [m.id, m.alias!]));
  if (!alias.size) return html;
  const siglas = new RegExp(`\\b(${[...alias.keys()].join("|")})\\b`, "g");
  const cambiar = (t: string) => t.replace(siglas, (id) => alias.get(id)!);
  return html
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)/)
    .map((trozo, i) =>
      i % 2
        ? trozo
        : trozo
            .replace(/>([^<]+)</g, (_, t: string) => `>${cambiar(t)}<`)
            .replace(/\s(title|data-tip|aria-label|placeholder)="([^"]*)"/g, (_, a: string, v: string) => ` ${a}="${cambiar(v)}"`),
    )
    .join("");
}

/** Ficha de configuración de una persona. Peso, objetivo, gustos y desayuno se editan desde la página (web-cliente.js). */
function fichaPersona(m: Miembro, familia: Familia, recetas: Map<string, Receta>): string {
  const n = calcularNecesidades(m, familia.objetivos[m.id]);
  const estado = estadoImc(n.clasificacion);
  // Huecos que el script de la página actualiza al cambiar el peso o el objetivo.
  const campo = (c: string, v: string, clase = "mono") => `<span class="${clase}" data-m="${esc(m.id)}" data-campo="${c}">${v}</span>`;
  const hueco = (c: string, contenido: string) => `<div data-m="${esc(m.id)}" data-campo="${c}">${contenido}</div>`;
  const deportes = m.actividades
    .map((a) => `<li><span>${esc(DEPORTE[a.deporte] ?? a.deporte)}</span><span class="mono">${a.dias.join(" ")} · ${a.minutos} min</span></li>`)
    .join("");
  const objetivo = n.objetivoActivo
    ? `<p class="nota bien-borde"><strong>Objetivo acordado:</strong> ${num(n.objetivoActivo.pesoObjetivoKg, 1)} kg en ${n.objetivoActivo.semanas} semanas · ${num(n.objetivoActivo.kcalDiarias)} kcal/día</p>`
    : n.propuestaObjetivo
      ? `<p class="nota aviso-borde"><strong>Propuesta pendiente de acordar:</strong> ${num(n.propuestaObjetivo.pesoObjetivoKg, 1)} kg en unas ${n.propuestaObjetivo.semanas} semanas, con ${num(n.propuestaObjetivo.kcalDiarias)} kcal/día. Conviene consultarlo con su médico.</p>`
      : m.edad < 18
        ? `<p class="nota">Sin restricciones calóricas: prioridad al crecimiento y al deporte. Dudas de peso, con su pediatra.</p>`
        : `<p class="nota">Sin objetivo de peso: está en normopeso.</p>`;

  const desayuno = familia.desayunos?.[m.id];
  const recetaDesayuno = desayuno ? recetas.get(desayuno.receta) : undefined;
  const almuerzo = familia.regimen.almuerzo?.[m.id];
  const tupper = familia.regimen.tupper?.[m.id];
  const enCasa = (tipo: "comida" | "cena") =>
    `<ol class="dias-mini">${DIAS_SEMANA.map((d) => {
      const si = familia.regimen[tipo][d].includes(m.id);
      const fuera = !si && tipo === "comida" && tupper?.dias.includes(d);
      const texto = si ? "en casa" : fuera ? `fuera, tupper ${tupper!.tipo}` : "fuera";
      const clase = si ? "si" : fuera ? `tupper-dia ${tupper!.tipo === "frío" ? "frio" : "calor"}` : "no";
      return `<li class="${clase}" title="${esc(`${NOMBRE_DIA[d]}: ${texto}`)}"><span aria-hidden="true">${d}</span><span class="sr">${esc(`${NOMBRE_DIA[d]}: ${texto}`)}</span></li>`;
    }).join("")}</ol>`;

  return `<div class="ficha">
    <header class="ficha-cab">
      <div>
        <h3>${esc(m.alias ?? m.id)}</h3>
        <p class="sub">${m.edad} años · ${m.sexo === "V" ? "varón" : "mujer"} · <span class="mono">${m.alturaCm} cm</span></p>
      </div>
      ${campo("estado", estado.texto, `chip ${estado.clase}`)}
    </header>
    <div class="categorias ficha-bloques">
      ${categoria(
        "Peso",
        pares([
          ["Peso", `${campo("peso", `${num(m.pesoKg, 1)} kg`)}`],
          ["IMC", campo("imc", num(n.imc, 1))],
        ]) +
          (m.edad >= 18 ? escalaImc(n.imc, m.id) : `<p class="sub">En menores el IMC se valora con tablas de percentiles.</p>`) +
          hueco("historial-peso", "") +
          `<div class="botones-ficha" data-m="${esc(m.id)}" data-editar="peso" hidden><button type="button" class="btn-mini">Cambiar peso</button></div>`,
      )}
      ${categoria(
        "Energía y actividad",
        pares([
          ["Metabolismo basal", `${campo("tmb", num(n.tmb))} kcal`],
          ["Gasto diario", `${campo("gasto", num(n.gastoDiario))} kcal`],
          ["Objetivo diario", `${campo("kcal", num(n.kcalObjetivo))} kcal`],
          ["Ración", campo("racion", `×${num(n.factorRacion, 2)}`)],
        ]) +
          `<p class="etq">Actividad física</p>` +
          hueco("deporte", `<ul class="lista-deporte">${deportes || "<li>Sin deporte registrado</li>"}</ul>`) +
          `<div class="botones-ficha" data-m="${esc(m.id)}" data-editar="deporte" hidden><button type="button" class="btn-mini">Cambiar deporte</button></div>`,
      )}
      ${categoria(
        "Objetivo de peso",
        hueco("objetivo", objetivo) +
          (m.edad >= 18 ? `<div class="botones-ficha" data-m="${esc(m.id)}" data-editar="objetivo" hidden><button type="button" class="btn-mini">Cambiar objetivo</button></div>` : ""),
      )}
      ${categoria(
        "Alimentación",
        pares([
          ["Gustos", hueco("gustos", m.gustos.length ? esc(m.gustos.join(", ")) : `<span class="sub">Sin indicar</span>`)],
          [
            "Desayuno",
            hueco(
              "desayuno",
              recetaDesayuno
                ? `<a href="#r-${esc(recetaDesayuno.id)}">${esc(recetaDesayuno.nombre)}</a>${desayuno?.nota ? `<br><span class="sub">${esc(desayuno.nota)}</span>` : ""}`
                : `<span class="sub">El del menú</span>`,
            ),
          ],
          ...(desayuno
            ? ([["Desayuno en el menú", desayuno.mostrarEnMenu ? "Se muestra" : `<span class="sub">No se muestra (sí cuenta en la compra)</span>`]] as [string, string][])
            : []),
          ["En la cocina", hueco("rol", familia.roles[m.id] ? esc(familia.roles[m.id]) : `<span class="sub">Sin indicar</span>`)],
        ]) +
          `<div class="botones-ficha" data-m="${esc(m.id)}" data-editar="alimentacion" hidden><button type="button" class="btn-mini" data-que="gustos">Cambiar gustos</button><button type="button" class="btn-mini" data-que="desayuno">Cambiar desayuno</button><button type="button" class="btn-mini" data-que="rol">Cambiar papel en la cocina</button></div>`,
        "doble",
      )}
      ${categoria(
        "Comidas en casa",
        hueco(
          "regimen",
          `<div class="en-casa-fila"><span class="etq">Comida</span>${enCasa("comida")}</div>
         <div class="en-casa-fila"><span class="etq">Cena</span>${enCasa("cena")}</div>
         <ul class="leyenda-regimen"><li><span class="muestra-dia si"></span>En casa</li>${tupper ? `<li><span class="muestra-dia tupper-dia ${tupper.tipo === "frío" ? "frio" : "calor"}"></span>Tupper ${esc(tupper.tipo)}</li>` : ""}<li><span class="muestra-dia"></span>Fuera</li></ul>
         <p class="sub">Almuerzo: ${almuerzo ? `se lo lleva al ${esc(almuerzo.lugar)} · <span class="mono">${almuerzo.dias.join(" ")}</span>` : "no"}</p>`,
        ) +
          `<div class="botones-ficha" data-m="${esc(m.id)}" data-editar="regimen" hidden><button type="button" class="btn-mini">Cambiar comidas en casa</button></div>`,
      )}
    </div>
  </div>`;
}

/** Régimen de comidas por día, con un color para quien come en casa, quien lleva tupper y quien lleva almuerzo. */
function tablaRegimen(familia: Familia): string {
  const tuppers = familia.regimen.tupper ?? {};
  const almuerzos = familia.regimen.almuerzo ?? {};
  const chip = (id: string, clase: string, titulo: string) => `<span class="comensal ${clase}" title="${esc(`${id}: ${titulo}`)}">${esc(id)}</span>`;
  const celda = (chips: string[]) => `<td>${chips.join(" ") || `<span class="sub">—</span>`}</td>`;
  const fila = (nombre: string, porDia: (d: Dia) => string[]) =>
    `<tr><th scope="row">${nombre}</th>${DIAS_SEMANA.map((d) => celda(porDia(d))).join("")}</tr>`;
  const claseTupper = (t: { tipo: string }) => (t.tipo === "frío" ? "tupper-frio" : "tupper-calor");
  return `<div class="scroll"><table class="regimen">
      <thead><tr><th><span class="sr">Comida</span></th>${DIAS_SEMANA.map((d) => `<th>${NOMBRE_DIA[d]}</th>`).join("")}</tr></thead>
      <tbody>
        ${fila("Almuerzo", (d) => Object.entries(almuerzos).filter(([, a]) => a.dias.includes(d)).map(([id, a]) => chip(id, "almuerzo", `almuerzo, se lo lleva al ${a.lugar}`)))}
        ${fila("Comida", (d) => [
          ...familia.regimen.comida[d].map((id) => chip(id, "casa", "come en casa")),
          ...Object.entries(tuppers).filter(([, t]) => t.dias.includes(d)).map(([id, t]) => chip(id, claseTupper(t), `tupper ${t.tipo}`)),
        ])}
        ${fila("Cena", (d) => familia.regimen.cena[d].map((id) => chip(id, "casa", "cena en casa")))}
      </tbody>
    </table></div>
    <ul class="leyenda-regimen">
      <li><span class="comensal casa">En casa</span></li>
      <li><span class="comensal tupper-frio">Tupper frío</span></li>
      <li><span class="comensal tupper-calor">Tupper para recalentar</span></li>
      <li><span class="comensal almuerzo">Almuerzo que se lleva</span></li>
    </ul>
    <p class="sub">Desayuno: ${esc(familia.regimen.desayuno)}. Merienda: ${esc(familia.regimen.merienda)}.</p>`;
}

function seccionConfiguracion(familia: Familia, recetas: Receta[]): string {
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const grupo = `<div class="grupo">
    ${categoria("Régimen de comidas", tablaRegimen(familia), "ancha")}
    <div class="categorias">
      ${categoria(
        "Reparto de la energía del día",
        `<table class="reparto"><thead><tr><th>Comida</th><th class="num">L-V</th><th class="num">S-D</th></tr></thead><tbody>
          ${(["desayuno", "comida", "merienda", "cena"] as const)
            .map(
              (t) =>
                `<tr><td>${t[0].toUpperCase() + t.slice(1)}</td><td class="num mono">${REPARTO_LABORABLE[t] ? `${num(REPARTO_LABORABLE[t] * 100)} %` : "—"}</td><td class="num mono">${REPARTO_FIN_DE_SEMANA[t] ? `${num(REPARTO_FIN_DE_SEMANA[t] * 100)} %` : "—"}</td></tr>`,
            )
            .join("")}
        </tbody></table>
        <p class="sub">Quien se lleva almuerzo pasa ${num(PARTE_DESAYUNO_PARA_ALMUERZO * 100)} % de su desayuno al almuerzo.</p>`,
      )}
      ${categoria(
        "Criterios del menú",
        `<ul class="criterios">
          <li>Legumbres 2-4 veces por semana</li><li>Pescado 3-4 veces</li><li>Huevo 3-4 veces</li><li>Verdura en comida y cena</li>
          <li>Fruta a diario</li><li>Carne roja, 1-2 veces como máximo</li><li>Ultraprocesados, ocasionales</li>
        </ul>`,
      )}
    </div>
    ${graficoEnergia(familia)}
  </div>`;

  return `<div class="pestanas" role="tablist" aria-label="Configuración">
      <button role="tab" id="tab-cfg-grupo" aria-controls="cfg-grupo" aria-selected="true" tabindex="0">Grupo familiar</button>
      ${familia.miembros
        .map((m) => `<button role="tab" id="tab-cfg-${esc(m.id)}" aria-controls="cfg-${esc(m.id)}" aria-selected="false" tabindex="-1">${esc(m.alias ?? m.id)}</button>`)
        .join("")}
    </div>
    <div role="tabpanel" id="cfg-grupo" aria-labelledby="tab-cfg-grupo" class="panel-config">${grupo}</div>
    ${familia.miembros
      .map(
        (m) =>
          `<div role="tabpanel" id="cfg-${esc(m.id)}" aria-labelledby="tab-cfg-${esc(m.id)}" class="panel-config" hidden>${fichaPersona(m, familia, porId)}</div>`,
      )
      .join("")}
    <p class="sub" id="cfg-aviso">El peso, el objetivo, los gustos y el desayuno se cambian desde la ficha de cada persona y se guardan en esta página; la ficha se recalcula al momento. El menú, las raciones y la lista de la compra se ajustan cuando esos datos se copian al proyecto y se vuelve a generar la página. El resto de datos salen de <code>data/familia.json</code>: para cambiarlos, díselo al agente.</p>`;
}

/** Normas de la casa y quién cocina (página Normas). */
function seccionNormas(familia: Familia): string {
  const lista = (xs: string[]) => (xs.length ? `<ul class="criterios">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="sub">Ninguna</p>`);
  return `<header class="cab"><h1 id="h-normas">Normas de la casa</h1>
    <p class="sub">Lo que el menú respeta siempre. El motivo de cada norma está en <code>decisions.md</code>.</p></header>
    <div class="categorias">
      ${categoria("Normas", lista(familia.preferencias ?? []))}
      ${categoria(
        "Cuándo y con quién",
        lista([...(familia.restricciones ?? []).map((r) => r.motivo), ...(familia.supervision ?? []).map((s) => s.motivo)]),
      )}
      ${categoria("Alergias", familia.alergias.length ? lista(familia.alergias) : `<p class="sub">No detectadas</p>`)}
      ${categoria(
        "Quién cocina",
        `<ul class="miembros">${Object.entries(familia.roles)
          .map(([id, rol]) => `<li><span class="comensal">${esc(id)}</span> ${esc(rol)}</li>`)
          .join("")}</ul>${familia.equipamiento?.length ? `<p class="sub">En la cocina: ${esc(familia.equipamiento.join(", "))}.</p>` : ""}`,
      )}
    </div>`;
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

/** Identificador de una casilla del menú: semana-día(0-6)-comida, p. ej. «A-3-cena». */
export const idCelda = (semana: string, dia: Dia, tipo: TipoComida) => `${semana}-${DIAS_SEMANA.indexOf(dia)}-${tipo}`;

/** Hueco que rellena el script: casillas «Cocinado» con raciones y botón «Diario». */
const acciones = (id: string) => `<div class="acciones" data-acciones="${esc(id)}"></div>`;

/** Casilla de una comida dentro de la columna de un día; lleva su nombre («Comida») porque en el móvil no hay columna de títulos. */
const celdaHtml = (id: string, tipo: TipoComida, contenido: string, clase = "") =>
  `<div class="celda${clase ? ` ${clase}` : ""}" data-celda="${esc(id)}"><span class="celda-etq">${esc(COMIDAS.find((x) => x.tipo === tipo)!.nombre)}</span>${contenido}</div>`;

function celdaMenu(dia: DiaDelMenu, tipo: TipoComida, semana: string): string {
  const id = idCelda(semana, dia.dia, tipo);
  const c = dia.comidas.find((x) => x.tipo === tipo);
  if (!c || !c.platos.length) return celdaHtml(id, tipo, `<span class="sub">—</span>`, "vacia");
  if (tipo === "desayuno" && c.platos.length > 1) {
    return celdaHtml(
      id,
      tipo,
      `<ul class="desayunos-dia">${c.platos
        .map((p) => `<li>${comensalesChips(p)} <a href="#r-${esc(p.receta.id)}">${esc(p.receta.nombre)}</a></li>`)
        .join("")}</ul>${acciones(id)}`,
    );
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
        <a href="#r-${esc(t.receta.id)}">${esc(t.receta.nombre)}</a>${t.segundo ? ` + <a href="#r-${esc(t.segundo.receta.id)}">${esc(t.segundo.receta.nombre)}</a>` : ""}
        ${t.prepara ? `<span class="prepara">${esc(t.prepara)}</span>` : ""}
      </div>`,
    )
    .join("");
  return celdaHtml(
    id,
    tipo,
    `<a class="plato-menu" href="#r-${esc(principal.receta.id)}">${esc(principal.receta.nombre)}</a>
    ${principal.segundo ? `<a class="plato-menu segundo" href="#r-${esc(principal.segundo.receta.id)}">${esc(principal.segundo.receta.nombre)}</a>` : ""}
    <div class="comensales">${comensalesChips(principal)}<span class="raciones mono" title="Raciones a preparar, contando que 1 ración es la de un adulto de 2.000 kcal">${num(principal.raciones, 2)} rac.</span></div>
    ${variantesHtml}
    ${principal.prepara ? `<p class="prepara">${esc(principal.prepara)}</p>` : ""}
    ${tuppers}
    ${acciones(id)}`,
  );
}

function desayunosHabituales(familia: Familia, dias: DiaDelMenu[]): string {
  if (!familia.desayunos) return "";
  const platos = dias[0]?.comidas.find((c) => c.tipo === "desayuno")?.platos ?? [];
  const receta = (id: string) => platos.find((p) => p.comensales.some((c) => c.id === id));
  const almuerzo = familia.regimen.almuerzo ?? {};
  const enMenu = Object.entries(familia.desayunos).filter(([, d]) => d.mostrarEnMenu);
  const ocultos = Object.keys(familia.desayunos).filter((id) => !familia.desayunos![id].mostrarEnMenu);
  const notaOcultos = ocultos.length
    ? `<p class="sub">Desayunos fijos que no se muestran en el menú: ${ocultos.map((id) => `<a href="#configuracion">${esc(id)}</a>`).join(", ")}. Se cuentan igualmente en la lista de la compra.</p>`
    : "";
  if (!enMenu.length) return `<aside class="batch desayunos"><h3>Desayunos</h3>${notaOcultos}</aside>`;
  return `<aside class="batch desayunos">
    <h3>Desayunos de cada uno, todos los días</h3>
    <ul>${enMenu
      .map(([id, d]) => {
        const r = receta(id);
        const kcal = r?.comensales.find((c) => c.id === id)?.kcal;
        const a = almuerzo[id];
        return `<li><span class="comensal">${esc(id)}</span> <a href="#r-${esc(d.receta)}">${esc(r?.receta.nombre ?? d.receta)}</a>${kcal ? ` <span class="sub mono">~${num(kcal)} kcal objetivo</span>` : ""}${
          d.nota ? `<br><span class="sub">${esc(d.nota)}</span>` : ""
        }${a ? `<br><span class="sub">Se lleva almuerzo al ${esc(a.lugar)} (${a.dias.join(" ")}).</span>` : ""}</li>`;
      })
      .join("")}</ul>
    ${notaOcultos}
  </aside>`;
}

/** Desayunos fijos y batch del domingo de cada semana: van en la página Recetas, no en lo primero que se ve del menú. */
function avisosCocina(familia: Familia, semanas: { menu: MenuSemana; dias: DiaDelMenu[]; clave: string; etiqueta: string }[]): string {
  const batch = semanas
    .flatMap(({ menu, clave, etiqueta }) =>
      (menu.batch ?? []).map(
        (b) => `<aside class="batch">
        <h3>Batch del ${esc(NOMBRE_DIA[b.dia].toLowerCase())} · ${esc(etiqueta)} <span class="sub">${rangoSemana(clave)}</span></h3>
        <ul>${b.tareas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </aside>`,
      ),
    )
    .join("");
  return `<div class="avisos-menu">${desayunosHabituales(familia, semanas[0].dias)}${batch}</div>`;
}

/**
 * Menú de los días que quedan: una columna por día, desde hoy hasta el domingo de la próxima semana.
 * El marco de cada columna indica su semana. Cada semana se identifica por su lunes (`clave`).
 */
function seccionMenu(familia: Familia, semanas: { dias: DiaDelMenu[]; clave: string }[]): string {
  const visibles = semanas.map((w) => ({ ...w, dias: menuVisible(familia, w.dias) }));
  const hayDesayunoFijo = semanas.some((w) => w.dias.some((d) => d.comidas.some((c) => c.tipo === "desayuno" && c.platos.length)));
  // Las filas que no tiene ningún día no se dibujan; los desayunos ocultos quedan en una sola casilla compacta.
  const filas = COMIDAS.filter(
    ({ tipo }) => visibles.some((w) => w.dias.some((d) => d.comidas.some((c) => c.tipo === tipo))) || (tipo === "desayuno" && hayDesayunoFijo),
  );
  const columna = (d: DiaDelMenu, clave: string) => {
    const fecha = sumarDias(clave, DIAS_SEMANA.indexOf(d.dia));
    const corta = new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
    const casillas = filas
      .map(({ tipo }) => {
        if (d.comidas.some((c) => c.tipo === tipo)) return celdaMenu(d, tipo, clave);
        if (tipo === "desayuno") {
          const id = idCelda(clave, d.dia, "desayuno");
          return celdaHtml(id, tipo, `<a class="plato-menu" href="#recetas">Desayunos fijos</a><span class="sub des-sub">Cada uno el suyo</span>${acciones(id)}`);
        }
        return celdaHtml(idCelda(clave, d.dia, tipo), tipo, `<span class="sub">—</span>`, "vacia");
      })
      .join("");
    return `<section class="col-dia" data-sem="${esc(clave)}" data-fecha="${esc(fecha)}" aria-label="${esc(`${d.nombre} ${corta}`)}">
      <h3 class="dia-cab"><span class="dia-nombre">${esc(d.nombre)}</span> <span class="dia-fecha">${esc(corta)}</span><span class="dia-etq"></span></h3>
      ${casillas}
    </section>`;
  };
  return `<div class="semana semana-scroll" style="--filas:${filas.length + 1}" tabindex="0" aria-label="Menú día a día (desliza para ver más días)">${visibles
    .flatMap((w) => w.dias.map((d) => columna(d, w.clave)))
    .join("")}</div>`;
}

interface UsoReceta {
  donde: string;
  categoria: string;
  raciones: number;
  semana: string;
}

function usosDeRecetas(semanas: { semana: string; dias: DiaDelMenu[] }[]): Map<string, UsoReceta[]> {
  const usos = new Map<string, UsoReceta[]>();
  const anotar = (id: string, uso: UsoReceta) => usos.set(id, [...(usos.get(id) ?? []), uso]);
  for (const { semana, dias } of semanas) {
    for (const d of dias) {
      for (const c of d.comidas) {
        const nombre = COMIDAS.find((x) => x.tipo === c.tipo)!.nombre.toLowerCase();
        c.platos.forEach((p, i) => {
          const donde = `${d.nombre} ${nombre}${i > 0 ? ` (${p.comensales[0].id})` : ""}`;
          anotar(p.receta.id, { donde, categoria: c.tipo, raciones: p.raciones, semana });
          if (p.segundo) anotar(p.segundo.receta.id, { donde: `${donde}, segundo`, categoria: c.tipo, raciones: p.segundo.raciones, semana });
        });
        for (const t of c.tuppers) {
          anotar(t.receta.id, { donde: `${d.nombre}, tupper ${t.para}`, categoria: "tupper", raciones: t.raciones, semana });
          if (t.segundo) anotar(t.segundo.receta.id, { donde: `${d.nombre}, tupper ${t.para}`, categoria: "tupper", raciones: t.segundo.raciones, semana });
        }
      }
    }
  }
  return usos;
}

/** Cantidad para mostrar: todo va en gramos (1.250 g); lo que no tiene equivalencia, en su unidad. */
export const cantidad = (n: number, unidad: string) => {
  if (unidad === "g") return `${n > 0 && n < 1 ? miles(n, 1) : miles(n)} g`;
  if (unidad === "ud") return `${num(n, n % 1 ? 1 : 0)} ud`;
  return `${miles(n)} ${unidad}`;
};

/** Gramos con la equivalencia en unidades o ml debajo, en pequeño: «120 g (2 ud)». */
function conEquivalencia(nombre: string, n: number, unidad: string): string {
  const c = normalizarCantidad(nombre, n, unidad);
  const eq = c.unidad === "g" ? equivalencia(nombre, c.cantidad) : "";
  return `${cantidad(Math.round(c.cantidad * 10) / 10, c.unidad)}${eq ? ` <span class="equiv">(${esc(eq)})</span>` : ""}`;
}

/** Marcas de «no deseado» de una receta: la lista la rellena el script con los datos guardados. */
function bloqueNoDeseado(r: Receta, familia: Familia): string {
  const opciones = [["familia", "Toda la familia"], ...familia.miembros.map((m) => [m.id, m.id])];
  return `<div class="no-deseado" data-receta="${esc(r.id)}">
    <ul class="marcas" aria-live="polite"></ul>
    <details class="marcar" data-solo-editable>
      <summary>Marcar como no deseado</summary>
      <form class="form-nd">
        <label for="nd-quien-${esc(r.id)}">Quién</label>
        <select id="nd-quien-${esc(r.id)}" name="por">${opciones.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select>
        <label for="nd-motivo-${esc(r.id)}">Por qué</label>
        <textarea id="nd-motivo-${esc(r.id)}" name="motivo" rows="2" required placeholder="Por ejemplo: no le gusta la textura"></textarea>
        <button type="submit">Guardar</button>
        <span class="sub estado-form" role="status"></span>
      </form>
    </details>
  </div>`;
}

/** Apuntar cuántas raciones se han hecho: lo que no se come esta semana queda en reserva. */
/**
 * «Cocinado» de una receta: para qué comidas del menú se ha cocinado y cuántas raciones se han hecho.
 * Resta los ingredientes de la despensa, esas comidas dejan de contar en la compra y lo que sobra
 * queda en reserva. El script de la página rellena las comidas (web-cliente.js).
 */
function bloqueHecho(r: Receta, raciones: number): string {
  const id = esc(r.id);
  return `<div class="hecho" data-receta="${id}">
    <p class="reserva-receta" hidden></p>
    <ul class="cocinado-usos" hidden></ul>
    <details class="marcar" data-solo-editable>
      <summary>Cocinado</summary>
      <form class="form-hecho">
        <fieldset class="usos-form"><legend>¿Para qué comidas?</legend></fieldset>
        <div class="fila-form">
          <div><label for="h-hechas-${id}">Raciones hechas</label><input id="h-hechas-${id}" name="hechas" type="number" inputmode="decimal" min="0.1" step="0.01" required value="${raciones ? num(raciones, 2).replace(",", ".") : ""}"></div>
          <div><label for="h-fecha-${id}">Hecho el</label><input id="h-fecha-${id}" name="fecha" type="date" required></div>
        </div>
        <div><label for="h-donde-${id}">Lo que sobra va a</label><select id="h-donde-${id}" name="donde"><option value="nevera">Nevera</option><option value="congelador">Congelador</option></select></div>
        <p class="sub">Se restan de la despensa los ingredientes de las raciones hechas. Las comidas marcadas dejan de contar en la compra. Si haces más de lo que piden, lo que sobra queda en reserva para otro día y no se vuelve a comprar.</p>
        <button type="submit">Guardar</button>
        <span class="sub estado-form" role="status"></span>
      </form>
    </details>
  </div>`;
}

function seccionRecetas(recetas: Receta[], semanas: { semana: string; dias: DiaDelMenu[] }[], familia: Familia): string {
  const usos = usosDeRecetas(semanas);
  const actual = semanas[0].semana;
  const usadas = recetas.filter((r) => usos.has(r.id));
  const filtros = [
    ["todas", "Todas"],
    ["desayuno", "Desayunos"],
    ["almuerzo", "Almuerzos"],
    ["comida", "Comidas"],
    ["merienda", "Meriendas"],
    ["cena", "Cenas"],
    ["tupper", "Tuppers"],
    ["thermomix", "Thermomix"],
    ["reserva", "Con reserva"],
    ["no-deseado", "No deseados"],
  ];
  // Las recetas sin cocinar (bocadillos, yogures, desayunos fijos) no salen en la lista ni se marcan como
  // cocinadas: se restan solas de la despensa el día que tocan. Se abren desde el menú (enlace #r-…).
  const sinCocinar = (r: Receta) => r.tecnica === "sin cocinar";
  const visibles = new Set(usadas.filter((r) => !sinCocinar(r)).flatMap((r) => [...usos.get(r.id)!.map((x) => x.categoria), ...(r.thermomix?.length ? ["thermomix"] : [])]));
  const tarjetas = usadas
    .map((r) => {
      const u = usos.get(r.id)!;
      const estaSemana = u.filter((x) => x.semana === actual);
      const raciones = estaSemana.reduce((s, x) => s + x.raciones, 0);
      const categorias = [...new Set(u.map((x) => x.categoria)), ...(r.thermomix?.length ? ["thermomix"] : [])].join(" ");
      const lineasUso = semanas
        .map(({ semana }) => {
          const deEsta = u.filter((x) => x.semana === semana);
          if (!deEsta.length) return "";
          const etiqueta = semana === actual ? `Semana ${semana}` : `Semana ${semana} (siguiente)`;
          return `<p class="usos"><span class="etq">${esc(etiqueta)}</span> ${deEsta.map((x) => esc(x.donde)).join(" · ")}</p>`;
        })
        .join("");
      return `<article class="receta${sinCocinar(r) ? " sin-cocinar" : ""}" id="r-${esc(r.id)}" data-categorias="${esc(categorias)}">
        <header>
          <h3>${esc(r.nombre)}</h3>
          <p class="meta"><span class="chip info">${esc(TECNICA[r.tecnica] ?? r.tecnica)}</span><span class="mono">${r.tiempoMin} min</span>${
            r.alMomento ? `<span class="chip aviso">Al momento</span>` : ""
          }${r.thermomix?.length ? `<span class="chip bien">Thermomix</span>` : ""}</p>
          ${lineasUso}
        </header>
        <table class="ingredientes">
          <thead><tr><th>Ingrediente</th><th class="num">1 ración</th>${
            raciones ? `<th class="num" title="Cantidad total de la semana: 1 ración × las raciones de todos los comensales">Semana ${esc(actual)} <span class="mono">(${num(raciones, 2)} rac.)</span></th>` : ""
          }</tr></thead>
          <tbody>${r.ingredientes
            .map(
              (i) =>
                `<tr><td>${esc(i.nombre)}</td><td class="num mono">${conEquivalencia(i.nombre, i.cantidad, i.unidad)}</td>${
                  raciones ? `<td class="num mono">${conEquivalencia(i.nombre, Math.round(i.cantidad * raciones * 10) / 10, i.unidad)}</td>` : ""
                }</tr>`,
            )
            .join("")}</tbody>
        </table>
        <ol class="pasos">${r.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
        ${
          r.thermomix?.length
            ? `<details class="thermomix"><summary>Con Thermomix</summary><ol class="pasos">${r.thermomix.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></details>`
            : ""
        }
        ${r.conservacion ? `<p class="nota"><strong>Conservación:</strong> ${esc(r.conservacion)}</p>` : ""}
        ${sinCocinar(r) ? `<p class="nota">No hace falta cocinarla: el día que toca se resta sola de la despensa y deja de contar en la compra.</p>` : bloqueHecho(r, raciones)}
        ${bloqueNoDeseado(r, familia)}
      </article>`;
    })
    .join("");
  return `<div class="filtros" role="group" aria-label="Filtrar recetas">${filtros
    .filter(([id]) => ["todas", "reserva", "no-deseado"].includes(id) || visibles.has(id))
    .map(([id, texto], i) => `<button type="button" data-filtro="${id}" aria-pressed="${i === 0}">${texto}</button>`)
    .join("")}</div>
  <p class="sub">Cantidades para una ración de referencia (adulto de 2.000 kcal); la última columna es el total de la semana: la ración multiplicada por las raciones de todos los comensales (por ejemplo, 4,10 rac. si comen los cuatro). Todas las cantidades van en gramos; entre paréntesis, las unidades o los ml de referencia (equivalencias en <a href="#definiciones">Definiciones</a>). Sal, especias y caldo no se cuentan. Con «Cocinado» apuntas para qué comidas del menú has cocinado y cuántas raciones has hecho: se restan los ingredientes de la despensa, esas comidas dejan de contar en la compra y lo que sobra queda en reserva (nevera o congelador) y aparece en Despensa. Un plato marcado como no deseado no se vuelve a proponer a quien lo marcó. Las recetas que no se cocinan (bocadillos, yogures, desayunos fijos) no salen en esta lista: se abren desde el menú y se restan solas de la despensa el día que tocan.</p>
  <div class="recetas">${tarjetas}</div>`;
}

export const claveProducto = (nombre: string, unidad: string) =>
  `${nombre}|${unidad}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Lista de la compra: la dibuja el script a partir de los datos de la página, porque
 * cambia con lo que se cocina, el diario, los cambios del menú y la despensa.
 */
/** Pasillos de la lista: los de las recetas y, para lo añadido a mano, droguería y limpieza. */
const PASILLOS = [...SECCIONES, "Droguería y limpieza", "Otros"];

function seccionCompra(): string {
  return `<div class="compra-acciones">
    <p class="sub"><span id="compra-marcados">0</span> de <span id="compra-total">0</span> productos en el carro</p>
    <button type="button" id="copiar-lista">Copiar lo que falta</button>
    <button type="button" id="desmarcar" class="secundario">Desmarcar todo</button>
    <span id="copiado" class="sub" role="status"></span>
  </div>
  <form id="form-extra" class="form-despensa form-extra">
    <div><label for="x-nombre">Añadir a la lista</label><input id="x-nombre" name="nombre" required maxlength="80" autocomplete="off" placeholder="Pimentón, papel higiénico, lejía…" data-solo-editable-input></div>
    <div><label for="x-cantidad">Cantidad (opcional)</label><input id="x-cantidad" name="cantidad" maxlength="40" autocomplete="off" placeholder="2 paquetes" data-solo-editable-input></div>
    <div><label for="x-pasillo">Pasillo</label><select id="x-pasillo" name="pasillo" data-solo-editable-input>${PASILLOS.map((p) => `<option${p === "Despensa" ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
    <button type="submit" data-solo-editable-input>Añadir</button>
    <span class="sub estado-form" role="status"></span>
  </form>
  <div class="pasillos" id="pasillos"></div>`;
}

/** Inventario de despensa: añadir productos, lo que hay en casa, reservas y lo que pide el menú. */
function seccionDespensa(recetas: Receta[]): string {
  const nombres = [...new Set([...recetas.flatMap((r) => r.ingredientes.map((i) => i.nombre)), ...Object.keys(EQUIVALENCIAS.porUnidad)])]
    .sort((a, b) => a.localeCompare(b, "es"));
  return `<p class="sub aviso-db" id="despensa-aviso" role="status">Cargando el inventario guardado…</p>
  <div class="despensa-rejilla">
    <section class="categoria destacada-cat">
      <h4>Añadir producto</h4>
      <p class="sub">Cualquier cosa que tengas en casa, esté o no en el menú. Si ya estaba apuntado, se suma a lo que había.</p>
      <form id="form-despensa" class="form-despensa">
        <label for="p-nombre">Producto</label>
        <input id="p-nombre" name="nombre" list="lista-ingredientes" required autocomplete="off" data-solo-editable-input>
        <datalist id="lista-ingredientes">${nombres.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <div class="fila-form">
          <div><label for="p-cantidad">Cantidad (g)</label><input id="p-cantidad" name="cantidad" type="number" inputmode="decimal" min="0" step="any" required data-solo-editable-input></div>
          <div><label for="p-caducidad">Caduca (opcional)</label><input id="p-caducidad" name="caducidad" type="date" data-solo-editable-input></div>
        </div>
        <button type="submit" data-solo-editable-input>Añadir a la despensa</button>
        <span class="sub estado-form" role="status"></span>
      </form>
    </section>
    <section class="categoria">
      <h4>En casa ahora</h4>
      <ul id="inventario" class="inventario"><li class="sub">Sin productos apuntados.</li></ul>
    </section>
    <section class="categoria ancha">
      <h4>Reservas de raciones cocinadas</h4>
      <p class="sub">Lo que has marcado como hecho en Recetas y no se come esta semana. Úsalo antes de la fecha indicada; al comerlo, réstalo aquí.</p>
      <ul id="reservas" class="inventario reservas"><li class="sub">Sin reservas. Se apuntan desde cada receta con «Cocinado».</li></ul>
    </section>
    <section class="categoria ancha">
      <h4>Lo que pide el menú (lo que queda de semana)</h4>
      <p class="sub">Apunta cuánto tienes de cada cosa, en gramos (equivalencias en <a href="#definiciones">Definiciones</a>). La lista de la compra se descuenta al momento.</p>
      <div class="scroll"><table class="tabla-despensa">
        <thead><tr><th>Producto</th><th class="num">Hace falta</th><th class="num">Tengo</th></tr></thead>
        <tbody id="tabla-despensa"></tbody>
      </table></div>
    </section>
  </div>
  <p class="sub">Para cambiar platos del menú y aprovechar lo que hay, usa «Actualizar menú» en el Menú o en el Diario.</p>`;
}

/** Diario de comidas: comentarios, cambios sobre el menú ideal, lo cocinado y la actividad. */
function seccionDiario(): string {
  return `<header class="cab"><h1 id="h-diario">Diario de comidas</h1>
    <p class="sub">Lo que se ha comido de verdad frente al menú ideal, lo cocinado y los cambios. Si alguien no comió lo previsto, se apunta en el menú con el botón «Anotaciones» de esa comida; si no se apunta nada, se da por comido lo previsto.</p>
    <div class="barra-acciones"><button type="button" class="btn-principal btn-actualizar">Actualizar menú</button></div>
    <p class="sub">«Actualizar menú» pasa al menú lo apuntado en el diario y pide a Claude que revise los días que quedan con el diario, los comentarios y la despensa. Tú decides qué cambios se aplican.</p></header>
    <section class="categoria ancha destacada-cat"><h4>Comentarios</h4>
      <p class="sub">Avisos para la semana, por ejemplo «RFC no come esta semana X, J y V». Claude los tiene en cuenta al actualizar el menú.</p>
      <form id="form-comentario" class="form-despensa"><label for="comentario-texto">Comentario</label><textarea id="comentario-texto" name="texto" rows="2" maxlength="500" required data-solo-editable-input></textarea><button type="submit" data-solo-editable-input>Añadir comentario</button><span class="sub estado-form" role="status"></span></form>
      <ul class="actividad" id="diario-comentarios"></ul></section>
    <section class="categoria ancha"><h4>Cambios sobre el menú ideal</h4><div class="scroll"><table class="tabla-diario"><thead><tr><th>Día</th><th>Comida</th><th>Previsto</th><th>Ahora</th><th>Origen</th><th>Nota</th></tr></thead><tbody id="diario-cambios"></tbody></table></div></section>
    <section class="categoria ancha"><h4>Lo cocinado</h4><div class="scroll"><table class="tabla-diario"><thead><tr><th>Día</th><th>Comida</th><th>Plato</th><th class="num">Raciones</th></tr></thead><tbody id="diario-cocinado"></tbody></table></div></section>
    <section class="categoria ancha"><h4>Actividad</h4><ul class="actividad" id="diario-actividad"></ul></section>`;
}

/** Definiciones: términos, equivalencias a gramos, medidas caseras, ración de referencia y Thermomix. */
function seccionDefiniciones(): string {
  const tabla = (cab: string[], filas: string[][]) =>
    `<div class="scroll"><table class="def-tabla"><thead><tr>${cab.map((c, i) => `<th${i ? ' class="num"' : ""}>${c}</th>`).join("")}</tr></thead><tbody>${filas
      .map((f) => `<tr>${f.map((c, i) => `<td${i ? ' class="num mono"' : ""}>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  const porUnidad = Object.entries(EQUIVALENCIAS.porUnidad).sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([n, g]) => [esc(n), "1 ud", `${miles(g)} g`]);
  const porVolumen = [
    ...Object.entries(EQUIVALENCIAS.densidad).map(([n, d]) => [esc(n), "100 ml", `${miles(Math.round(100 * d))} g`]),
    ["Agua o caldo", "100 ml", "100 g"],
  ];
  const caseras = (EQUIVALENCIAS.medidasCaseras ?? []).map(([m, g]) => [esc(m), esc(g)]);
  const racion = [
    ["Pasta, arroz, cuscús o quinoa (en crudo)", "60-100 g"], ["Legumbre seca (lentejas)", "70 g"], ["Legumbre cocida de bote", "200 g"],
    ["Carne (pollo, pavo, cerdo, ternera)", "120-150 g"], ["Pescado en lomos o filetes", "130-150 g"], ["Huevos", "120 g (2 huevos)"],
    ["Pan", "40-80 g"], ["Verdura u hortaliza principal", "150-250 g"], ["Patata", "100-200 g"], ["Ensalada (lechuga)", "50 g"],
    ["Fruta de postre", "150 g"], ["Aceite de oliva", "9-14 g (10-15 ml)"],
  ];
  const terminos: [string, string][] = [
    ["Ración", "Lo que come en un día un adulto de 2.000 kcal en esa comida. Las cantidades de cada receta son para 1 ración."],
    ["rac.", "Raciones a preparar. Se suma la de cada comensal según su tamaño de ración. «4,16 rac.» significa: multiplica las cantidades de la receta por 4,16."],
    ["Tamaño de ración (×)", "Factor de cada persona según su objetivo diario de energía: ×1 son 2.000 kcal."],
    ["Comensal", "Quién come ese plato (las etiquetas con las iniciales)."],
    ["Batch del domingo", "Cocinar el domingo varios platos a la vez para dejar hechos los tuppers y algunas comidas de la semana."],
    ["Tupper frío / para recalentar", "Comida para llevar que se toma fría, o que se calienta en el microondas."],
    ["Ración extra / sobras", "Se cocina más cantidad en una comida y lo que sobra es otra comida o un tupper. Solo se marca como cocinado una vez."],
    ["Cocinado", "Casilla de cada plato del menú: al marcarla, los ingredientes de esas raciones se restan de la despensa."],
    ["Diario", "Lo que se comió de verdad cuando no fue lo previsto, con una nota."],
    ["Actualizar menú", "Claude revisa los días que quedan con el diario, los comentarios y la despensa, y propone cambios que tú apruebas."],
    ["Reserva", "Raciones cocinadas que no se comen esta semana y se guardan en la nevera o el congelador."],
    ["Variante", "Plato distinto para una persona en esa comida."],
    ["AOVE", "Aceite de oliva virgen extra."],
    ["Fruta de temporada", "Una pieza de fruta de la época, unos 150 g."],
    ["Despensa / En casa", "Lo que ya hay en casa. Se descuenta de la lista de la compra; lo que está en casa no sale en la lista."],
    ["No deseado", "Plato que alguien no quiere. No se le vuelve a proponer."],
    ["kcal", "Kilocalorías: la energía de la comida."],
    ["Metabolismo basal", "Energía que gasta el cuerpo en reposo."],
    ["Gasto diario", "Metabolismo basal más la actividad cotidiana y el deporte."],
    ["Objetivo diario", "Energía que se planifica para cada persona; si hay objetivo de peso acordado, es algo menor que el gasto."],
    ["IMC", "Índice de masa corporal: peso (kg) dividido por la altura (m) al cuadrado. En menores se valora con percentiles."],
  ];
  const thermomix: [string, string][] = [
    ["vel 1 … vel 10", "Velocidad de las cuchillas: 1 remueve despacio, 5 pica, 10 tritura."],
    ["vel cuchara", "La velocidad más lenta, para remover sin romper."],
    ["Giro a la izquierda", "Las cuchillas giran al revés y no cortan: para guisos con trozos."],
    ["4 s / 5 min", "Tiempo: segundos (s) o minutos (min)."],
    ["100 °C, 120 °C", "Temperatura del vaso."],
    ["Varoma", "Recipiente de arriba para cocinar al vapor; también la temperatura más alta."],
    ["Cubilete, cestillo", "Tapón de la tapa y cesta interior del vaso."],
  ];
  return `<header class="cab"><h1 id="h-def">Definiciones</h1>
    <p class="sub">Qué significa cada término de la página y cuánto pesa cada cosa. Todas las cantidades van en gramos; las equivalencias son aproximadas y salen de <code>data/equivalencias.json</code>.</p></header>
    <div class="categorias">
      ${categoria("Términos", pares(terminos), "ancha")}
      ${categoria("De unidades a gramos", `<p class="sub">Peso medio de una pieza.</p>${tabla(["Producto", "Medida", "Gramos"], porUnidad)}`)}
      ${categoria("De mililitros a gramos", `<p class="sub">Los líquidos se pesan: 100 ml no siempre son 100 g.</p>${tabla(["Producto", "Medida", "Gramos"], porVolumen)}`)}
      ${categoria("Medidas caseras", tabla(["Medida", "Gramos"], caseras))}
      ${categoria("Tamaño de una ración de referencia", `<p class="sub">Adulto de 2.000 kcal. Pesos en crudo y limpios.</p>${tabla(["Alimento", "1 ración"], racion)}`)}
      ${categoria("Thermomix", pares(thermomix))}
    </div>
    <p class="sub">Si un envase o una pieza pesa distinto en casa, díselo al agente y se cambia la equivalencia.</p>`;
}

/** Ventanas del diario y de «Actualizar menú», botón fijo de la compra y aviso flotante. */
const DIALOGOS = `
<dialog id="dlg-diario" class="dlg">
  <form method="dialog" id="form-diario">
    <h3 id="dlg-diario-titulo">Diario</h3>
    <p class="sub" id="dlg-diario-previsto"></p>
    <fieldset><legend class="sr">¿Qué se comió?</legend>
      <label class="opcion"><input type="radio" name="tipo" value="previsto" checked> Lo previsto</label>
      <label class="opcion"><input type="radio" name="tipo" value="receta"> Otro plato del recetario</label>
      <select name="receta" id="dlg-diario-receta" aria-label="Plato del recetario"></select>
      <label class="opcion"><input type="radio" name="tipo" value="texto"> Otra cosa</label>
      <input type="text" name="texto" id="dlg-diario-texto" aria-label="Qué se comió" placeholder="Por ejemplo: pizza en casa de los abuelos">
    </fieldset>
    <label for="dlg-diario-nota">Nota (opcional)</label>
    <input type="text" name="nota" id="dlg-diario-nota" placeholder="Por ejemplo: no había merluza">
    <p class="sub estado-form" role="status"></p>
    <div class="botones-dlg"><button type="submit" value="guardar" class="btn-principal">Guardar</button><button type="submit" value="cancelar" class="secundario" formnovalidate>Cancelar</button></div>
  </form>
</dialog>
<dialog id="dlg-actualizar" class="dlg dlg-ancho">
  <h3>Actualizar menú</h3>
  <div id="act-cuerpo"></div>
  <p class="sub estado-form" id="act-estado" role="status"></p>
  <div class="botones-dlg" id="act-botones"></div>
</dialog>
<dialog id="dlg-mover" class="dlg">
  <h3>Intercambiar comidas</h3>
  <div id="dlg-mover-cuerpo" class="cuerpo-dlg"></div>
  <div class="botones-dlg" id="dlg-mover-botones"></div>
</dialog>
<dialog id="dlg-anot" class="dlg">
  <h3 id="dlg-anot-titulo">Anotaciones</h3>
  <div id="dlg-anot-cuerpo" class="cuerpo-dlg"></div>
  <p class="sub estado-form" id="dlg-anot-estado" role="status"></p>
  <div class="botones-dlg" id="dlg-anot-botones"></div>
</dialog>
<dialog id="dlg-perfil" class="dlg">
  <h3 id="dlg-perfil-titulo"></h3>
  <div id="dlg-perfil-cuerpo" class="cuerpo-dlg"></div>
  <p class="sub estado-form" id="dlg-perfil-estado" role="status"></p>
  <div class="botones-dlg" id="dlg-perfil-botones"></div>
</dialog>
<button type="button" id="btn-confirmar-compra" class="btn-flotante" hidden>Confirmar compra</button>
<div id="aviso-flotante" class="aviso-flotante" role="status" hidden></div>`;

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
          ${
            familia.objetivos[id]
              ? `<p class="nota aviso-borde"><strong>Objetivo de peso aceptado, aplicar:</strong> ${esc(propuesta.ajusteConObjetivo[id] ?? "—")}</p>`
              : `<p class="nota"><strong>Si acepta el objetivo de peso:</strong> ${esc(propuesta.ajusteConObjetivo[id] ?? "—")}</p>`
          }
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
.pagina{max-width:1180px;margin:0 auto;padding-inline:clamp(16px,4vw,40px);padding-block:28px 56px;display:grid;gap:40px}
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
.fila{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:10px}
@media (max-width:520px){.fila{grid-template-columns:64px 1fr}.fila-id{font-size:.8rem;line-height:1.1}}
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
.semana-scroll{display:grid;grid-auto-flow:column;grid-auto-columns:220px;grid-template-rows:repeat(var(--filas,6),auto);gap:12px;overflow-x:auto;padding:4px 4px 12px;scroll-snap-type:x proximity;scroll-padding-left:4px}
.col-dia{display:grid;grid-row:span var(--filas,6);grid-template-rows:subgrid;row-gap:0;background:var(--surface);border:2px solid var(--accent);border-radius:12px;scroll-snap-align:start;overflow:hidden}
.col-dia.sem-proxima{border:2px dashed var(--muted)}
.dia-cab{font:650 1rem var(--f-display);padding:8px 12px;background:var(--accent-soft);display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px}
.col-dia.sem-proxima .dia-cab{background:var(--bg)}
.dia-fecha{font:400 .82rem var(--f-body);color:var(--muted)}
.dia-etq{flex-basis:100%;font:600 .64rem var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);line-height:1}
.como-se-lee summary{cursor:pointer;color:var(--accent);font-size:.88rem;font-weight:600}
.col-dia.hoy .dia-etq{color:var(--accent)}
.celda{padding:8px 12px 10px;border-top:1px solid var(--line);display:flex;flex-direction:column;align-content:start;min-width:0}
.celda{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
.celda.arrastrando{opacity:.4}
.celda.destino{outline:3px dashed var(--accent);outline-offset:-3px;background:var(--accent-soft)}
.fantasma-mover{position:fixed;left:0;top:0;z-index:50;max-width:240px;background:var(--surface);border:2px solid var(--accent);border-radius:10px;padding:8px 10px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:.85rem;line-height:1.3;pointer-events:none}
body.arrastrando-comida{cursor:grabbing}
.avisos-mover{margin:0;padding-left:1.1em;display:grid;gap:3px;font-size:.88rem;color:var(--calor)}
.celda-etq{font:600 .66rem var(--f-body);text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:3px}
.leyenda-semanas{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:.8rem;color:var(--muted);margin:10px 0 0}
.leyenda-semanas .muestra{display:inline-block;width:26px;height:14px;border-radius:4px;border:2px solid var(--accent);margin-left:6px}
.leyenda-semanas .muestra.sem-proxima{border:2px dashed var(--muted)}
@media (max-width:640px){.semana-scroll{grid-auto-columns:100%;scroll-snap-type:x mandatory;gap:8px;padding:4px 0 12px}.col-dia{scroll-snap-stop:always}}
.plato-menu.segundo{margin-top:3px;padding-top:3px;border-top:1px dotted var(--line)}
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
.coste{display:grid;gap:12px;margin-top:8px}
.coste-tarjetas{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.coste-tarjeta{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:grid;gap:4px;align-content:start}
.coste-tarjeta.destacada{border-color:var(--accent);background:var(--accent-soft)}
.coste-total{font-size:1.5rem;font-weight:600;margin:0}
.coste details summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:.9rem}
.tabla-coste{font-size:.88rem;background:var(--surface)}
.tabla-coste td,.tabla-coste th{padding:5px 8px}
.tabla-coste .num{text-align:right;white-space:nowrap}
.tabla-coste td.mejor{font-weight:700;color:var(--bien)}
.thermomix{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--bien-soft)}
.thermomix summary{cursor:pointer;font-weight:600;font-size:.9rem;color:var(--bien)}
.thermomix .pasos{margin-top:8px}
.no-deseado{display:grid;gap:6px;border-top:1px dashed var(--line);padding-top:10px}
.marcas{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:.86rem}
.marcas li{background:var(--aviso-soft);border-radius:6px;padding:6px 8px}
.marcas strong{color:var(--aviso)}
.marcar summary{cursor:pointer;font-size:.86rem;font-weight:600;color:var(--muted)}
.form-nd,.form-despensa{display:grid;gap:6px;margin-top:8px;font-size:.9rem}
.form-nd label,.form-despensa label{font-size:.8rem;color:var(--muted);font-weight:600}
.form-nd select,.form-nd textarea,.form-despensa input,.form-despensa select,.tengo input{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.form-nd button,.form-despensa button{font:600 .88rem var(--f-body);background:var(--accent);color:var(--surface);border:0;border-radius:999px;padding:7px 14px;cursor:pointer;justify-self:start}
.form-nd button:disabled,.form-despensa button:disabled{opacity:.5;cursor:not-allowed}
.fila-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fila-form div{display:grid;gap:6px}
button.enlace{background:none;border:0;color:var(--accent);font:600 .82rem var(--f-body);cursor:pointer;padding:0 4px;text-decoration:underline}
.badge-nd{display:inline-block;margin-top:4px;font-size:.7rem;font-weight:700;color:var(--aviso);background:var(--aviso-soft);border-radius:4px;padding:1px 6px}
.despensa-rejilla{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;align-items:start}
.tabla-despensa{font-size:.9rem}
.tabla-despensa td,.tabla-despensa th{padding:5px 8px}
.tabla-despensa .num{text-align:right}
.grupo-despensa th{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);background:var(--bg)}
.tengo{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end}
.tengo input{width:90px;text-align:right;padding:4px 6px}
.inventario{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:.92rem}
.inventario li{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;border-bottom:1px dashed var(--line);padding-bottom:4px}
.inventario .producto{flex:1}
.nota-producto{flex-basis:100%;font-size:.76rem}
.hecho{display:grid;gap:6px;border-top:1px dashed var(--line);padding-top:10px}
.reserva-receta{margin:0;font-size:.86rem;background:var(--bien-soft);color:var(--bien);border-radius:6px;padding:6px 8px;font-weight:600}
.form-hecho{display:grid;gap:6px;margin-top:8px;font-size:.9rem}
.form-hecho label{font-size:.8rem;color:var(--muted);font-weight:600}
.form-hecho input,.form-hecho select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.form-hecho button{font:600 .88rem var(--f-body);background:var(--accent);color:var(--surface);border:0;border-radius:999px;padding:7px 14px;cursor:pointer;justify-self:start}
.form-hecho .sub{margin:0}
.usos-form{border:0;padding:0;margin:0;display:grid;gap:4px}
.usos-form legend{font-size:.8rem;color:var(--muted);font-weight:600;padding:0;margin-bottom:2px}
.usos-form label{display:flex;gap:6px;align-items:center;font-weight:400;color:var(--ink);font-size:.86rem;cursor:pointer}
.usos-form input{width:auto;accent-color:var(--accent)}
.cocinado-usos{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:.84rem}
.cocinado-usos li{background:var(--bien-soft);color:var(--bien);border-radius:6px;padding:4px 8px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.coc-menu{color:var(--bien);font-weight:600}
.reservas a{color:var(--ink);font-weight:600}
.reservas .vence{color:var(--aviso);font-weight:600}
.aviso-db{background:var(--info-soft);padding:8px 12px;border-radius:6px}
.barra{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top,0px)}
.barra-dentro{max-width:1180px;margin:0 auto;padding:10px clamp(16px,4vw,40px);display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px}
.marca{font:700 1.05rem var(--f-display);display:flex;gap:8px;align-items:baseline}
.marca .etq{color:var(--accent)}
.nav{display:flex;flex-wrap:wrap;gap:4px}
.nav a{color:var(--muted);text-decoration:none;font-weight:600;font-size:.93rem;padding:6px 12px;border-radius:999px}
.nav a:hover{color:var(--ink);background:var(--accent-soft)}
.nav a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.nav a[aria-current]{background:var(--accent);color:var(--surface)}
.vista{display:grid;gap:24px;scroll-margin-top:80px}
.categorias{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;align-items:start}
.categoria{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;gap:10px;align-content:start}
.categoria h4{font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);font-family:var(--f-body);font-weight:700}
.categoria.ancha{grid-column:1 / -1}
.grupo,.panel-config{display:grid;gap:16px}
.panel-config{padding-top:16px}
.pares{margin:0;display:grid;gap:8px}
.pares div{display:grid;grid-template-columns:minmax(110px,40%) 1fr;gap:10px;align-items:baseline}
.pares dt{color:var(--muted);font-size:.86rem}
.pares dd{margin:0;font-size:.95rem}
.pares dd div{display:block}
.pares a,.categoria a{color:var(--ink);font-weight:600;text-decoration-color:var(--accent)}
.ficha{display:grid;gap:16px}
.ficha-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.ficha-cab h3{font-size:1.8rem}
.lista-deporte,.miembros,.criterios{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:.93rem}
.lista-deporte li{display:flex;justify-content:space-between;gap:10px}
.lista-deporte .mono{color:var(--muted);font-size:.82rem}
.criterios li::before{content:"·";color:var(--accent);font-weight:700;margin-right:6px}
.en-casa-fila{display:flex;align-items:center;gap:10px}
.en-casa-fila .etq{width:56px}
.dias-mini{list-style:none;margin:0;padding:0;display:flex;gap:4px}
.dias-mini li{width:28px;height:28px;border-radius:6px;display:grid;place-items:center;font:600 .78rem var(--f-mono);border:1px solid var(--line);color:var(--muted)}
.dias-mini li.si{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.dias-mini li.tupper-dia,.muestra-dia.tupper-dia{background:var(--calor-soft);border-color:var(--calor);color:var(--calor)}
.dias-mini li.tupper-dia.frio,.muestra-dia.tupper-dia.frio{background:var(--frio-soft);border-color:var(--frio);color:var(--frio)}
.muestra-dia{width:14px;height:14px;border-radius:4px;border:1px solid var(--line);display:inline-block;flex:none}
.muestra-dia.si{background:var(--accent);border-color:var(--accent)}
.leyenda-regimen{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.84rem;align-items:center}
.leyenda-regimen li{display:inline-flex;align-items:center;gap:6px}
.regimen td .comensal{display:inline-block;margin:1px 0}
.comensal.casa{background:var(--accent);color:var(--surface)}
.comensal.tupper-frio{background:var(--frio-soft);color:var(--frio);box-shadow:inset 0 0 0 1px var(--frio)}
.comensal.tupper-calor{background:var(--calor-soft);color:var(--calor);box-shadow:inset 0 0 0 1px var(--calor)}
.comensal.almuerzo{background:var(--aviso-soft);color:var(--aviso);box-shadow:inset 0 0 0 1px var(--aviso)}
.ficha-bloques{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));align-items:stretch}
@media (min-width:1000px){.ficha-bloques{grid-template-columns:repeat(3,1fr)}.ficha-bloques .doble{grid-column:span 2}}
.ficha-bloques .doble .pares div{grid-template-columns:minmax(110px,22%) 1fr}
.botones-ficha{display:flex;flex-wrap:wrap;gap:6px}
.historial-peso{list-style:none;margin:0;padding:0;display:grid;gap:2px;font-size:.82rem;color:var(--muted)}
.historial-peso li{display:flex;justify-content:space-between;gap:10px}
.dlg input[type=number],.dlg textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.dlg .fila-campos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dlg .fila-campos label{display:grid;gap:4px}
.resultado-objetivo,.cuerpo-dlg{display:grid;gap:8px}
.comio{display:grid;gap:3px;margin-top:4px}
.comio-nota{font-size:.74rem;color:var(--muted);line-height:1.25}
.comio-nota strong{color:var(--ink)}
.bloque-anot{border:1px solid var(--line)!important;border-radius:8px;padding:10px 12px!important;display:grid;gap:6px}
.bloque-anot legend{font-weight:700;font-size:.85rem;padding:0 4px}
.una-anot .bloque-anot{border:0!important;padding:0!important}
.una-anot .bloque-anot legend,.una-anot .bloque-anot > .btn-mini{display:none}
.segmento{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.segmento .opcion{position:relative;justify-content:center;border:1px solid var(--line);border-radius:8px;padding:9px 6px;font-size:.9rem}
.segmento .opcion input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.segmento .opcion:has(input:checked){background:var(--accent-soft);border-color:var(--accent);color:var(--ink)}
.segmento .opcion:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
.ayuda-anot{margin:0}
.mas-anot{margin-top:2px}
.quien-anot{display:flex;flex-wrap:wrap;gap:6px 12px}
.chip-quien{position:relative;display:inline-flex;cursor:pointer}
.chip-quien input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.chip-quien .comensal{font-size:.85rem;padding:5px 13px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line);opacity:.8}
.chip-quien .comensal.no-previsto{background:transparent;color:var(--muted);box-shadow:inset 0 0 0 1px var(--muted);border:0}
.chip-quien input:checked + .comensal{opacity:1;background:var(--accent);color:var(--surface);box-shadow:none}
.chip-quien input:checked + .comensal::before{content:"✓ "}
.chip-quien input:checked + .comensal.tupper-frio{background:var(--frio)}
.chip-quien input:checked + .comensal.tupper-calor{background:var(--calor)}
.chip-quien input:focus-visible + .comensal{outline:2px solid var(--accent);outline-offset:2px}
.chip-quien input:disabled + .comensal{opacity:.35}
.quien-anot{align-items:center}
.resumen-anot{background:var(--bg);border-radius:8px;padding:8px 12px;display:grid;gap:3px;font-size:.88rem}
.resumen-anot .etq{margin:0}
.resumen-anot span{line-height:1.3}
.comensal.no-previsto{background:transparent;box-shadow:inset 0 0 0 1px var(--line);color:var(--muted)}
.dlg .btn-mini{justify-self:start}
.fila-gasto{display:grid;grid-template-columns:1fr 80px auto;gap:6px;align-items:center}
.dlg .fila-gasto input{width:100%}
.gasto summary{cursor:pointer;font-weight:600;font-size:.9rem;color:var(--accent)}
.gasto[open]{display:grid;gap:8px}
.dlg label.bloque{display:grid;gap:4px}
.reparto{font-size:.9rem}
.reparto th,.reparto td{padding:4px 6px}
.reparto .num{text-align:right}
.regimen td{min-width:96px}
code{font-family:var(--f-mono);font-size:.85em;background:var(--info-soft);padding:1px 5px;border-radius:4px}
.receta[id]{scroll-margin-top:72px}
.filtros{display:flex;flex-wrap:wrap;gap:6px}
.filtros button,.compra-acciones button{font:600 .88rem var(--f-body);border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:5px 12px;border-radius:999px;cursor:pointer}
.filtros button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.filtros button:focus-visible,.compra-acciones button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.recetas{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;align-items:start}
.receta{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:12px}
.receta:target{outline:2px solid var(--accent)}
.receta.sin-cocinar{display:none}
.receta.sin-cocinar:target{display:grid}
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
.semana-compra{grid-column:1 / -1;justify-self:start;font-size:.72rem;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--ink)}
.semana-compra.prox{border-style:dashed;color:var(--muted)}
.semana-compra.extra{border-color:var(--accent);color:var(--accent)}
.quitar-extra{border:0;background:none;color:var(--muted);font-size:1.1rem;line-height:1;cursor:pointer;padding:0 4px}
.form-extra{grid-template-columns:2fr 1fr 1fr auto;align-items:end;margin:12px 0 16px}
.form-extra .estado-form{grid-column:1 / -1}
@media (max-width:640px){.form-extra{grid-template-columns:1fr 1fr}.form-extra div:first-child{grid-column:1 / -1}}
.pasillo input:checked + label .producto,.pasillo input:checked + label .cant{text-decoration:line-through;color:var(--muted)}
.en-casa .cant{color:var(--bien)}
.pestanas{display:flex;gap:4px;border-bottom:1px solid var(--line)}
.pestanas button{font:600 .95rem var(--f-body);color:var(--muted);background:none;border:0;border-bottom:3px solid transparent;padding:8px 14px;cursor:pointer;margin-bottom:-1px}
.pestanas button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent)}
.pestanas button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pestanas .rango{font-weight:400;font-size:.8rem;color:var(--muted);white-space:nowrap}
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

.historial{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 16px}
.historial summary{cursor:pointer;font-size:.88rem;font-weight:600}
.historial ul{margin:6px 0 0;padding-left:1.1em;font-size:.88rem;display:grid;gap:4px}
.barra-acciones{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.btn-principal{font:600 .95rem var(--f-body);background:var(--accent);color:var(--surface);border:1px solid var(--accent);border-radius:999px;padding:8px 18px;cursor:pointer}
.btn-principal:disabled{opacity:.5;cursor:not-allowed}
.secundario{font:600 .95rem var(--f-body);background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:8px 18px;cursor:pointer}
.btn-principal:focus-visible,.secundario:focus-visible,.btn-mini:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.enlace-diario{color:var(--accent);font-weight:600}
.form-despensa textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.aviso-pasados{margin:0}
.acciones{display:grid;gap:4px;margin-top:8px;padding-top:6px;border-top:1px dashed var(--line);font-size:.76rem}
.coc{display:flex;flex-wrap:nowrap;align-items:center;gap:4px}
.coc label{flex:1;min-width:0}
.coc label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-weight:600}
.coc input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px;margin:0}
.coc input[type=number]{width:50px;font:inherit;font-family:var(--f-mono);padding:1px 4px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--ink)}
.coc.hecho label{color:var(--bien)}
.coc .quien{font-weight:400;color:var(--muted)}
.sobras-txt{color:var(--muted)}
.btn-mini{font:600 .74rem var(--f-body);background:var(--surface);color:var(--accent);border:1px solid var(--line);border-radius:999px;padding:2px 9px;cursor:pointer;justify-self:start}
.btn-mini.con-dato{background:var(--accent-soft);border-color:var(--accent)}
.plato-menu.oculto{display:none}
.celda.nadie{background:var(--bg);opacity:.75}
.nadie-come{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
.nadie-come .sub{flex-basis:100%;margin:0}
.plato-real{margin-top:4px;font-size:.85rem;line-height:1.3;display:grid;gap:2px}
.plato-real a{font-weight:700;color:var(--ink);text-decoration:none}
.origen{display:inline-block;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:4px;padding:0 5px;margin-right:4px}
.origen.diario{background:var(--frio-soft);color:var(--frio)}
.origen.claude{background:var(--calor-soft);color:var(--calor)}
.plato-real .motivo{font-size:.74rem;color:var(--muted)}
.des-sub{display:block;font-size:.74rem}
.dlg{border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);padding:20px;width:min(460px,calc(100vw - 32px));box-shadow:0 12px 40px rgba(0,0,0,.25)}
.dlg-ancho{width:min(680px,calc(100vw - 32px))}
#dlg-anot{width:min(540px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto}
#dlg-anot-botones{position:sticky;bottom:-20px;background:var(--surface);padding:10px 0 4px;border-top:1px solid var(--line)}
.dlg::backdrop{background:rgba(0,0,0,.4)}
.dlg form,.dlg{display:grid;gap:10px}
.dlg:not([open]){display:none}
.dlg fieldset{border:0;padding:0;margin:0;display:grid;gap:6px}
.dlg .opcion{display:flex;gap:8px;align-items:center;font-weight:600;cursor:pointer}
.dlg input[type=text],.dlg select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%}
.dlg label{font-size:.9rem}
.botones-dlg{display:flex;flex-wrap:wrap;gap:8px}
.propuestas{list-style:none;margin:0;padding:0;display:grid;gap:8px;max-height:50vh;overflow:auto}
.propuestas li{border:1px solid var(--line);border-radius:8px;padding:8px 10px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:.9rem}
.propuestas .motivo{grid-column:2;color:var(--muted);font-size:.84rem}
.btn-flotante{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:20;font:700 1rem var(--f-body);background:var(--accent);color:var(--surface);border:0;border-radius:999px;padding:14px 22px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
.btn-flotante:disabled{opacity:.6;cursor:wait}
.btn-flotante:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.aviso-flotante{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:21;background:var(--ink);color:var(--surface);padding:8px 16px;border-radius:8px;font-size:.9rem;max-width:calc(100vw - 32px)}
.destacada-cat{border-color:var(--accent);background:var(--accent-soft)}
.tabla-diario{font-size:.88rem}
.tabla-diario td,.tabla-diario th{padding:5px 8px}
.tabla-diario .num{text-align:right}
.actividad{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:.9rem}
.actividad li{display:grid;grid-template-columns:120px 1fr;gap:10px;border-bottom:1px dashed var(--line);padding-bottom:4px}
@media (max-width:520px){.actividad li{grid-template-columns:1fr}}
.equiv{color:var(--muted);font-size:.9em}
.ingredientes .equiv{display:block;font-size:.78em;line-height:1.2}
.ingredientes thead .num{white-space:normal}
.ingredientes thead .mono{display:block}
.def-tabla td,.def-tabla th{padding:5px 8px}
.def-tabla .num{text-align:right;white-space:nowrap}
.pie{font-size:.85rem;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;max-width:75ch}
@media (max-width:520px){.cifras dd{font-size:1.05rem}.platos li{grid-template-columns:24px 1fr}.platos .kcal{grid-column:2}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/** Una casilla del menú tal como la usa el script de la página. */
export interface CeldaCliente {
  id: string;
  sem: string;
  /** 0 = lunes … 6 = domingo. */
  dia: number;
  comida: TipoComida;
  /** Recetas del plato principal (primero y segundo). */
  platos: string[];
  /** Quién come el plato principal. */
  quien: string[];
  rac: number;
  /** Raciones a cocinar: las suyas más las de las comidas y tuppers que salen de esta (sobras). */
  racCocinar: number;
  personas: number;
  /** Sale de otra comida: no se marca como cocinada aparte. */
  sobras: boolean;
  /** Casilla donde se cocina, si sale de otra comida. */
  sobrasDe?: string;
  variantes: { quien: string; receta: string; rac: number }[];
  tuppers: { quien: string; recetas: string[]; rac: number; sobras: boolean; frio: boolean; sobrasDe?: string }[];
  /** Desayunos fijos del día (receta, raciones, personas y quién los toma). */
  desayunos?: { receta: string; rac: number; personas: number; quien: string[] }[];
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** «28 sep – 4 oct» a partir del lunes de la semana. */
export function rangoSemana(lunes: string): string {
  const f = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(lunes)} – ${f(sumarDias(lunes, 6))}`;
}

/** Lunes de la semana de una fecha (AAAA-MM-DD). */
function lunesDe(fecha: Date): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Casillas del menú para el script: platos, comensales, raciones y qué es sobra de qué.
 * Las raciones de una comida que sale de otra (sobrasDe) se suman a las de esa otra.
 */
export function celdasCliente(semana: string, dias: DiaDelMenu[]): CeldaCliente[] {
  const celdas: CeldaCliente[] = [];
  const sobras: { destino: string; rac: number; personas: number }[] = [];
  for (const d of dias) {
    const dia = DIAS_SEMANA.indexOf(d.dia);
    for (const c of d.comidas) {
      if (!c.platos.length) continue;
      const id = idCelda(semana, d.dia, c.tipo);
      if (c.tipo === "desayuno") {
        celdas.push({
          id, sem: semana, dia, comida: c.tipo, platos: [], quien: c.platos.flatMap((p) => p.comensales.map((x) => x.id)),
          rac: 1, racCocinar: 1, personas: 0, sobras: false, variantes: [], tuppers: [],
          desayunos: c.platos.map((p) => ({ receta: p.receta.id, rac: p.raciones, personas: p.comensales.length, quien: p.comensales.map((x) => x.id) })),
        });
        continue;
      }
      const [principal, ...variantes] = c.platos;
      celdas.push({
        id, sem: semana, dia, comida: c.tipo,
        platos: [principal.receta.id, ...(principal.segundo ? [principal.segundo.receta.id] : [])],
        quien: principal.comensales.map((x) => x.id),
        rac: principal.raciones, racCocinar: principal.raciones, personas: principal.comensales.length,
        sobras: Boolean(principal.sobrasDe),
        ...(principal.sobrasDe ? { sobrasDe: idCelda(semana, principal.sobrasDe.dia, principal.sobrasDe.comida) } : {}),
        variantes: variantes.map((v) => ({ quien: v.comensales[0].id, receta: v.receta.id, rac: v.raciones })),
        tuppers: c.tuppers.map((t) => ({
          quien: t.para, recetas: [t.receta.id, ...(t.segundo ? [t.segundo.receta.id] : [])], rac: t.raciones, sobras: Boolean(t.sobrasDe), frio: t.tipoTupper === "frío",
          ...(t.sobrasDe ? { sobrasDe: idCelda(semana, t.sobrasDe.dia, t.sobrasDe.comida) } : {}),
        })),
      });
      if (principal.sobrasDe) sobras.push({ destino: idCelda(semana, principal.sobrasDe.dia, principal.sobrasDe.comida), rac: principal.raciones, personas: principal.comensales.length });
      for (const t of c.tuppers) {
        if (t.sobrasDe) sobras.push({ destino: idCelda(semana, t.sobrasDe.dia, t.sobrasDe.comida), rac: t.raciones, personas: 1 });
      }
    }
  }
  for (const s of sobras) {
    const destino = celdas.find((c) => c.id === s.destino);
    if (!destino) continue;
    destino.racCocinar = redondear2(destino.racCocinar + s.rac);
    destino.personas += s.personas;
  }
  return celdas;
}

/** Script de la página (src/web-cliente.js), que se incrusta tal cual. */
const SCRIPT_CLIENTE = readFileSync(new URL("./web-cliente.js", import.meta.url), "utf8");

export interface DatosWeb {
  familia: Familia;
  propuesta: PropuestaTuppers;
  menu: MenuSemana;
  /** Propuesta de la semana siguiente, si existe. */
  menuSiguiente?: MenuSemana;
  recetas: Receta[];
  despensa?: Despensa;
  /** Precios por tienda para valorar la cesta. */
  precios?: TablaPrecios;
  fecha: string;
}

const euros = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

/** Coste de la cesta por tienda, la combinación más barata y el detalle por producto (solo precios reales). */
function seccionCoste(compra: Record<Seccion, LineaCompra[]>, tabla: TablaPrecios): string {
  const cesta = costeCesta(compra, tabla);
  const tiendas = tabla.tiendas.map((t) => t.id);
  const cabecera = `<h2 id="h-coste">Coste de la cesta</h2>`;
  if (!cesta.hayPrecios) {
    return `<section class="coste" aria-labelledby="h-coste">${cabecera}
      <p class="nota">Todavía no hay precios de ${esc(tiendas.join(", "))}. Se irán añadiendo desde los tickets de compra: cuando subas uno, el agente guarda el precio de cada producto de esa tienda y aquí verás el coste de la cesta en cada supermercado y la combinación más barata.</p>
    </section>`;
  }
  const tarjetaTienda = (t: string) => {
    const tot = cesta.totales[t];
    const habitual = tabla.tiendas.find((x) => x.id === t)?.habitual;
    return `<div class="coste-tarjeta">
      <p class="etq">${esc(t)}${habitual ? " · habitual" : ""}</p>
      ${
        tot.conPrecio
          ? `<p class="coste-total mono">${euros(tot.total)}</p><p class="sub">${tot.conPrecio} de ${cesta.productos} productos con precio</p>`
          : `<p class="coste-total sub">Sin precios</p><p class="sub">Aún no hay tickets de esta tienda.</p>`
      }
    </div>`;
  };
  const opt = cesta.optimizada;
  const reparto = Object.entries(opt.porTienda).map(([t, v]) => `${esc(t)} ${euros(v)}`).join(" · ");
  const celda = (l: (typeof cesta.lineas)[number], t: string) => {
    const c = l.porTienda[t];
    if (!c) return `<td class="num sub">—</td>`;
    const envase = c.precio.granel ? "granel" : `${c.envases} × ${cantidad(c.precio.cantidad, c.precio.unidad)}`;
    return `<td class="num mono${t === l.masBarata ? " mejor" : ""}" title="${esc(`${envase} · ${c.precio.fuente} ${c.precio.fecha}`)}">${euros(c.coste)}</td>`;
  };
  return `<section class="coste" aria-labelledby="h-coste">${cabecera}
    <div class="coste-tarjetas">
      ${tiendas.map(tarjetaTienda).join("")}
      <div class="coste-tarjeta destacada">
        <p class="etq">Combinación más barata</p>
        <p class="coste-total mono">${euros(opt.total)}</p>
        <p class="sub">${reparto}${opt.sinPrecio ? `. Faltan ${opt.sinPrecio} productos sin precio en ninguna tienda.` : ""}</p>
      </div>
    </div>
    <p class="sub">Precios reales de los tickets (o apuntados a mano); se usa el más reciente de cada producto y tienda. Se cuentan envases enteros, salvo lo que se vende a granel. Se calcula con la lista completa de la semana al generar la página; no descuenta lo apuntado después en la despensa.</p>
    <details>
      <summary>Ver el coste por producto</summary>
      <div class="scroll"><table class="tabla-coste">
        <thead><tr><th>Producto</th><th class="num">Comprar</th>${tiendas.map((t) => `<th class="num">${esc(t)}</th>`).join("")}</tr></thead>
        <tbody>${cesta.lineas
          .map((l) => `<tr><td>${esc(l.nombre)}</td><td class="num mono">${cantidad(l.comprar, l.unidad)}</td>${tiendas.map((t) => celda(l, t)).join("")}</tr>`)
          .join("")}</tbody>
      </table></div>
    </details>
  </section>`;
}

export function generarHtml({ familia, propuesta, menu, menuSiguiente, recetas, despensa, precios, fecha }: DatosWeb): string {
  const dias = componerMenu(familia, menu, recetas);
  const diasSiguiente = menuSiguiente ? componerMenu(familia, menuSiguiente, recetas) : undefined;
  const hoy = new Date();
  const inicio = menu.inicio ?? lunesDe(hoy);
  // Cada semana se identifica por su lunes: así las casillas de una semana A no se confunden con las
  // de la semana A de dos semanas después (el diario y lo cocinado se guardan por casilla).
  const inicioSiguiente = menuSiguiente?.inicio ?? sumarDias(inicio, 7);
  const semanas = [
    { semana: menu.semana, clave: inicio, dias },
    ...(menuSiguiente && diasSiguiente ? [{ semana: menuSiguiente.semana, clave: inicioSiguiente, dias: diasSiguiente }] : []),
  ];
  // Las casillas muestran el plato previsto antes de «Actualizar menú»; los cambios ya pasados al proyecto
  // van aparte y la página los pone encima, como los que aún están solo en la web.
  const celdasDe = (m: MenuSemana, clave: string) => celdasCliente(clave, componerMenu(familia, sinCambios(m), recetas));
  const cambiosBase = Object.fromEntries(
    [{ m: menu, clave: inicio }, ...(menuSiguiente ? [{ m: menuSiguiente, clave: inicioSiguiente }] : [])].flatMap(({ m, clave }) =>
      Object.entries(m.dias).flatMap(([dia, comidas]) =>
        Object.entries(comidas ?? {}).flatMap(([tipo, p]) => {
          if (!p?.cambio) return [];
          const celda = idCelda(clave, dia as Dia, tipo as TipoComida);
          return [[celda, {
            celda, recetas: [p.receta, ...(p.segundo ? [p.segundo] : [])], motivo: p.cambio.motivo, fecha: p.cambio.fecha,
            ...(p.comensales ? { comensales: p.comensales } : {}),
          }]];
        }),
      ),
    ),
  );
  const datosCliente = {
    miembros: familia.miembros.map((m) => m.id),
    recetas: Object.fromEntries(recetas.map((r) => [r.id, r.nombre])),
    // Ingredientes por ración en gramos: [clave, nombre, gramos, sección, por persona].
    rec: Object.fromEntries(recetas.map((r) => [r.id, {
      n: r.nombre, cat: [r.tipo], fija: Boolean(r.racionFija), sc: r.tecnica === "sin cocinar",
      ing: r.ingredientes.map((i) => {
        const c = normalizarCantidad(i.nombre, i.cantidad, i.unidad);
        return [claveProducto(i.nombre, c.unidad), i.nombre, c.cantidad, i.seccion, i.porPersona ? 1 : 0, c.unidad];
      }),
    }])),
    menu: Object.fromEntries([
      [inicio, { letra: menu.semana, inicio, celdas: celdasDe(menu, inicio) }],
      ...(menuSiguiente ? [[inicioSiguiente, { letra: menuSiguiente.semana, inicio: inicioSiguiente, celdas: celdasDe(menuSiguiente, inicioSiguiente) }]] : []),
    ]),
    cambios: cambiosBase,
    // La página decide por la fecha cuál es la semana en curso (rotación de semanas).
    semanaActual: inicio,
    ordenPasillos: PASILLOS,
    factores: Object.fromEntries(familia.miembros.map((m) => [m.id, calcularNecesidades(m, familia.objetivos[m.id]).factorRacion])),
    alias: Object.fromEntries(familia.miembros.map((m) => [m.id, m.alias ?? m.id])),
    // Lo que hace falta para recalcular la ficha en la página al cambiar el peso o el objetivo.
    perfiles: Object.fromEntries(familia.miembros.map((m) => {
      const tmb = coeficientesTmb(m);
      const desayuno = familia.desayunos?.[m.id];
      return [m.id, {
        adulto: m.edad >= 18, alturaCm: m.alturaCm, pesoKg: m.pesoKg,
        tmbPorKg: tmb.porKg, tmbFija: tmb.fija, deportePorKg: kcalDeportePorKg(m),
        objetivo: familia.objetivos[m.id] ?? null, gustos: m.gustos,
        desayuno: desayuno ? recetas.find((r) => r.id === desayuno.receta)?.nombre ?? desayuno.receta : "",
        desayunoDesdeTexto: desayuno?.desdeTexto ?? null,
        actividades: m.actividades, rol: familia.roles[m.id] ?? "",
        regimen: {
          comida: DIAS_SEMANA.filter((d) => familia.regimen.comida[d].includes(m.id)),
          cena: DIAS_SEMANA.filter((d) => familia.regimen.cena[d].includes(m.id)),
          tupper: familia.regimen.tupper?.[m.id] ?? null,
          almuerzo: familia.regimen.almuerzo?.[m.id] ?? null,
        },
      }];
    })),
    deportes: Object.fromEntries(Object.keys(MET).map((k) => [k, { nombre: DEPORTE[k] ?? k, met: MET[k] }])),
    constantes: { metPorDefecto: MET_POR_DEFECTO, factorBase: FACTOR_BASE, kcalReferencia: KCAL_REFERENCIA, kcalPorKg: KCAL_POR_KG, perdidaKgSemana: PERDIDA_KG_SEMANA, perdidaMaxima: PERDIDA_MAXIMA_KG_SEMANA, imcMin: IMC_MIN, imcMax: IMC_MAX },
    gud: Object.fromEntries(recetas.flatMap((r) => r.ingredientes).map((i) => [claveProducto(i.nombre, "g"), gramosPorUnidad(i.nombre)]).filter(([, g]) => g)),
    den: Object.fromEntries(Object.keys(EQUIVALENCIAS.densidad).map((n) => [claveProducto(n, "g"), densidad(n)])),
    normas: [
      ...(familia.preferencias ?? []),
      ...(familia.restricciones ?? []).map((r) => r.motivo),
      ...(familia.supervision ?? []).map((s) => s.motivo),
      "Legumbres 2-4 veces por semana", "Pescado 3-4 veces", "Huevo 3-4 veces por semana", "Verdura en comida y cena", "Fruta a diario",
      "Carne roja, 1-2 veces como máximo", "Ultraprocesados, ocasionales",
    ],
    despensa: (despensa?.productos ?? []).map((p) => {
      const c = normalizarCantidad(p.nombre, p.cantidad, p.unidad);
      return { ...p, ...c, clave: claveProducto(p.nombre, c.unidad) };
    }),
    noDeseados: familia.noDeseados ?? [],
    semana: menu.semana,
    reservas: (despensa?.sobras ?? []).map((x, i) => ({
      id: x.id ?? `repo-${i}`, receta: x.receta, descripcion: x.descripcion, reserva: x.raciones, hechas: x.hechas,
      donde: x.ubicacion, fecha: x.fecha, caduca: x.consumirAntesDe,
    })),
  };
  const compra = listaCompra(dias, despensa);
  const comidas = dias.flatMap((d) => d.comidas);
  const tuppersSemana = comidas.reduce((s, c) => s + c.tuppers.length, 0);
  const recetasUsadas = new Set(comidas.flatMap((c) => [...c.platos, ...c.tuppers].map((p) => p.receta.id))).size;
  const paginas = [
    ["menu", "Menú"],
    ["diario", "Diario"],
    ["recetas", "Recetas"],
    ["compra", "Compra"],
    ["despensa", "Despensa"],
    ["tuppers", "Tuppers"],
    ["normas", "Normas"],
    ["definiciones", "Definiciones"],
    ["configuracion", "Configuración"],
  ];

  return conAlias(`<title>Menú ${esc(familia.nombre)}</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;600&family=Source+Sans+3:wght@400;600&display=swap">
<style>${ESTILOS}</style>
<header class="barra">
  <div class="barra-dentro">
    <p class="marca"><span class="etq">AgenteMenú</span> ${esc(familia.nombre)}</p>
    <nav class="nav" aria-label="Páginas">
      ${paginas.map(([id, texto]) => `<a href="#${id}" data-pagina="${id}">${texto}</a>`).join("")}
    </nav>
  </div>
</header>
<main class="pagina">
  <section class="vista" id="menu" data-vista aria-labelledby="h-menu">
    <header class="cab">
      <span class="etq"><span id="etq-semana">Semana ${esc(menu.semana)} · ${rangoSemana(inicio)}</span> · generado el ${esc(fecha)}</span>
      <h1 id="h-menu">Menú</h1>
      <details class="como-se-lee"><summary>Cómo se lee el menú</summary>
        <p class="sub">Cada plato enlaza a su receta. Las etiquetas son quién lo come y «rac.» cuántas raciones preparar (1 ración = lo que come un adulto de 2.000 kcal al día; se suman las de cada comensal). En naranja, cuándo se prepara si no se cocina en el momento. Lo cocinado se marca en su receta, con «Cocinado». Si no se apunta nada, se da por hecho que cada uno comió lo previsto. Para cambiar una comida de día, arrástrala sobre otro día (en el móvil, mantén pulsada la casilla y arrastra): se intercambian las dos y antes de aplicarlo se avisa de lo que afecta. Con «Anotaciones» apuntas quién comió otra cosa o no come (sus raciones se descuentan de lo que se cocina y de la compra); puede haber varias en la misma comida. Se ven los días desde hoy hasta el domingo de la próxima semana; el marco de cada columna dice a qué semana pertenece. Los días que ya han pasado no se muestran. Los desayunos fijos y el batch del domingo están en Recetas; el detalle de los cambios de Claude, en Diario.</p>
      </details>
      <p class="nota aviso-borde" id="aviso-semanas" hidden></p>
      <div class="barra-acciones"><button type="button" class="btn-principal btn-actualizar">Actualizar menú</button><a href="#diario" class="enlace-diario">Ver el diario</a></div>
    </header>
    <p class="leyenda-semanas" id="leyenda-semanas"><span class="muestra sem-en-curso"></span> Semana en curso <span class="muestra sem-proxima"></span> Próxima semana</p>
    ${seccionMenu(familia, semanas.map(({ dias: d, clave }) => ({ dias: d, clave })))}
    <dl class="resumen" aria-label="Resumen de la semana en curso">
        <div><dt>Platos cocinados</dt><dd id="resumen-cocinados">0</dd></div>
        <div><dt>Tuppers</dt><dd>${tuppersSemana}</dd></div>
        <div><dt>Recetas</dt><dd>${recetasUsadas}</dd></div>
        <div><dt>Productos a comprar</dt><dd id="resumen-compra">—</dd></div>
      </dl>
  </section>

  <section class="vista" id="diario" data-vista aria-labelledby="h-diario" hidden>
    ${seccionDiario()}
  </section>

  <section class="vista" id="recetas" data-vista aria-labelledby="h-recetas" hidden>
    <header class="cab"><h1 id="h-recetas">Recetas</h1></header>
    ${avisosCocina(familia, [
      { menu, dias, clave: inicio, etiqueta: "semana en curso" },
      ...(menuSiguiente && diasSiguiente ? [{ menu: menuSiguiente, dias: diasSiguiente, clave: inicioSiguiente, etiqueta: "próxima semana" }] : []),
    ])}
    ${seccionRecetas(recetas, semanas, familia)}
  </section>

  <section class="vista" id="compra" data-vista aria-labelledby="h-compra" hidden>
    <header class="cab"><h1 id="h-compra">Lista de la compra</h1>
    <p class="sub">Ingredientes de lo que queda de esta semana (desde hoy) y de toda la próxima, sin contar lo ya cocinado ni lo que sale de las raciones en reserva; cada producto dice si es para esta semana, para la próxima o para las dos (lo que hay en casa se gasta antes en esta semana). Las cantidades van en gramos, redondeadas hacia arriba y descontando lo que hay en la despensa; lo que ya está en casa no aparece. Entre paréntesis, cuántas unidades o ml son aproximadamente. Con «Añadir a la lista» apuntas lo que no está en el menú (pimentón, papel higiénico, lejía…), sin gramos; lo ve toda la familia. Marca lo que llevas en el carro y pulsa «Confirmar compra» (abajo a la derecha): lo del menú se suma a la despensa y lo añadido a mano se quita de la lista.</p></header>
    ${seccionCompra()}
    ${precios && MOSTRAR_COSTES ? seccionCoste(compra, precios) : ""}
  </section>

  <section class="vista" id="despensa" data-vista aria-labelledby="h-despensa" hidden>
    <header class="cab"><h1 id="h-despensa">Despensa</h1>
    <p class="sub">Inventario de lo que hay en casa. Se guarda en esta página y lo ve quien tenga acceso a ella.</p></header>
    ${seccionDespensa(recetas)}
  </section>

  <section class="vista" id="tuppers" data-vista aria-labelledby="h-tuppers" hidden>
    <header class="cab"><h1 id="h-tuppers">Tuppers de oficina</h1>
    <p class="sub">Rotación de dos semanas. La semana ${esc(menu.semana)} es la que está en el menú. Los tuppers de CCT salen del batch del domingo o de una ración extra de la cena anterior, y ese mismo plato sirve de comida a RFC y AFC.</p></header>
    ${seccionTuppers(propuesta, familia)}
  </section>

  <section class="vista" id="normas" data-vista aria-labelledby="h-normas" hidden>
    ${seccionNormas(familia)}
  </section>

  <section class="vista" id="definiciones" data-vista aria-labelledby="h-def" hidden>
    ${seccionDefiniciones()}
  </section>

  <section class="vista" id="configuracion" data-vista aria-labelledby="h-config" hidden>
    <header class="cab"><h1 id="h-config">Configuración</h1>
    <p class="sub">Lo que el agente tiene en cuenta para planificar: el grupo familiar y la ficha de cada persona.</p></header>
    ${seccionConfiguracion(familia, recetas)}
  </section>

  <p class="pie">Cálculos orientativos (Mifflin-St Jeor en adultos, Schofield en menores, deporte por MET). No sustituyen el consejo de un profesional sanitario. Los objetivos de peso solo se aplican cuando se acuerdan.</p>
</main>
${DIALOGOS}
<script type="application/json" id="datos-pagina">${JSON.stringify(datosCliente).replace(/</g, "\\u003c")}</script>
<script>${SCRIPT_CLIENTE}</script>
`, familia);
}

async function main() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const leer = async <T>(f: string) => JSON.parse(await readFile(path.join(raiz, "data", f), "utf8")) as T;
  const rotada = await new Almacen(path.join(raiz, "data")).rotarSemanas();
  if (rotada) console.log(`Empieza la semana ${rotada.semana} (${rotada.inicio}): pasa a ser la semana en curso. Falta preparar la semana siguiente.`);
  const html = generarHtml({
    familia: await leer<Familia>("familia.json"),
    propuesta: await leer<PropuestaTuppers>("propuesta-tuppers.json"),
    menu: await leer<MenuSemana>("menu-semana.json"),
    menuSiguiente: await leer<MenuSemana>("menu-siguiente.json").catch(() => undefined),
    recetas: (await leer<{ recetas: Receta[] }>("recetas.json")).recetas,
    despensa: await leer<Despensa>("despensa.json"),
    precios: await leer<TablaPrecios>("precios.json").catch(() => undefined),
    fecha: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
  });
  const destino = path.join(raiz, "salidas", "resultados.html");
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, html);
  console.log(`Vista web generada en ${destino}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
