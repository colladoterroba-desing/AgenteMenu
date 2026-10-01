// Lleva al proyecto lo que se apunta en la web (base de datos de la página publicada en claude.ai).
// Claude Code solo copia las colecciones a salidas/web-export/<colección>/<id>.json (ArtifactData
// con out_dir); este programa las une con data/ sin IA. Ver .claude/skills/sincronizar/SKILL.md.
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarCantidad, type MenuSemana, type PlatoMenu } from "./menu.js";
import type { TipoComida } from "./planificacion.js";
import { DIAS, type Actividad, type Dia, type Despensa, type Familia, type Objetivo, type Producto, type Sobra } from "./tipos.js";
import { claveProducto } from "./web.js";

export const COLECCIONES = [
  "despensa", "no-deseados", "hechas", "diario", "cambios", "cocinado", "comentarios", "eventos", "perfil", "comido",
] as const;
export type Coleccion = (typeof COLECCIONES)[number];
export type Exportado = Record<Coleccion, Record<string, Record<string, unknown>>>;

/** Lee salidas/web-export: una carpeta por colección y un JSON por documento. Sin carpeta, la colección está vacía. */
export async function leerExportado(dir: string): Promise<Exportado> {
  const out = {} as Exportado;
  for (const col of COLECCIONES) {
    out[col] = {};
    const ficheros = await readdir(path.join(dir, col)).catch(() => [] as string[]);
    for (const f of ficheros.filter((f) => f.endsWith(".json")).sort()) {
      // ArtifactData escribe «~» como «@» en el nombre del fichero (las ids de la web no usan «@»).
      out[col][f.slice(0, -".json".length).replace(/@/g, "~")] = JSON.parse(await readFile(path.join(dir, col, f), "utf8"));
    }
  }
  return out;
}

