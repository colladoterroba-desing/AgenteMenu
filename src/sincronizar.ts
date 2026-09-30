// Lleva al proyecto lo que se apunta en la web (base de datos de la página publicada en claude.ai).
// Claude Code solo copia las colecciones a salidas/web-export/<colección>/<id>.json (ArtifactData
// con out_dir); este programa las une con data/ sin IA. Ver .claude/skills/sincronizar/SKILL.md.
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarCantidad } from "./menu.js";
import type { Despensa, Familia, Objetivo, Producto, Sobra } from "./tipos.js";
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

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * Une lo apuntado en la web con los datos del proyecto. La web manda: es lo que la familia ve y apunta.
 * - despensa → productos (por nombre y unidad; lo que queda a 0 se quita).
 * - hechas → reservas de raciones (sobras), con el mismo id que en la web para que no salgan dos veces.
 * - no-deseados → familia.noDeseados (los quitados se borran).
 * - perfil → peso, gustos y objetivo de cada persona. El desayuno en texto libre no se toca: falta pasarlo a receta.
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
    const desayuno = d.desayuno as { texto?: string } | undefined;
    if (desayuno?.texto) avisos.push(`${m.alias ?? m.id} tiene un desayuno nuevo en texto libre («${desayuno.texto}»): falta pasarlo a receta (OI-41).`);
    return cambiado;
  });
  const objetivos = { ...familia.objetivos };
  for (const [id, d] of Object.entries(web.perfil)) {
    if (d.objetivo && typeof d.objetivo === "object" && familia.miembros.some((m) => m.id === id)) objetivos[id] = d.objetivo as Objetivo;
  }

  return {
    familia: { ...familia, miembros, objetivos, noDeseados: [...noDeseados.values()] },
    despensa: {
      ...despensa,
      productos: [...productos.values()].filter((p) => p.cantidad > 0),
      sobras: [...sobras.values()].filter((s) => s.raciones > 0),
    },
    avisos,
  };
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
  // Copia completa de lo apuntado (diario, anotaciones, cocinado, comentarios...): el agente la lee con ver_apuntes_web.
  await mkdir(path.join(datos, "web"), { recursive: true });
  for (const col of COLECCIONES) await escribir(path.join("web", `${col}.json`), web[col]);
  await rm(origen, { recursive: true, force: true });

  console.log(COLECCIONES.map((c) => `${c}: ${Object.keys(web[c]).length}`).join(" · "));
  console.log(`Despensa: ${r.despensa.productos.length} productos y ${r.despensa.sobras.length} reservas. No deseados: ${r.familia.noDeseados.length}.`);
  for (const a of r.avisos) console.log(`Aviso: ${a}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
