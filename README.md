# Agente Planificador de Menú Familiar

**AgenteMenu** es un agente de menú familiar: un asistente inteligente, basado en Claude, que ayuda a planificar las comidas de la familia de forma sencilla, variada y equilibrada.

## ¿Qué hace?

- ⚖️ **Calcula las raciones de cada miembro** a partir de su edad, altura, peso y deporte. Si un adulto tiene sobrepeso, propone un objetivo y un plazo que acuerda contigo.
- 🍽️ **Genera el menú semanal**: desayuno, comida, merienda (L-V) y cena, según quién come en casa cada día.
- 👩‍🍳 **Planifica recetas y tiempos de cocina** según quién puede cocinar (si solo están los que hacen plancha, lo tiene en cuenta).
- 🛒 **Crea la lista de la compra** descontando lo que ya hay en la despensa.
- ♻️ **Reaprovecha las sobras** y da prioridad a lo que caduca antes.
- 🧾 **Aprende de tus tickets de compra** (foto o PDF) para detectar hábitos y proponer mejoras.

Los requisitos completos están en [docs/REQUISITOS.md](docs/REQUISITOS.md) y la propuesta de tuppers para la oficina en [docs/propuestas/tuppers-oficina.md](docs/propuestas/tuppers-oficina.md).

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

Para ver los resultados en el navegador (personas y raciones, quién come qué cada día y tuppers de oficina):

```bash
npm run web   # genera salidas/resultados.html
```

## Estructura

| Ruta | Contenido |
|---|---|
| `data/familia.json` | Perfil de la familia: miembros, deporte, gustos, régimen de comidas, roles y objetivos |
| `data/despensa.json` | Productos en casa y sobras |
| `data/tickets.json` | Tickets de compra registrados |
| `src/nutricion.ts` | IMC, metabolismo basal, gasto diario, objetivos y factor de ración |
| `src/planificacion.ts` | Rejilla semanal de comensales, kcal por comida y quién cocina |
| `src/almacen.ts` | Lectura y escritura de datos y resumen de hábitos de compra |
| `src/herramientas.ts` | Herramientas que usa el agente |
| `src/agente.ts` | Chat de terminal con Claude |
| `src/web.ts` | Vista web de los resultados |
| `data/propuesta-tuppers.json` | Rotación de tuppers de oficina |

## Desarrollo

```bash
npm test          # tests
npm run typecheck # comprobación de tipos
```

> ⚠️ Los cálculos nutricionales son orientativos y no sustituyen el consejo de un profesional sanitario.