const dias = (v: unknown): Dia[] => (Array.isArray(v) ? DIAS.filter((d) => v.includes(d)) : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * Une lo apuntado en la web con los datos del proyecto. La web manda: es lo que la familia ve y apunta.
 * - despensa → productos (por nombre y unidad; lo que queda a 0 se quita).
 * - hechas → reservas de raciones (sobras), con el mismo id que en la web para que no salgan dos veces.
 * - no-deseados → familia.noDeseados (los quitados se borran).
 * - perfil → peso, gustos y objetivo de cada persona. El desayuno en texto libre no se toca: se avisa para que
 *   Claude lo pase a receta (familia.desayunos[id].desdeTexto guarda de qué texto sale, para no avisar otra vez).
 *   También el deporte (actividades), el papel en la cocina (roles) y las comidas en casa (régimen: comida, cena,
 *   tupper y almuerzo de esa persona).
 */
export function unir(familia: Familia, despensa: Despensa, web: Exportado, recetas: Record<string, string>) {
  const productos = new Map<string, Producto>();
  for (const p of despensa.productos) {
    const c = normalizarCantidad(p.nombre, p.cantidad, p.unidad);
    productos.set(claveProducto(p.nombre, c.unidad), { ...p, ...c });
  }
  for (const [clave, d] of Object.entries(web.despensa)) {
    const nombre = texto(d.nombre);
    if (!nombre) continue;
    const previo = productos.get(clave);
    productos.set(clave, {
      ...previo,
      nombre,
      cantidad: Math.max(0, num(d.cantidad)),
      unidad: texto(d.unidad) ?? "g",
      ...(texto(d.caducidad) ? { caducidad: texto(d.caducidad) } : {}),
      ...(texto(d.nota) ? { nota: texto(d.nota) } : {}),
    });
  }

  const sobras = new Map<string, Sobra>(despensa.sobras.map((s, i) => [s.id ?? `repo-${i}`, { ...s, id: s.id ?? `repo-${i}` }]));
  for (const [id, d] of Object.entries(web.hechas)) {
    const receta = texto(d.receta);
    const donde = d.donde === "congelador" ? "congelador" : "nevera";
    sobras.set(id, {
      id,
      descripcion: texto(d.descripcion) ?? (receta ? recetas[receta] ?? receta : "Raciones"),
      raciones: num(d.reserva),
      fecha: texto(d.fecha) ?? "",
      ...(texto(d.caduca) ? { consumirAntesDe: texto(d.caduca) } : {}),
      ...(receta ? { receta } : {}),
      ubicacion: donde,
      ...(d.hechas !== undefined ? { hechas: num(d.hechas) } : {}),
    });
  }

  const noDeseados = new Map((familia.noDeseados ?? []).map((n) => [`${n.receta}__${n.por}`, n]));
  for (const [k, d] of Object.entries(web["no-deseados"])) {
    if (d.quitado) noDeseados.delete(k);
    else if (texto(d.receta) && texto(d.por)) {
      noDeseados.set(k, { receta: texto(d.receta)!, por: texto(d.por)!, motivo: texto(d.motivo) ?? "", fecha: texto(d.fecha) ?? "" });
    }
  }

  const avisos: string[] = [];
  const miembros = familia.miembros.map((m) => {
    const d = web.perfil[m.id];
    if (!d) return m;
    const cambiado = { ...m };
    if (num(d.pesoKg) > 0) cambiado.pesoKg = Math.round(num(d.pesoKg) * 10) / 10;
    if (Array.isArray(d.gustos)) cambiado.gustos = d.gustos.filter((g): g is string => typeof g === "string");
    if (Array.isArray(d.actividades)) {
      cambiado.actividades = d.actividades
        .map((a: Record<string, unknown>): Actividad => ({ deporte: texto(a?.deporte) ?? "", dias: dias(a?.dias), minutos: Math.round(num(a?.minutos)) }))
        .filter((a) => a.deporte && a.dias.length && a.minutos > 0);
    }
    const desayuno = d.desayuno as { texto?: string } | undefined;
    if (desayuno?.texto && desayuno.texto !== familia.desayunos?.[m.id]?.desdeTexto) {
      avisos.push(`Desayuno nuevo de ${m.id} (${m.alias ?? m.id}) en texto libre: «${desayuno.texto}». Falta pasarlo a receta (OI-41).`);
    }
    return cambiado;
  });
  // Comidas en casa y papel en la cocina: la web guarda lo de cada persona; aquí se rehace el régimen de la familia.
  const regimen = structuredClone(familia.regimen);
  const roles = { ...familia.roles };
  for (const m of familia.miembros) {
    const d = web.perfil[m.id];
    if (!d) continue;
    if (typeof d.rol === "string") roles[m.id] = d.rol.trim();
    const r = d.regimen as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") continue;
    for (const tipo of ["comida", "cena"] as const) {
      const si = dias(r[tipo]);
      for (const dia of DIAS) {
        const quien = regimen[tipo][dia].filter((x) => x !== m.id);
        regimen[tipo][dia] = si.includes(dia) ? familia.miembros.map((x) => x.id).filter((x) => x === m.id || quien.includes(x)) : quien;
      }
    }
    const t = r.tupper as Record<string, unknown> | null, a = r.almuerzo as Record<string, unknown> | null;
    const tupper = { ...regimen.tupper }, almuerzo = { ...regimen.almuerzo };
    delete tupper[m.id]; delete almuerzo[m.id];
    if (t && dias(t.dias).length) tupper[m.id] = { dias: dias(t.dias), tipo: t.tipo === "para recalentar" ? "para recalentar" : "frío" };
    if (a && dias(a.dias).length) almuerzo[m.id] = { dias: dias(a.dias), lugar: texto(a.lugar) ?? "colegio" };
    regimen.tupper = tupper; regimen.almuerzo = almuerzo;
  }
  const objetivos = { ...familia.objetivos };
  for (const [id, d] of Object.entries(web.perfil)) {
    if (d.objetivo && typeof d.objetivo === "object" && familia.miembros.some((m) => m.id === id)) objetivos[id] = d.objetivo as Objetivo;
  }

  return {
    familia: { ...familia, miembros, objetivos, regimen, roles, noDeseados: [...noDeseados.values()] },
    despensa: {
      ...despensa,
      productos: [...productos.values()].filter((p) => p.cantidad > 0),
      sobras: [...sobras.values()].filter((s) => s.raciones > 0),
    },
    avisos,
  };
}

/**
 * Pasa al menú los cambios de «Actualizar menú» de esa semana (casillas «<lunes>-<día 0-6>-<comida>»).
 * El plato guarda el que había antes (`cambio.antes`) para que la web lo siga mostrando tachado y se pueda
 * volver a él; un cambio deshecho en la web (`quitado`) devuelve el plato previsto.
 */
export function aplicarCambios(menu: MenuSemana, cambios: Record<string, Record<string, unknown>>, recetas: Record<string, string>) {
  const avisos: string[] = [];
  let aplicados = 0;
  if (!menu.inicio) return { menu, aplicados, avisos };
  const dias = structuredClone(menu.dias);
  for (const d of Object.values(cambios)) {
    const celda = texto(d.celda);
    const m = celda?.match(/^(\d{4}-\d{2}-\d{2})-(\d)-(\w+)$/);
    if (!m || m[1] !== menu.inicio) continue;
    const dia = DIAS[Number(m[2])], tipo = m[3] as TipoComida;
    const plato = dias[dia]?.[tipo];
    if (!dia || !plato) { avisos.push(`El cambio de ${celda} no corresponde a ninguna comida del menú.`); continue; }
    const previsto: PlatoMenu = plato.cambio?.antes ?? plato;
    if (d.quitado) {
      if (plato.cambio) { dias[dia]![tipo] = previsto; aplicados++; }
      continue;
    }
    const ids = Array.isArray(d.recetas) ? d.recetas.filter((r): r is string => typeof r === "string") : [];
    if (!ids.length || ids.length > 2 || !ids.every((r) => recetas[r])) { avisos.push(`El cambio de ${celda} tiene recetas que no existen.`); continue; }
    const comensales = Array.isArray(d.comensales) ? d.comensales.filter((q): q is string => typeof q === "string") : [];
    dias[dia]![tipo] = {
      receta: ids[0],
      ...(ids[1] ? { segundo: ids[1] } : {}),
      ...(previsto.variantes ? { variantes: previsto.variantes } : {}),
      ...(comensales.length ? { comensales } : {}),
      cambio: { antes: previsto, motivo: texto(d.motivo) ?? "", fecha: texto(d.fecha)?.slice(0, 10) ?? "" },
    };
    aplicados++;
  }
  return { menu: { ...menu, dias }, aplicados, avisos };
}

async function main() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const datos = path.join(raiz, "data");
  const origen = path.join(raiz, "salidas", "web-export");
  const web = await leerExportado(origen);
  if (COLECCIONES.every((c) => Object.keys(web[c]).length === 0)) {
    console.error(`No hay nada en ${origen}. Primero hay que copiar ahí las colecciones de la página (ver .claude/skills/sincronizar/SKILL.md).`);
    process.exit(1);
  }
  const leer = async <T>(f: string) => JSON.parse(await readFile(path.join(datos, f), "utf8")) as T;
  const escribir = (f: string, v: unknown) => writeFile(path.join(datos, f), JSON.stringify(v, null, 2) + "\n");
  const recetas = Object.fromEntries((await leer<{ recetas: { id: string; nombre: string }[] }>("recetas.json")).recetas.map((r) => [r.id, r.nombre]));

  const r = unir(await leer<Familia>("familia.json"), await leer<Despensa>("despensa.json"), web, recetas);
  await escribir("familia.json", r.familia);
  await escribir("despensa.json", r.despensa);
  // Cambios de «Actualizar menú» → menú de esta semana y de la siguiente (así los ven el agente y los PDF).
  for (const f of ["menu-semana.json", "menu-siguiente.json"]) {
    const menu = await leer<MenuSemana>(f).catch(() => undefined);
    if (!menu) continue;
    const c = aplicarCambios(menu, web.cambios, recetas);
    if (c.aplicados) await escribir(f, c.menu);
    r.avisos.push(...c.avisos);
    if (c.aplicados) console.log(`${f}: ${c.aplicados} cambios de «Actualizar menú».`);
  }
  // Copia completa de lo apuntado (diario, anotaciones, cocinado, comentarios...): el agente la lee con ver_apuntes_web.
  await mkdir(path.join(datos, "web"), { recursive: true });
  for (const col of COLECCIONES) await escribir(path.join("web", `${col}.json`), web[col]);
  await rm(origen, { recursive: true, force: true });

  console.log(COLECCIONES.map((c) => `${c}: ${Object.keys(web[c]).length}`).join(" · "));
  console.log(`Despensa: ${r.despensa.productos.length} productos y ${r.despensa.sobras.length} reservas. No deseados: ${r.familia.noDeseados.length}.`);
  for (const a of r.avisos) console.log(`Aviso: ${a}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
