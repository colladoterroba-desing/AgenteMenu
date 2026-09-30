import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizarCantidad, type MenuSemana, type Receta } from "./menu.js";
import { aGramosObligatorio } from "./unidades.js";
import type { Precio, TablaPrecios } from "./precios.js";
import type { Despensa, Familia, Objetivo, Producto, Sobra, Ticket } from "./tipos.js";

/** Fecha de hoy (AAAA-MM-DD) en hora local. */
export const hoyIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Persistencia en ficheros JSON dentro de un directorio de datos. */
export class Almacen {
  constructor(private readonly dir: string) {}

  private async leer<T>(fichero: string): Promise<T> {
    return JSON.parse(await readFile(path.join(this.dir, fichero), "utf8")) as T;
  }

  private async escribir(fichero: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(path.join(this.dir, fichero)), { recursive: true });
    await writeFile(path.join(this.dir, fichero), JSON.stringify(datos, null, 2) + "\n");
  }

  familia = () => this.leer<Familia>("familia.json");
  despensa = () => this.leer<Despensa>("despensa.json");
  tickets = async () => (await this.leer<{ tickets: Ticket[] }>("tickets.json")).tickets;
  recetas = async () => (await this.leer<{ recetas: Receta[] }>("recetas.json")).recetas;
  precios = () => this.leer<TablaPrecios>("precios.json");

  /** Añade un precio (se usa siempre el más reciente de cada producto y tienda). */
  async registrarPrecio(precio: Precio): Promise<number> {
    const tabla = await this.precios();
    if (!tabla.tiendas.some((t) => t.id === precio.tienda)) {
      tabla.tiendas.push({ id: precio.tienda });
    }
    // Los precios se guardan por envase en gramos cuando se puede (p. ej. 12 ud de huevos → 720 g).
    tabla.precios.push({ ...precio, ...normalizarCantidad(precio.producto, precio.cantidad, precio.unidad) });
    await this.escribir("precios.json", tabla);
    return tabla.precios.length;
  }
  /** Menú de esta semana o, con `siguiente`, la propuesta de la semana que viene. */
  menu = (siguiente = false) => this.leer<MenuSemana>(siguiente ? "menu-siguiente.json" : "menu-semana.json");

  async guardarMenu(menu: MenuSemana, siguiente = false): Promise<void> {
    await this.escribir(siguiente ? "menu-siguiente.json" : "menu-semana.json", menu);
  }

  /**
   * Rotación de semanas: cuando llega el lunes de la semana siguiente, su menú pasa a ser
   * el de la semana en curso (menu-semana.json), el anterior se guarda en data/historial/
   * y falta preparar la nueva semana siguiente. Devuelve la semana que pasa a estar en curso.
   */
  async rotarSemanas(hoy: string = hoyIso()): Promise<MenuSemana | null> {
    const siguiente = await this.menu(true).catch(() => undefined);
    if (!siguiente?.inicio || hoy < siguiente.inicio) return null;
    const actual = await this.menu().catch(() => undefined);
    if (actual) await this.escribir(`historial/menu-${actual.inicio ?? actual.semana}.json`, actual);
    await this.escribir("menu-semana.json", siguiente);
    await rm(path.join(this.dir, "menu-siguiente.json"), { force: true });
    return siguiente;
  }

  /** Añade la receta o sustituye la que tenga el mismo id. */
  async guardarReceta(receta: Receta): Promise<void> {
    const recetas = (await this.recetas()).filter((r) => r.id !== receta.id);
    // Todas las cantidades de las recetas van en gramos (data/equivalencias.json).
    recetas.push({
      ...receta,
      ingredientes: receta.ingredientes.map((i) => ({ ...i, cantidad: aGramosObligatorio(i.nombre, i.cantidad, i.unidad), unidad: "g" })),
    });
    await this.escribir("recetas.json", { recetas });
  }

  async guardarObjetivo(id: string, objetivo: Objetivo): Promise<void> {
    const familia = await this.familia();
    if (!familia.miembros.some((m) => m.id === id)) throw new Error(`No existe el miembro ${id}`);
    familia.objetivos[id] = objetivo;
    await this.escribir("familia.json", familia);
  }

  /** Cambia el desayuno habitual de un miembro (receta, nota o si se muestra en el menú). */
  async configurarDesayuno(
    id: string,
    cambios: { receta?: string; nota?: string; mostrarEnMenu?: boolean },
  ): Promise<void> {
    const familia = await this.familia();
    if (!familia.miembros.some((m) => m.id === id)) throw new Error(`No existe el miembro ${id}`);
    const actual = familia.desayunos?.[id];
    if (!actual && !cambios.receta) throw new Error(`${id} no tiene desayuno habitual: indica la receta`);
    familia.desayunos = { ...familia.desayunos, [id]: { ...actual!, ...cambios } };
    await this.escribir("familia.json", familia);
  }

  /** Marca (o desmarca) un plato como no deseado por un miembro o por la familia. */
  async marcarNoDeseado(nd: { receta: string; por: string; motivo: string; fecha: string }, quitar = false): Promise<void> {
    const familia = await this.familia();
    const resto = (familia.noDeseados ?? []).filter((x) => !(x.receta === nd.receta && x.por === nd.por));
    familia.noDeseados = quitar ? resto : [...resto, nd];
    await this.escribir("familia.json", familia);
  }

  /** Sustituye el inventario de productos (p. ej. al sincronizarlo desde la web). */
  async guardarProductos(productos: Producto[]): Promise<Despensa> {
    const despensa = await this.despensa();
    despensa.productos = productos.filter((p) => p.cantidad > 0).map((p) => ({ ...p, ...normalizarCantidad(p.nombre, p.cantidad, p.unidad) }));
    await this.escribir("despensa.json", despensa);
    return despensa;
  }

  /** Suma cantidades (negativas para consumir); elimina productos que llegan a 0. */
  async ajustarProductos(cambios: Producto[]): Promise<Despensa> {
    const despensa = await this.despensa();
    for (const original of cambios) {
      const cambio = { ...original, ...normalizarCantidad(original.nombre, original.cantidad, original.unidad) };
      const clave = cambio.nombre.trim().toLowerCase();
      const existente = despensa.productos.find(
        (p) => p.nombre.toLowerCase() === clave && p.unidad === cambio.unidad,
      );
      if (existente) {
        existente.cantidad += cambio.cantidad;
        if (cambio.caducidad) existente.caducidad = cambio.caducidad;
        if (cambio.categoria) existente.categoria = cambio.categoria;
      } else if (cambio.cantidad > 0) {
        despensa.productos.push({ ...cambio, nombre: cambio.nombre.trim() });
      }
    }
    despensa.productos = despensa.productos.filter((p) => p.cantidad > 0);
    await this.escribir("despensa.json", despensa);
    return despensa;
  }

  async registrarSobra(sobra: Sobra): Promise<Despensa> {
    const despensa = await this.despensa();
    despensa.sobras.push(sobra);
    await this.escribir("despensa.json", despensa);
    return despensa;
  }

  /** Gasta raciones de una sobra; sin `raciones`, o si se acaban, la quita. */
  async consumirSobra(indice: number, raciones?: number): Promise<Despensa> {
    const despensa = await this.despensa();
    const sobra = despensa.sobras[indice];
    if (!sobra) throw new Error(`No existe la sobra ${indice}`);
    const quedan = raciones === undefined ? 0 : Math.round((sobra.raciones - raciones) * 100) / 100;
    if (quedan > 0) sobra.raciones = quedan;
    else despensa.sobras.splice(indice, 1);
    await this.escribir("despensa.json", despensa);
    return despensa;
  }

  async registrarTicket(ticket: Ticket): Promise<number> {
    const tickets = await this.tickets();
    tickets.push(ticket);
    await this.escribir("tickets.json", { tickets });
    return tickets.length;
  }

  /** Guarda un documento Markdown en salidas/. El nombre no puede contener rutas. */
  async guardarDocumento(nombre: string, contenido: string): Promise<string> {
    if (!/^[\w-]+\.md$/.test(nombre)) throw new Error(`Nombre de fichero no válido: ${nombre}`);
    const destino = path.resolve(this.dir, "..", "salidas", nombre);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
    return destino;
  }
}

