import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Despensa, Familia, Objetivo, Producto, Sobra, Ticket } from "./tipos.js";

/** Persistencia en ficheros JSON dentro de un directorio de datos. */
export class Almacen {
  constructor(private readonly dir: string) {}

  private async leer<T>(fichero: string): Promise<T> {
    return JSON.parse(await readFile(path.join(this.dir, fichero), "utf8")) as T;
  }

  private async escribir(fichero: string, datos: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, fichero), JSON.stringify(datos, null, 2) + "\n");
  }

  familia = () => this.leer<Familia>("familia.json");
  despensa = () => this.leer<Despensa>("despensa.json");
  tickets = async () => (await this.leer<{ tickets: Ticket[] }>("tickets.json")).tickets;

  async guardarObjetivo(id: string, objetivo: Objetivo): Promise<void> {
    const familia = await this.familia();
    if (!familia.miembros.some((m) => m.id === id)) throw new Error(`No existe el miembro ${id}`);
    familia.objetivos[id] = objetivo;
    await this.escribir("familia.json", familia);
  }

  /** Suma cantidades (negativas para consumir); elimina productos que llegan a 0. */
  async ajustarProductos(cambios: Producto[]): Promise<Despensa> {
    const despensa = await this.despensa();
    for (const cambio of cambios) {
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

  async consumirSobra(indice: number): Promise<Despensa> {
    const despensa = await this.despensa();
    if (!despensa.sobras[indice]) throw new Error(`No existe la sobra ${indice}`);
    despensa.sobras.splice(indice, 1);
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
