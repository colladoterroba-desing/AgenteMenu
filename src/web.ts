import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calcularNecesidades,
  kcalDeporteDiarias,
  PARTE_DESAYUNO_PARA_ALMUERZO,
  REPARTO_FIN_DE_SEMANA,
  REPARTO_LABORABLE,
  tasaMetabolicaBasal,
} from "./nutricion.js";
import { componerMenu, listaCompra, menuVisible, SECCIONES, type DiaDelMenu, type LineaCompra, type MenuSemana, type Racion, type Receta, type Seccion } from "./menu.js";
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

export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const num = (n: number, decimales = 0) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const DEPORTE: Record<string, string> = {
  running: "Running",
  yoga_funcional: "Yoga funcional",
  natacion: "Natación",
  futbol_entrenamiento: "Fútbol (entreno)",
  futbol_partido: "Fútbol (partido)",
  educacion_fisica: "Educación física",
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

function escalaImc(imc: number): string {
  return `<div class="imc" aria-label="IMC ${num(imc, 1)} en una escala de ${IMC_MIN} a ${IMC_MAX}">
    <div class="imc-bandas">
      <span style="width:${posImc(18.5)}%" class="b-bajo"></span>
      <span style="width:${posImc(25) - posImc(18.5)}%" class="b-normal"></span>
      <span style="width:${posImc(30) - posImc(25)}%" class="b-sobre"></span>
      <span style="width:${100 - posImc(30)}%" class="b-obes"></span>
    </div>
    <span class="imc-marca" style="left:${posImc(imc)}%"></span>
    <div class="imc-ejes mono"><span style="left:${posImc(18.5)}%">18,5</span><span style="left:${posImc(25)}%">25</span><span style="left:${posImc(30)}%">30</span></div>
  </div>`;
}

const categoria = (titulo: string, cuerpo: string, clase = "") =>
  `<section class="categoria ${clase}"><h4>${titulo}</h4>${cuerpo}</section>`;

const pares = (filas: [string, string][]) =>
  `<dl class="pares">${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/** Ficha de configuración de una persona, organizada por categorías. */
function fichaPersona(m: Miembro, familia: Familia, recetas: Map<string, Receta>): string {
  const n = calcularNecesidades(m, familia.objetivos[m.id]);
  const estado = estadoImc(n.clasificacion);
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
      return `<li class="${si ? "si" : fuera ? "tupper-dia" : "no"}" title="${esc(`${NOMBRE_DIA[d]}: ${texto}`)}"><span aria-hidden="true">${d}</span><span class="sr">${esc(`${NOMBRE_DIA[d]}: ${texto}`)}</span></li>`;
    }).join("")}</ol>`;

  return `<div class="ficha">
    <header class="ficha-cab">
      <div>
        <h3>${esc(m.id)}</h3>
        <p class="sub">${m.edad} años · ${m.sexo === "V" ? "varón" : "mujer"}</p>
      </div>
      <span class="chip ${estado.clase}">${estado.texto}</span>
    </header>
    <div class="categorias">
      ${categoria(
        "Datos físicos",
        pares([
          ["Altura", `<span class="mono">${m.alturaCm} cm</span>`],
          ["Peso", `<span class="mono">${m.pesoKg} kg</span>`],
          ["IMC", `<span class="mono">${num(n.imc, 1)}</span>`],
        ]) + (m.edad >= 18 ? escalaImc(n.imc) : `<p class="sub">En menores el IMC se valora con tablas de percentiles.</p>`),
      )}
      ${categoria(
        "Energía y raciones",
        pares([
          ["Metabolismo basal", `<span class="mono">${num(n.tmb)} kcal</span>`],
          ["Gasto diario", `<span class="mono">${num(n.gastoDiario)} kcal</span>`],
          ["Objetivo diario", `<span class="mono">${num(n.kcalObjetivo)} kcal</span>`],
          ["Ración", `<span class="mono">×${num(n.factorRacion, 2)}</span>`],
        ]) + objetivo,
      )}
      ${categoria("Actividad física", `<ul class="lista-deporte">${deportes || "<li>Sin deporte registrado</li>"}</ul>`)}
      ${categoria(
        "Alimentación",
        pares([
          ["Gustos", m.gustos.length ? esc(m.gustos.join(", ")) : `<span class="sub">Sin indicar</span>`],
          ["Alergias", familia.alergias.length ? esc(familia.alergias.join(", ")) : `<span class="sub">No detectadas</span>`],
          [
            "Desayuno",
            recetaDesayuno
              ? `<a href="#r-${esc(recetaDesayuno.id)}">${esc(recetaDesayuno.nombre)}</a>${desayuno?.nota ? `<br><span class="sub">${esc(desayuno.nota)}</span>` : ""}`
              : `<span class="sub">El del menú</span>`,
          ],
          ...(desayuno
            ? ([["Desayuno en el menú", desayuno.mostrarEnMenu ? "Se muestra" : `<span class="sub">No se muestra (sí cuenta en la compra)</span>`]] as [string, string][])
            : []),
          ["Almuerzo", almuerzo ? `Se lo lleva al ${esc(almuerzo.lugar)} · <span class="mono">${almuerzo.dias.join(" ")}</span>` : `<span class="sub">No</span>`],
        ]),
      )}
      ${categoria(
        "Comidas en casa",
        `<div class="en-casa-fila"><span class="etq">Comida</span>${enCasa("comida")}</div>
         <div class="en-casa-fila"><span class="etq">Cena</span>${enCasa("cena")}</div>
         ${tupper ? `<p class="sub">Los días que come fuera se lleva tupper <strong>${esc(tupper.tipo)}</strong> (en color).</p>` : ""}`,
      )}
      ${categoria("En la cocina", `<p>${esc(familia.roles[m.id] ?? "—")}</p>`)}
    </div>
  </div>`;
}

