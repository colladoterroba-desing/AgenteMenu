# Requisitos — Agente_Menú

## Propósito

Crear un agente que tenga en cuenta las características, gustos y limitaciones de un grupo familiar para generar un menú. Además, ayuda a gestionar las compras y a organizar recetas, almacenamiento y cocina.

## Grupo familiar

| Miembro | Edad | Sexo | Altura | Peso | Deporte |
|---|---|---|---|---|---|
| RFA | 57 | V | 165 cm | 73 kg | Running L y M (1 h 30 min) |
| CCT | 47 | M | 165 cm | 79 kg | Yoga funcional X (1 h) |
| RFC | 18 | V | 173 cm | 68 kg | Natación M y J (1 h) |
| AFC | 13 | M | 158 cm | 52 kg | Fútbol: entrenamiento X y V (1 h 30 min), partido S (90 min); Ed. física M y J; natación V (30 min) |

- **Alergias:** no detectadas.
- **Gustos:** RFA no come mucho pescado.
- **Régimen de comidas:**
  - L, M y X: comen en casa RFC y AFC.
  - J: comen en casa RFC, AFC y CCT.
  - V, S y D: comen en casa los 4.
  - Todas las cenas: los 4.
- **Roles en la cocina:** CCT es la cocinera; RFA cocina poco y plancha; RFC y AFC solo hacen plancha.
- **Tuppers de oficina (L, M y X):** RFA, frío; CCT, para recalentar. Propuesta en [propuestas/tuppers-oficina.md](propuestas/tuppers-oficina.md).
- **Desayunos habituales (todos los días):** AFC, vaso de leche con 1 cucharada de Nesquik y 8 galletas tostadas Animadas Hacendado. RFC, café solo y almuerzo para el colegio (L-V). CCT, café cortado con tostada de pan, aceite y azúcar (propuesta: pan integral con tomate y queso fresco, sin azúcar). RFA, café cortado con 2 tortitas de maíz Hacendado, jamón york o pavo, aceite, sal y pimienta.
- **Preferencias:** leche siempre semidesnatada.
- **Tuppers de oficina (L, M y X):** RFA, frío; CCT, para recalentar.
- **Desayunos habituales (todos los días):** AFC, vaso de leche con 1 cucharada de Nesquik y 8 galletas tostadas Animadas Hacendado. RFC, café solo y almuerzo para el colegio (L-V). CCT, café cortado con tostada de pan, aceite y azúcar (propuesta: pan integral con tomate y queso fresco, sin azúcar). RFA, café cortado con 2 tortitas de maíz Hacendado, jamón york o pavo, aceite, sal y pimienta.
- **Preferencias:** leche siempre semidesnatada.

Los datos están en [`data/familia.json`](../data/familia.json).

## Tareas

| # | Tarea | Implementación |
|---|---|---|
| 1 | Revisar talla y peso para calcular las raciones. En caso de sobrepeso, ajustar y definir con el usuario un objetivo y un plazo. | `src/nutricion.ts` · herramientas `calcular_necesidades` y `guardar_objetivo` |
| 2 | Menú semanal sano y equilibrado: desayuno, comida, merienda (L-V) y cena, con raciones por persona. | `src/planificacion.ts` · `planificar_comensales` + el agente |
| 3 | Planificar las recetas y los tiempos de cocina. | El agente (batch cooking según quién cocina cada día) |
| 4 | Lista de la compra. | El agente + `ver_despensa` · `guardar_documento` |
| 5 | Revisar la despensa y reaprovechar las raciones sobrantes. | `actualizar_despensa`, `registrar_sobra`, `consumir_sobra` |
| 6 | Tickets de compra para aprender los hábitos de consumo. | `/ticket <foto o pdf>` · `registrar_ticket`, `resumen_habitos` |

## Criterios de cálculo

- **IMC** en adultos, con los umbrales de la OMS. En menores no se aplican esos umbrales (hacen falta percentiles) y **nunca** se restringen calorías.
- **Tasa metabólica basal:** Mifflin-St Jeor en adultos y Schofield para 10-17 años.
- **Gasto diario:** TMB × 1,4 (vida diaria) + el deporte semanal calculado con MET y repartido por día.
- **Objetivo con sobrepeso:** peso con IMC 24,9, déficit del 20 % con un máximo de 500 kcal (nunca por debajo de la TMB) y una pérdida de unos 0,5 kg por semana. Se propone al usuario y solo se aplica si lo acepta. Se recomienda consultarlo con el médico.
- **Factor de ración:** kcal objetivo / 2000 kcal de referencia.
- **Reparto diario:** los laborables, desayuno 20 %, comida 35 %, merienda 15 % y cena 30 %. El fin de semana, 25 %, 40 % y 35 % (sin merienda).
