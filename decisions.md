# Decisiones del proyecto

Decisiones tomadas sobre Agente_Menú y su motivo. Antes de cualquier cambio hay que revisar esta lista: si un ajuste nuevo contradice una decisión, **se avisa antes de tocar nada** y se espera la respuesta. Si la decisión cambia, se actualiza aquí (con la fecha) en lugar de borrarla.

Cuando no se anotó el motivo en su momento, figura «sin anotar».

## Menú

| Fecha | Decisión | Motivo |
|---|---|---|
| 30/09/2026 | **El menú no se valida.** No hay botones de aprobar ni herramienta `validar_menu`. Se publica tal cual. | El menú es un proceso vivo que se adapta a lo que se apunta en el diario (lo que se come de verdad, lo cocinado y los comentarios). Validarlo no tiene sentido si cambia cada día. Sustituye a la decisión del 28/09/2026 («menú en borrador hasta que CCT lo valide»). |
| 30/09/2026 | **«Actualizar menú»** revisa los días que quedan (desde mañana) con el diario, los comentarios, lo cocinado y la despensa. Claude propone cambios; la familia elige cuáles se aplican y cada uno se puede deshacer. | El menú se ajusta a lo que pasa en casa sin rehacerlo entero. Elegir los cambios no es validar el menú: evita que se apliquen cambios que Claude se invente (OI-39). Confirmado el 30/09/2026: Claude sigue viendo lo que se comió en los días pasados para reequilibrar la semana, pero solo cambia los días que quedan. |
| 30/09/2026 | **Anotaciones en cada comida del menú.** Si no se apunta nada, se da por hecho que cada uno comió lo previsto (no hay que marcar nada). Cada comida tiene un solo botón «Anotaciones»; en la ventana, cada anotación dice a quién se refiere (una o varias personas) y qué pasó: no come (con «tampoco las demás comidas de ese día»), otra cosa, otro plato del recetario o lo previsto con una nota; y lo gastado de la despensa o de una ración en reserva. Puede haber varias anotaciones en la misma comida («Añadir otra anotación»). En el menú se ve una línea por anotación. Quien no come lo previsto se descuenta de las raciones que se cocinan y de la compra; quien no estaba previsto y lo come, se suma. | Apuntar solo lo que no sale como estaba previsto, sin revisar todas las comidas. Sustituye a la decisión del 30/09/2026 «Anotaciones por persona» con una casilla por persona, que a su vez sustituía al «Diario» de la comida entera. |
| 28/09/2026 | Se muestra también la propuesta de la **semana siguiente**. | Poder planificar la compra y el batch con antelación. |
| 30/09/2026 | **Rotación de semanas:** la semana A es la semana en curso y la B la próxima. El lunes en que empieza la próxima, pasa a ser la semana en curso (la página lo detecta por la fecha) y el menú anterior se guarda en `data/historial/`. Después hay que preparar la nueva próxima semana. Las casillas del menú se identifican por el lunes de su semana, no por la letra. | El menú siempre muestra la semana que toca. Con la letra, el diario y lo cocinado de una semana A se mezclarían con los de la siguiente semana A. |
| 30/09/2026 | Cuando alguien come algo que ya estaba en casa (de la despensa o una ración en reserva), se elige en «Anotaciones» lo que se ha usado y se resta. Si la anotación se cambia o se quita, vuelve a la despensa. | Que la despensa refleje lo que hay en casa. |
| 28/09/2026 | **Platos habituales** de casa con prioridad; el huevo aparece 3-4 veces por semana (en los criterios del menú desde el 30/09/2026); una comida puede llevar primero y segundo. | Son los platos que la familia ya come y sabe hacer. |
| 28/09/2026 | Un plato se puede marcar como **no deseado** (por persona o por la familia) con el motivo; no se vuelve a proponer a quien lo marcó. | Que el menú aprenda de lo que no gusta. |
| 28/09/2026 | Los días que ya han pasado no se muestran en el menú (se pueden ver con «Mostrarlos»). | Para ver solo lo que queda de semana. |

## Normas de la casa

| Fecha | Decisión | Motivo |
|---|---|---|
| 28/09/2026 | **Pescado azul** (salmón, atún, anchoas, sardinas) solo los jueves a mediodía, las semanas que toque (no todos los jueves). | Ese día RFA no come en casa, y RFA no come mucho pescado. |
| 28/09/2026 | **Por la mañana no se cocina.** Almuerzos y tuppers se preparan la noche anterior o en el batch. La tortilla francesa se hace al momento, no el día antes. | Los almuerzos y tuppers se dejan preparados la noche anterior. La tortilla francesa se hace al momento porque de un día para otro queda mala. |
| 28/09/2026 | **Legumbres** solo con un adulto (RFA o CCT) en la mesa, no cuando RFC y AFC comen solos. | Que un adulto supervise cuánto comen. |
| 28/09/2026 | Los días que RFA y CCT no comen en casa, la comida de RFC y AFC puede ser **pasta o algo más calórico**. | Les gusta más y es más fácil que se lo terminen. |
| 28/09/2026 | Leche siempre **semidesnatada**. | Preferencia de la familia. |
| 28/09/2026 | Las recetas de cremas, purés, guisos y salsas incluyen los pasos con **Thermomix**. | Hay Thermomix en casa. |

## Personas y salud

