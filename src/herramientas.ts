import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { resumirHabitos, type Almacen } from "./almacen.js";
import { calcularNecesidades, esAdulto } from "./nutricion.js";
import { planificarSemana } from "./planificacion.js";

interface Herramienta<S extends z.ZodObject> {
  nombre: string;
  descripcion: string;
  esquema: S;
  ejecutar: (entrada: z.infer<S>) => Promise<unknown>;
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha AAAA-MM-DD");

const producto = z.object({
  nombre: z.string(),
  cantidad: z.number().describe("Positiva para añadir, negativa para consumir"),
  unidad: z.string().describe("g, kg, ml, l, ud, paquete..."),
  categoria: z.string().optional(),
  caducidad: fecha.optional(),
});

function herramienta<S extends z.ZodObject>(h: Herramienta<S>): Herramienta<S> {
  return h;
}

export function crearHerramientas(almacen: Almacen) {
  const lista = [
    herramienta({
      nombre: "ver_familia",
      descripcion:
        "Devuelve el perfil de la familia: miembros (edad, sexo, altura, peso, gustos, deporte), alergias, régimen de comidas, roles en la cocina y objetivos acordados.",
      esquema: z.object({}),
      ejecutar: () => almacen.familia(),
    }),
    herramienta({
      nombre: "calcular_necesidades",
      descripcion:
        "Calcula IMC, tasa metabólica basal, gasto diario, kcal objetivo y factor de ración de cada miembro. Incluye propuestas de objetivo para adultos con sobrepeso, que deben acordarse con el usuario antes de guardarlas.",
      esquema: z.object({}),
      ejecutar: async () => {
        const familia = await almacen.familia();
        return familia.miembros.map((m) => calcularNecesidades(m, familia.objetivos[m.id]));
      },
    }),
    herramienta({
      nombre: "planificar_comensales",
      descripcion:
        "Rejilla semanal (L-D) con cada comida del día: quién come en casa, kcal por comensal, raciones equivalentes totales, quién come fuera y quién puede cocinar. Úsala como base del menú.",
      esquema: z.object({}),
      ejecutar: async () => planificarSemana(await almacen.familia()),
    }),
    herramienta({
      nombre: "guardar_objetivo",
      descripcion:
        "Guarda un objetivo de peso para un adulto SOLO después de que el usuario lo haya aceptado explícitamente. Nunca para menores de edad.",
      esquema: z.object({
        id: z.string(),
        pesoObjetivoKg: z.number().positive(),
        kcalDiarias: z.number().int().positive(),
        semanas: z.number().int().positive(),
        fechaInicio: fecha,
        notas: z.string().optional(),
      }),
      ejecutar: async ({ id, ...objetivo }) => {
        const miembro = (await almacen.familia()).miembros.find((m) => m.id === id);
        if (!miembro) throw new Error(`No existe el miembro ${id}`);
        if (!esAdulto(miembro)) throw new Error("No se guardan objetivos de peso para menores de edad");
        await almacen.guardarObjetivo(id, objetivo);
        return { guardado: true, id, ...objetivo };
      },
    }),
    herramienta({
      nombre: "ver_despensa",
      descripcion: "Productos disponibles en casa (con caducidad si se conoce) y sobras de raciones ya cocinadas.",
      esquema: z.object({}),
      ejecutar: () => almacen.despensa(),
    }),
    herramienta({
      nombre: "actualizar_despensa",
      descripcion:
        "Añade (cantidad positiva) o consume (cantidad negativa) productos de la despensa. Los productos que llegan a 0 desaparecen.",
      esquema: z.object({ cambios: z.array(producto).min(1) }),
      ejecutar: ({ cambios }) => almacen.ajustarProductos(cambios),
    }),
    herramienta({
      nombre: "registrar_sobra",
      descripcion: "Registra raciones cocinadas que han sobrado para reaprovecharlas en el menú.",
      esquema: z.object({
        descripcion: z.string(),
        raciones: z.number().positive(),
        fecha,
        consumirAntesDe: fecha.optional(),
      }),
      ejecutar: (sobra) => almacen.registrarSobra(sobra),
    }),
    herramienta({
      nombre: "consumir_sobra",
      descripcion: "Elimina una sobra ya aprovechada, por su índice en la lista de sobras de ver_despensa.",
      esquema: z.object({ indice: z.number().int().min(0) }),
      ejecutar: ({ indice }) => almacen.consumirSobra(indice),
    }),
    herramienta({
      nombre: "registrar_ticket",
      descripcion:
        "Guarda un ticket de compra (transcrito de una foto o de texto) para aprender los hábitos de consumo. Asigna una categoría a cada línea (fruta, verdura, carne, pescado, lácteos, legumbres, cereales, bebidas, limpieza, snacks, otros...).",
      esquema: z.object({
        fecha,
        tienda: z.string(),
        total: z.number(),
        lineas: z
          .array(
            z.object({
              producto: z.string(),
              cantidad: z.number(),
              unidad: z.string(),
              precio: z.number().describe("Importe total de la línea en euros"),
              categoria: z.string(),
            }),
          )
          .min(1),
      }),
      ejecutar: async (ticket) => ({ registrado: true, totalTickets: await almacen.registrarTicket(ticket) }),
    }),
    herramienta({
      nombre: "resumen_habitos",
      descripcion: "Gasto total, gasto por categoría y productos más comprados según los tickets registrados.",
      esquema: z.object({}),
      ejecutar: async () => resumirHabitos(await almacen.tickets()),
    }),
    herramienta({
      nombre: "guardar_documento",
      descripcion:
        "Guarda un documento Markdown en la carpeta salidas/ (menú semanal, lista de la compra, plan de cocina...). El nombre es solo el fichero, p. ej. menu-2026-S40.md.",
      esquema: z.object({
        nombre: z.string().regex(/^[\w-]+\.md$/),
        contenido: z.string(),
      }),
      ejecutar: async ({ nombre, contenido }) => ({ ruta: await almacen.guardarDocumento(nombre, contenido) }),
    }),
  ];

  const porNombre = new Map<string, Herramienta<z.ZodObject>>(
    lista.map((h) => [h.nombre, h as unknown as Herramienta<z.ZodObject>]),
  );

  const definiciones: Anthropic.Beta.BetaTool[] = lista.map((h) => {
    const { $schema: _, ...schema } = z.toJSONSchema(h.esquema) as Record<string, unknown>;
    return {
      name: h.nombre,
      description: h.descripcion,
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });

  /** Valida la entrada contra el esquema antes de ejecutar; devuelve texto para el tool_result. */
  async function ejecutar(nombre: string, entrada: unknown): Promise<{ contenido: string; error: boolean }> {
    const h = porNombre.get(nombre);
    if (!h) return { contenido: `Herramienta desconocida: ${nombre}`, error: true };
    const validada = h.esquema.safeParse(entrada);
    if (!validada.success) {
      return { contenido: `Entrada no válida: ${z.prettifyError(validada.error)}`, error: true };
    }
    try {
      return { contenido: JSON.stringify(await h.ejecutar(validada.data)), error: false };
    } catch (e) {
      return { contenido: e instanceof Error ? e.message : String(e), error: true };
    }
  }

  return { definiciones, ejecutar };
}