function estadoMenu(familia: Familia, menu: MenuSemana): string {
  const validadores = familia.permisos?.validarMenu ?? [];
  const validado = menu.estado === "validado" && menu.validacion;
  const cambios = (menu.cambios ?? []).slice().reverse();
  return `<div class="estado-menu ${validado ? "validado" : "borrador"}" role="status">
    <p><strong>${validado ? "Menú validado" : "Borrador"}</strong> ${
      validado
        ? `por ${esc(menu.validacion!.por)} el ${esc(menu.validacion!.fecha)}.`
        : `pendiente de que ${esc(validadores.join(" o ") || "alguien con permiso")} lo dé por válido. Hasta entonces no está publicado.`
    }</p>
    ${cambios.length ? `<details><summary>Historial de cambios (${cambios.length})</summary><ul>${cambios
      .map((c) => `<li><span class="mono">${esc(c.fecha)}</span> · <span class="comensal">${esc(c.por)}</span> ${esc(c.descripcion)}</li>`)
      .join("")}</ul></details>` : ""}
  </div>`;
}

function seccionConfiguracion(familia: Familia, recetas: Receta[]): string {
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const filaRegimen = (nombre: string, quien: (d: Dia) => string[]) =>
    `<tr><th scope="row">${nombre}</th>${DIAS_SEMANA.map(
      (d) => `<td>${quien(d).map((id) => `<span class="comensal">${esc(id)}</span>`).join(" ") || `<span class="sub">—</span>`}</td>`,
    ).join("")}</tr>`;
  const tuppers = familia.regimen.tupper ?? {};
  const almuerzos = familia.regimen.almuerzo ?? {};
  const quienTupper = (d: Dia) => Object.entries(tuppers).filter(([, t]) => t.dias.includes(d)).map(([id]) => id);
  const quienAlmuerzo = (d: Dia) => Object.entries(almuerzos).filter(([, a]) => a.dias.includes(d)).map(([id]) => id);

  const grupo = `<div class="grupo">
    <div class="categorias">
      ${categoria(
        "Miembros",
        `<ul class="miembros">${familia.miembros
          .map((m) => `<li><span class="comensal">${esc(m.id)}</span> ${m.edad} años · ${m.sexo === "V" ? "varón" : "mujer"}</li>`)
          .join("")}</ul>`,
      )}
      ${categoria(
        "Normas de la casa",
        pares([
          ["Preferencias", familia.preferencias?.length ? `<ul class="criterios">${familia.preferencias.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<span class="sub">Ninguna</span>`],
          ["Restricciones", familia.restricciones?.length ? `<ul class="criterios">${familia.restricciones.map((r) => `<li>${esc(r.motivo)}</li>`).join("")}</ul>` : `<span class="sub">Ninguna</span>`],
          ["Alergias", familia.alergias.length ? esc(familia.alergias.join(", ")) : `<span class="sub">No detectadas</span>`],
          ["Merienda", esc(familia.regimen.merienda)],
        ]),
      )}
      ${categoria(
        "Permisos",
        pares([
          ["Validar y publicar el menú", (familia.permisos?.validarMenu ?? []).map((id) => `<span class="comensal">${esc(id)}</span>`).join(" ") || `<span class="sub">Nadie</span>`],
          ["Pedir cambios al menú", `<span class="sub">Cualquiera; el menú vuelve a borrador</span>`],
        ]),
      )}
      ${categoria(
        "Quién cocina",
        `<ul class="miembros">${Object.entries(familia.roles)
          .map(([id, rol]) => `<li><span class="comensal">${esc(id)}</span> ${esc(rol)}</li>`)
          .join("")}</ul>`,
      )}
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
          <li>Legumbres 2-4 veces por semana</li><li>Pescado 3-4 veces</li><li>Verdura en comida y cena</li>
          <li>Fruta a diario</li><li>Carne roja, 1-2 veces como máximo</li><li>Ultraprocesados, ocasionales</li>
        </ul>`,
      )}
    </div>
    ${categoria(
      "Régimen de comidas",
      `<div class="scroll"><table class="regimen">
        <thead><tr><th><span class="sr">Comida</span></th>${DIAS_SEMANA.map((d) => `<th>${NOMBRE_DIA[d]}</th>`).join("")}</tr></thead>
        <tbody>
          ${filaRegimen("Almuerzo fuera", quienAlmuerzo)}
          ${filaRegimen("Comida en casa", (d) => familia.regimen.comida[d])}
          ${filaRegimen("Tupper", quienTupper)}
          ${filaRegimen("Cena en casa", (d) => familia.regimen.cena[d])}
        </tbody>
      </table></div>`,
      "ancha",
    )}
    ${graficoEnergia(familia)}
  </div>`;

  return `<div class="pestanas" role="tablist" aria-label="Configuración">
      <button role="tab" id="tab-cfg-grupo" aria-controls="cfg-grupo" aria-selected="true" tabindex="0">Grupo familiar</button>
      ${familia.miembros
        .map((m) => `<button role="tab" id="tab-cfg-${esc(m.id)}" aria-controls="cfg-${esc(m.id)}" aria-selected="false" tabindex="-1">${esc(m.id)}</button>`)
        .join("")}
    </div>
    <div role="tabpanel" id="cfg-grupo" aria-labelledby="tab-cfg-grupo" class="panel-config">${grupo}</div>
    ${familia.miembros
      .map(
        (m) =>
          `<div role="tabpanel" id="cfg-${esc(m.id)}" aria-labelledby="tab-cfg-${esc(m.id)}" class="panel-config" hidden>${fichaPersona(m, familia, porId)}</div>`,
      )
      .join("")}
    <p class="sub">Estos datos salen de <code>data/familia.json</code>. Para cambiarlos, díselo al agente o edita el fichero y vuelve a generar la página.</p>`;
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

function seccionMenu(familia: Familia, dias: DiaDelMenu[], menu: MenuSemana): string {
  const batch = (menu.batch ?? [])
    .map(
      (b) => `<aside class="batch">
        <h3>Batch del ${esc(NOMBRE_DIA[b.dia].toLowerCase())}</h3>
        <ul>${b.tareas.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </aside>`,
    )
    .join("");
  const visibles = menuVisible(familia, dias);
  return `<div class="avisos-menu">${desayunosHabituales(familia, dias)}${batch}</div>
  <div class="scroll semana-scroll"><table class="semana">
    <thead><tr><th scope="col"><span class="sr">Comida</span></th>${visibles
      .map((d) => `<th scope="col">${esc(d.nombre)}</th>`)
      .join("")}</tr></thead>
    <tbody>${COMIDAS.filter(({ tipo }) => visibles.some((d) => d.comidas.some((c) => c.tipo === tipo))).map(
      ({ tipo, nombre }) => `<tr><th scope="row">${nombre}</th>${visibles.map((d) => celdaMenu(d, tipo)).join("")}</tr>`,
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

export const cantidad = (n: number, unidad: string) => {
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
.estado-menu{border-radius:10px;padding:12px 16px;display:grid;gap:6px;border:1px solid}
.estado-menu.borrador{background:var(--aviso-soft);border-color:var(--aviso);color:var(--ink)}
.estado-menu.validado{background:var(--bien-soft);border-color:var(--bien);color:var(--ink)}
.estado-menu.borrador strong{color:var(--aviso)}
.estado-menu.validado strong{color:var(--bien)}
.estado-menu summary{cursor:pointer;font-size:.88rem;font-weight:600}
.estado-menu ul{margin:6px 0 0;padding-left:1.1em;font-size:.88rem;display:grid;gap:4px}
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
.dias-mini li.tupper-dia{background:var(--calor-soft);border-color:var(--calor);color:var(--calor)}
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
  document.querySelectorAll('[role="tablist"]').forEach((lista) => {
    const tabs = [...lista.querySelectorAll('[role="tab"]')];
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
  });

  // Páginas: una vista visible según el #ancla; #r-<id> abre la receta.
  const vistas = [...document.querySelectorAll("[data-vista]")];
  const enlaces = [...document.querySelectorAll("[data-pagina]")];
  const irA = () => {
    let destino = location.hash.slice(1) || "menu";
    let receta = null;
    if (destino.startsWith("r-")) { receta = destino; destino = "recetas"; }
    if (!vistas.some((v) => v.id === destino)) destino = "menu";
    vistas.forEach((v) => (v.hidden = v.id !== destino));
    enlaces.forEach((a) => a.toggleAttribute("aria-current", a.dataset.pagina === destino));
    const el = receta && document.getElementById(receta);
    if (el) el.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
  };
  addEventListener("hashchange", irA);
  irA();

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
  const paginas = [
    ["menu", "Menú"],
    ["recetas", "Recetas"],
    ["compra", "Compra"],
    ["tuppers", "Tuppers"],
    ["configuracion", "Configuración"],
  ];

  return `<title>Menú ${esc(familia.nombre)}</title>
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
      <span class="etq">Semana ${esc(menu.semana)} · generado el ${esc(fecha)}</span>
      <h1 id="h-menu">Menú de la semana</h1>
      <p class="sub">Cada plato enlaza a su receta. Las etiquetas son quién lo come y ×N las raciones totales (1 = adulto de 2.000 kcal). En naranja, cuándo se prepara si no se cocina en el momento.</p>
      <dl class="resumen">
        <div><dt>Comidas planificadas</dt><dd>${comidas.length}</dd></div>
        <div><dt>Tuppers</dt><dd>${tuppersSemana}</dd></div>
        <div><dt>Recetas</dt><dd>${recetasUsadas}</dd></div>
        <div><dt>Productos a comprar</dt><dd>${productos}</dd></div>
      </dl>
    </header>
    ${estadoMenu(familia, menu)}
    ${seccionMenu(familia, dias, menu)}
  </section>

  <section class="vista" id="recetas" data-vista aria-labelledby="h-recetas" hidden>
    <header class="cab"><h1 id="h-recetas">Recetas</h1></header>
    ${seccionRecetas(recetas, dias)}
  </section>

  <section class="vista" id="compra" data-vista aria-labelledby="h-compra" hidden>
    <header class="cab"><h1 id="h-compra">Lista de la compra</h1>
    <p class="sub">Suma de los ingredientes de todo el menú y los tuppers, redondeada hacia arriba${despensa?.productos.length ? " y descontando lo que hay en la despensa" : ""}. Marca lo que ya llevas en el carro.</p></header>
    ${seccionCompra(compra)}
  </section>

  <section class="vista" id="tuppers" data-vista aria-labelledby="h-tuppers" hidden>
    <header class="cab"><h1 id="h-tuppers">Tuppers de oficina</h1>
    <p class="sub">Rotación de dos semanas. La semana ${esc(menu.semana)} es la que está en el menú. Los tuppers de CCT salen del batch del domingo o de una ración extra de la cena anterior, y ese mismo plato sirve de comida a RFC y AFC.</p></header>
    ${seccionTuppers(propuesta, familia)}
  </section>

  <section class="vista" id="configuracion" data-vista aria-labelledby="h-config" hidden>
    <header class="cab"><h1 id="h-config">Configuración</h1>
    <p class="sub">Lo que el agente tiene en cuenta para planificar: el grupo familiar y cada persona.</p></header>
    ${seccionConfiguracion(familia, recetas)}
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