export interface ResumenHabitos {
  numeroTickets: number;
  gastoTotal: number;
  gastoMedioPorTicket: number;
  gastoPorCategoria: Record<string, number>;
  productosMasComprados: { producto: string; veces: number; gastoTotal: number }[];
}

/** Agregados de los tickets para detectar hábitos de consumo. */
export function resumirHabitos(tickets: Ticket[], top = 15): ResumenHabitos {
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const gastoTotal = tickets.reduce((s, t) => s + t.total, 0);
  const porCategoria: Record<string, number> = {};
  const porProducto = new Map<string, { producto: string; veces: number; gastoTotal: number }>();

  for (const linea of tickets.flatMap((t) => t.lineas)) {
    const categoria = linea.categoria ?? "sin categoría";
    porCategoria[categoria] = redondear((porCategoria[categoria] ?? 0) + linea.precio);
    const clave = linea.producto.toLowerCase();
    const acumulado = porProducto.get(clave) ?? { producto: linea.producto, veces: 0, gastoTotal: 0 };
    acumulado.veces += 1;
    acumulado.gastoTotal = redondear(acumulado.gastoTotal + linea.precio);
    porProducto.set(clave, acumulado);
  }

  return {
    numeroTickets: tickets.length,
    gastoTotal: redondear(gastoTotal),
    gastoMedioPorTicket: tickets.length ? redondear(gastoTotal / tickets.length) : 0,
    gastoPorCategoria: porCategoria,
    productosMasComprados: [...porProducto.values()]
      .sort((a, b) => b.veces - a.veces || b.gastoTotal - a.gastoTotal)
      .slice(0, top),
  };
}
