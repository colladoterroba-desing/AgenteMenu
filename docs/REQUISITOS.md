# Requisitos — Agente_Menú

## Propósito

Crear un agente que tenga en cuenta las características, gustos y limitaciones de un grupo familiar para generar un menú. Además, ayuda a gestionar las compras y a organizar recetas, almacenamiento y cocina.

## Grupo familiar

| Miembro | Edad | Sexo | Altura | Peso | Deporte |
|---|---|---|---|---|---|
| RFA | 57 | V | 165 cm | 73 kg | Running L y M (1 h 30 min) |
| CCT | 47 | M | 165 cm | 79 kg | Yoga funcional X (1 h) |
| RFC | 18 | V | 173 cm | 76 kg | Natación M y J (1 h) |
| AFC | 13 | M | 158 cm | 52 kg | Fútbol: entrenamiento X y V (1 h 30 min), partido S (90 min); Ed. física M y J; natación V (30 min) |

- **Alergias:** no detectadas.
- **Gustos:** RFA no come mucho pescado.
- **Régimen de comidas:**
  - L, M y X: comen en casa RFC y AFC.
  - J: comen en casa RFC, AFC y CCT.
  - V, S y D: comen en casa los 4.
  - Todas las cenas: los 4.
- **Roles en la cocina:** CCT es la cocinera; RFA cocina poco y plancha; RFC y AFC solo hacen plancha.
- **Tuppers de oficina:** RFA, frío, de lunes a jueves (el jueves desde el 30/09/2026); CCT, para recalentar, de lunes a miércoles. Propuesta en [propuestas/tuppers-oficina.md](propuestas/tuppers-oficina.md).
- **Desayunos habituales (todos los días):** AFC, vaso de leche con 1 cucharada de Nesquik y 8 galletas tostadas Animadas Hacendado. RFC, café solo y almuerzo para el colegio (L-V). CCT, café cortado con tostada de pan, aceite y azúcar (propuesta pendiente, OI-07: pan integral con tomate y queso fresco, sin azúcar). RFA, café cortado con 2 tortitas de maíz Hacendado, jamón york o pavo, aceite, sal y pimienta.
- **Preferencias:** leche siempre semidesnatada.
- **Pescado azul:** salmón, atún, anchoas y sardinas solo los jueves a la hora de comer, las semanas que toque (no es obligatorio ponerlo todos los jueves).
- **Cocina por la mañana:** por las mañanas no se cocina en casa. Almuerzos y tuppers se preparan la noche anterior o en el batch. La tortilla francesa se hace al momento: no se prepara el día antes.
- **Desayunos fijos:** cada persona elige si su desayuno fijo aparece en el menú (por defecto no). Siempre se cuenta en la lista de la compra.
- **PDF:** el menú se puede sacar en PDF en formato horizontal y la lista de la compra en vertical (`npm run pdf`).
- **Objetivos de peso (aceptados el 28/09/2026):** RFA, de 73 a 67,8 kg con 1.879 kcal/día (unas 11 semanas). CCT, de 79 a 67,8 kg con 1.623 kcal/día (unas 23 semanas). Consultarlo con su médico.
- **Legumbres:** mejor con un adulto (RFA o CCT) que supervise cuánto comen; no se ponen en las comidas en las que RFC y AFC están solos.
- **Comidas de los niños sin los mayores:** los días que RFA y CCT no comen en casa, la comida de RFC y AFC puede ser pasta o algo más calórico.
- **Platos habituales:** cenas fáciles (huevos revueltos con jamón york y/o queso, sándwich mixto, tortilla de patata) y comidas (purés de calabacín, calabaza y zanahoria; crema de puerro; judías verdes rehogadas; pechuga de pollo empanada; lomo adobado y chuleta de Sajonia a la plancha; ternera estofada con verduras; solomillo de cerdo a la naranja). Tienen prioridad en el menú, y el huevo debe aparecer varias veces por semana. Una comida puede llevar primero y segundo.
- **Thermomix:** en casa hay Thermomix; las recetas de cremas, purés, guisos y salsas incluyen los pasos para hacerlas con ella.
- **Despensa:** apartado para completar el inventario de lo que hay en casa; la lista de la compra lo descuenta y el menú se puede actualizar para aprovecharlo.
- **Platos no deseados:** se puede marcar un plato como no deseado (una persona o toda la familia) con el motivo; no se vuelve a proponer en futuros menús a quien lo marcó.
- **Semana siguiente:** aunque el menú es semanal, se muestra también la propuesta de la semana siguiente.
- **Coste de la cesta:** la familia compra sobre todo en Mercadona y a veces en BM y Casa Elías (Madrid). Hay que valorar el coste de la lista de la compra en cada tienda y proponer la combinación más barata.
- **Sin validación del menú (desde el 30/09/2026):** el menú no hay que aprobarlo. Lo que se come de verdad se apunta en el diario.
- **Medidas en gramos:** todas las cantidades (recetas, despensa, compra, precios, tuppers) van en gramos. Lo que se cuenta por unidades o se mide en ml se pasa a gramos con [`data/equivalencias.json`](../data/equivalencias.json) y se muestra la equivalencia entre paréntesis («1.320 g (≈22 ud)»). La página **Definiciones** explica los términos y las equivalencias.
- **Diario de comidas:** en cada casilla del menú se apunta si se comió lo previsto, otro plato del recetario u otra cosa, con una nota; el plato previsto queda tachado. El diario muestra los cambios sobre el menú ideal, lo cocinado y la actividad. Tiene un campo de **comentarios** para avisos de la semana (por ejemplo, «RFC no come esta semana X, J y V»).
- **Actualizar menú:** un botón pide a Claude que revise los días que quedan (a partir de mañana) con el diario, los comentarios, lo cocinado y la despensa. Puede cambiar platos y quién come en cada comida. Los cambios se proponen y solo se aplican los que se aprueban; cada uno se puede deshacer.
- **Cocinado:** cada plato, variante y tupper del menú tiene una casilla «Cocinado» con las raciones (se pueden cambiar). Al marcarla se restan de la despensa los ingredientes de esas raciones; al desmarcarla, vuelven. Lo que sale de otra comida (ración extra, batch) se marca una sola vez, en la comida donde se cocina. Los desayunos fijos se marcan como hechos una vez al día.
- **Compra → despensa:** al marcar productos en la lista de la compra aparece un botón fijo abajo a la derecha, «Confirmar compra», que los suma a la despensa. La lista solo cuenta lo que queda de semana y no muestra lo que ya está en casa.
- **Despensa:** se puede añadir cualquier producto, esté o no en el menú (se suma a lo que hubiera).
- **Menú:** los días que ya han pasado no se muestran (se pueden ver con «Mostrarlos»).

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
