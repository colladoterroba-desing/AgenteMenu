# Agente Planificador de Menú Familiar

**AgenteMenu** es un agente de menú familiar: un asistente inteligente, basado en Claude, que ayuda a planificar las comidas de la familia de forma sencilla, variada y equilibrada.

## ¿Qué hace?

- ⚖️ **Calcula las raciones de cada miembro** a partir de su edad, altura, peso y deporte. Si un adulto tiene sobrepeso, propone un objetivo y un plazo que acuerda contigo.
- 🍽️ **Genera el menú semanal**: desayuno, comida, merienda (L-V) y cena, según quién come en casa cada día.
- 👩‍🍳 **Planifica recetas y tiempos de cocina** según quién puede cocinar (si solo están los que hacen plancha, lo tiene en cuenta).
- 🛒 **Crea la lista de la compra** descontando lo que ya hay en la despensa.
- ♻️ **Reaprovecha las sobras** y da prioridad a lo que caduca antes.
- 🧾 **Aprende de tus tickets de compra** (foto o PDF) para detectar hábitos y proponer mejoras.

Los requisitos completos están en [docs/REQUISITOS.md](docs/REQUISITOS.md) y la propuesta de tuppers para la oficina en [docs/propuestas/tuppers-oficina.md](docs/propuestas/tuppers-oficina.md). Los temas pendientes de definir están en [open-issues.md](open-issues.md).

## Puesta en marcha

Necesitas Node.js 22 o superior y una clave de la API de Anthropic.

```bash
npm install
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY
npm start
```

Ejemplos de uso en el chat:

```
> Revisa las necesidades de la familia y prepárame el menú de la semana
> Hazme la lista de la compra y el plan de cocina del domingo
> Han sobrado 3 raciones de lentejas
> /ticket tickets/mercadona-27-09.jpg
> ¿En qué gastamos más?
```

Los documentos generados (menú, lista de la compra, plan de cocina) se guardan en `salidas/`.

Para ver los resultados en el navegador (menú de la semana, recetas, lista de la compra, personas y tuppers):

```bash
npm run web   # genera salidas/resultados.html
npm run pdf   # menú (A4 horizontal) y lista de la compra (A4 vertical) de esta semana y la siguiente, en salidas/
```

La web tiene las páginas Menú (esta semana y la siguiente), Recetas, Compra, Despensa, Tuppers y Configuración. En **Despensa** se apunta lo que hay en casa y la lista de la compra se descuenta al momento; en **Recetas** se puede marcar un plato como no deseado, con el motivo. Esos datos se guardan en la propia página publicada en claude.ai; para llevarlos al repositorio (y que el agente los use al hacer los siguientes menús), pídeselo a Claude Code: «sincroniza la despensa y los no deseados».

`npm run pdf` usa Chromium mediante Playwright: el de Playwright si está instalado, si no Google Chrome, o el que indique la variable `CHROMIUM_PATH`.

## Estructura

| Ruta | Contenido |
|---|---|
| `data/familia.json` | Perfil de la familia: miembros, deporte, gustos, régimen de comidas, roles y objetivos |
| `data/despensa.json` | Productos en casa y sobras |
| `data/tickets.json` | Tickets de compra registrados |
| `data/recetas.json` | Recetas con ingredientes por ración de referencia y pasos |
| `data/menu-semana.json` | Menú de la semana: plato de cada comida, variantes, tuppers y batch |
| `data/menu-siguiente.json` | Propuesta de menú de la semana siguiente |
| `src/nutricion.ts` | IMC, metabolismo basal, gasto diario, objetivos y factor de ración |
| `src/planificacion.ts` | Rejilla semanal de comensales, kcal por comida y quién cocina |
| `src/menu.ts` | Une menú y comensales, escala raciones y calcula la lista de la compra |
| `src/almacen.ts` | Lectura y escritura de datos y resumen de hábitos de compra |
| `src/herramientas.ts` | Herramientas que usa el agente |
| `src/agente.ts` | Chat de terminal con Claude |
| `src/web.ts` | Vista web de los resultados |
| `src/pdf.ts` | PDF del menú y de la lista de la compra |
| `data/propuesta-tuppers.json` | Rotación de tuppers de oficina |
| `data/precios.json` | Precios reales por tienda (Mercadona, BM, Elías), cargados desde los tickets |
| `src/precios.ts` | Coste de la cesta por tienda y combinación más barata |

## Desarrollo

```bash
npm test          # tests
npm run typecheck # comprobación de tipos
```

> ⚠️ Los cálculos nutricionales son orientativos y no sustituyen el consejo de un profesional sanitario.
