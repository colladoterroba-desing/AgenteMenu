import { SECCIONES, type LineaCompra, type Seccion } from "./menu.js";

/** Precio de un producto en una tienda, por envase (o por kg/l/ud si se vende a granel). */
export interface Precio {
  /** Nombre del ingrediente tal como aparece en las recetas. */
  producto: string;
  /** Mercadona, BM, Elías... o «Estimado» para la referencia orientativa. */
  tienda: string;
  /** Euros por envase de `cantidad` `unidad`. */
  precio: number;
  cantidad: number;
  unidad: string;
  /** A granel se paga lo que se compra; si no, envases enteros. */
  granel?: boolean;
  fecha: string;
  fuente: "ticket" | "web" | "manual" | "estimado";
  nota?: string;
}

export interface Tienda {
  id: string;
  habitual?: boolean;
  nota?: string;
}

export interface TablaPrecios {
  nota?: string;
  tiendas: Tienda[];
  precios: Precio[];
}

export const ESTIMADO = "Estimado";

export interface CosteEnTienda {
  coste: number;
  envases?: number;
  precio: Precio;
}

export interface LineaCoste {
  nombre: string;
  unidad: string;
  comprar: number;
  seccion: Seccion;
  porTienda: Record<string, CosteEnTienda>;
  /** Tienda real más barata con precio conocido (sin contar la estimación). */
  masBarata?: string;
}

export interface CosteCesta {
  lineas: LineaCoste[];
  /** Por tienda: total con los productos que tienen precio y cuántos faltan. */
  totales: Record<string, { total: number; conPrecio: number; sinPrecio: number }>;
  /** Cada producto en la tienda real más barata; si ninguna tiene precio, la estimación. */
  optimizada: { total: number; porTienda: Record<string, number>; estimados: number };
  productos: number;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Precio más reciente de un producto en una tienda. */
export function buscarPrecio(tabla: TablaPrecios, producto: string, unidad: string, tienda: string): Precio | undefined {
  return tabla.precios
    .filter((p) => p.tienda === tienda && p.unidad === unidad && normalizar(p.producto) === normalizar(producto))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
}

/** Coste de comprar `comprar` unidades con ese precio. */
export function costeCompra(comprar: number, p: Precio): CosteEnTienda {
  if (comprar <= 0) return { coste: 0, envases: 0, precio: p };
  if (p.granel) return { coste: redondear((comprar / p.cantidad) * p.precio), precio: p };
  const envases = Math.ceil(comprar / p.cantidad);
  return { coste: redondear(envases * p.precio), envases, precio: p };
}

/** Coste de la lista de la compra en cada tienda y en la combinación más barata. */
export function costeCesta(lista: Record<Seccion, LineaCompra[]>, tabla: TablaPrecios): CosteCesta {
  const tiendas = [...tabla.tiendas.map((t) => t.id), ESTIMADO];
  const reales = tabla.tiendas.map((t) => t.id);
  const lineas: LineaCoste[] = [];
  for (const seccion of SECCIONES) {
    for (const l of lista[seccion]) {
      if (l.comprar <= 0) continue;
      const porTienda: Record<string, CosteEnTienda> = {};
      for (const t of tiendas) {
        const p = buscarPrecio(tabla, l.nombre, l.unidad, t);
        if (p) porTienda[t] = costeCompra(l.comprar, p);
      }
      const conPrecio = reales.filter((t) => porTienda[t]);
      const masBarata = conPrecio.sort((a, b) => porTienda[a].coste - porTienda[b].coste)[0];
      lineas.push({ nombre: l.nombre, unidad: l.unidad, comprar: l.comprar, seccion, porTienda, masBarata });
    }
  }

  const totales: CosteCesta["totales"] = {};
  for (const t of tiendas) {
    const con = lineas.filter((l) => l.porTienda[t]);
    totales[t] = {
      total: redondear(con.reduce((s, l) => s + l.porTienda[t].coste, 0)),
      conPrecio: con.length,
      sinPrecio: lineas.length - con.length,
    };
  }

  const porTienda: Record<string, number> = {};
  let estimados = 0;
  for (const l of lineas) {
    const donde = l.masBarata ?? (l.porTienda[ESTIMADO] ? ESTIMADO : undefined);
    if (!donde) continue;
    if (donde === ESTIMADO) estimados++;
    porTienda[donde] = redondear((porTienda[donde] ?? 0) + l.porTienda[donde].coste);
  }
  const total = redondear(Object.values(porTienda).reduce((s, x) => s + x, 0));
  return { lineas, totales, optimizada: { total, porTienda, estimados }, productos: lineas.length };
}