| Fecha | Decisión | Motivo |
|---|---|---|
| 28/09/2026 | **Objetivos de peso aceptados:** RFA y CCT, a 67,8 kg (IMC 24,9) perdiendo unos 0,5 kg por semana. RFA 1.879 kcal/día; CCT 1.623 kcal/día. | IMC en sobrepeso. Conviene consultarlo con su médico. |
| 28/09/2026 | Los **desayunos de CCT y RFA** se mantienen como están mientras sus propuestas (OI-06, OI-07) sigan pendientes. | Las propuestas no se han aceptado todavía. |
| 28/09/2026 | Cada persona elige si su **desayuno fijo** aparece en el menú (por defecto no). Siempre se cuenta en la compra. | Para que el menú no se llene de información que no hace falta. |
| 30/09/2026 | Tupper de RFA (frío) de lunes a jueves; CCT (para recalentar) de lunes a miércoles. | RFA amplía al jueves desde el 30/09/2026. |
| 30/09/2026 | **Alias en lugar de siglas** en la web y los PDF: CCT = Cristina, RFA = Ricardo, RFC = Ricardo hijo, AFC = Alicia. Los datos siguen usando las siglas por dentro. | Que la página se lea con nombres y no con siglas. |
| 30/09/2026 | Desde la ficha de cada persona se puede cambiar el **peso** (queda un registro con la fecha), el **objetivo** (peso y/o plazo, con «¿Aceptar?» Sí/No), los **gustos** y el **desayuno**. Se guarda en la página (colección `perfil`). La ficha se recalcula al momento; el menú, las raciones y la compra se ajustan cuando los datos se copian al proyecto y se regenera la página. | Recalcular también el menú y la compra en la página era bastante más trabajo y más fácil que fallara. Es como ya funcionan la despensa y el diario. |
| 30/09/2026 | El **desayuno** se cambia con **texto libre**. | Preferencia de la familia. Se sabe que un desayuno en texto libre no cuenta en la lista de la compra hasta que Claude lo pase a receta. |
| 30/09/2026 | Un objetivo nuevo solo se puede aceptar si: no baja de IMC 18,5, no pasa de 1 kg por semana y no obliga a comer menos que el metabolismo basal. Solo adultos. | Salud: son los límites habituales de una pérdida de peso segura. Los menores no tienen objetivo de peso (su pediatra). Confirmado por la familia el 30/09/2026. |

## Compra, despensa y cantidades

| Fecha | Decisión | Motivo |
|---|---|---|
| 30/09/2026 | **Todo en gramos** (recetas, despensa, compra, precios, tuppers). Lo que va por unidades o ml se pasa a gramos con `data/equivalencias.json` y se muestra la equivalencia entre paréntesis. | Una sola unidad para poder sumar, restar y comparar precios. |
| 30/09/2026 | **«Cocinado» se marca en la receta, no en el menú**, y une lo que antes era «Cocinado» y «Marcar cantidad hecha»: se eligen las comidas del menú para las que se ha cocinado (vienen marcadas las de hoy) y cuántas raciones se han hecho. Se restan de la despensa los ingredientes de todo lo hecho, esas comidas dejan de contar en la compra y lo que sobra queda en reserva. Cada comida cocinada se puede deshacer desde la receta. En el menú solo se ve «✓ Cocinado». Los desayunos fijos ya no se marcan como hechos. | Una sola forma de apuntar lo cocinado (OI-36) y un menú más limpio. Sustituye a la decisión «Casilla Cocinado en cada plato del menú» del 30/09/2026. |
| 30/09/2026 | **En la despensa no hay cantidades negativas.** Si se gasta más de lo apuntado (o algo que no estaba), el producto se queda a 0, sin aviso. | Si saldría negativo, es que no se había apuntado bien lo que había (por ejemplo, los macarrones que comió Alicia no estaban en la despensa). |
| 30/09/2026 | Botón **«Confirmar compra»** en la lista: suma lo marcado a la despensa. La lista solo cuenta lo que queda de semana y no muestra lo que ya está en casa. | No comprar lo que ya hay. |
| 28/09/2026 | **Precios reales, sin estimaciones.** Se cargan desde los tickets o a mano; el coste solo se muestra cuando hay precios. | Los precios estimados no eran fiables. |
| 28/09/2026 | Se compara el coste en **Mercadona, BM y Casa Elías** y se propone la combinación más barata. | Son las tiendas donde compra la familia. |

## Web

| Fecha | Decisión | Motivo |
|---|---|---|
| 30/09/2026 | **Página «Normas»** con las normas de la casa, las alergias y quién cocina. Salen de Configuración. | Separar las normas de la configuración de las personas. Definiciones se queda como glosario. |
| 30/09/2026 | En **Configuración → Grupo familiar** no se repiten los datos de cada miembro (están en su ficha) ni se explica cómo se cambia el menú. Se quedan el régimen de comidas, el reparto de la energía, los criterios del menú y el gráfico que compara el gasto de los cuatro. | Los datos de cada miembro, solo en su ficha. |
| 30/09/2026 | Si un cambio de Claude deja **el mismo plato** (por ejemplo, solo cambia quién come), el plato del menú no se tacha ni se repite: se ve «Claude · Mismo plato» con lo que cambia. | Tachar un plato para volver a escribir el mismo confunde. |
| 30/09/2026 | En el **régimen de comidas** cada persona lleva un color: en casa (verde), tupper frío (azul), tupper para recalentar (naranja) y almuerzo que se lleva (amarillo). | Ver de un vistazo quién come en casa y quién lleva tupper. |

## Proyecto

| Fecha | Decisión | Motivo |
|---|---|---|
| 30/09/2026 | Se crea este documento y se revisa antes de cada cambio. | Evitar que un ajuste nuevo deshaga, sin avisar, algo que ya se decidió. |
