---
name: preparar-semana
description: Prepara el menú de la semana siguiente (data/menu-siguiente.json) con las normas de la casa, lo comprueba, regenera la página y lo publica. Úsala cuando pidan «prepara la semana siguiente» o «haz el menú de la próxima semana». Se ejecuta sola cada lunes por la mañana.
---

# Preparar la semana siguiente

Cada lunes la semana siguiente pasa sola a ser la semana en curso (decisión del 30/09/2026). Esta tarea prepara la nueva semana siguiente para que la familia la vea con antelación (OI-14). Se hace sobre `main` y se guarda directamente en `main`, como la sincronización de cada noche.

Página: https://claude.ai/artifact/76bJD5hCEB8vM9pnYSkS91

1. Ponte en `main` al día: `git fetch origin main && git checkout -B main origin/main` y `npm ci`.
2. Ejecuta `npm run preparar-semana`. Hace la rotación si toca y dice qué falta. Si dice «No hay nada que hacer», termina aquí con una línea (si ha habido rotación, sigue igualmente con los pasos 6 a 8 para publicar y guardar la rotación).
3. Lee lo necesario para planificar, sin cambiar nada:
   - Las normas: el texto `SISTEMA` de `src/agente.ts` (puntos 2 a 8) y `decisions.md` (Menú, Normas de la casa, Personas y salud).
   - `data/familia.json` (régimen de comidas, tuppers, almuerzos, desayunos, no deseados, supervisión, restricciones, platos habituales).
   - El recetario `data/recetas.json`: usa **solo recetas que ya existan** (por su `id`); no crees recetas nuevas.
   - `data/menu-semana.json`, como modelo del formato (`semana`, `inicio`, `batch`, `dias`, `tuppers`, `sobrasDe`, `variantes`, `comensales`) y para no repetir los mismos platos.
   - `data/propuesta-tuppers.json`: los tuppers de la letra que toca (A o B).
   - `data/despensa.json` (aprovecha lo que caduca antes y las reservas con receta) y `data/web/comentarios.json`, `data/web/no-deseados.json`, `data/web/comido.json` (qué se salta la familia).
4. Escribe el borrador en `salidas/borrador-semana.json` con la semana y el `inicio` que ha indicado el paso 2, y un campo `descripcion` de una o dos frases (qué tiene de especial la semana). Tiene que cubrir cada comida del régimen, cada tupper y cada almuerzo; equilibrio de dieta mediterránea (legumbre 2-4, pescado 3-4, huevo 3-4, verdura en comida y cena, carne roja 1-2); batch del domingo; lo que se lleva fuera se prepara la noche anterior.
5. Ejecuta `npm run preparar-semana -- salidas/borrador-semana.json`. Si da errores, corrige el borrador y repite hasta que diga «Guardado». Si tras 5 intentos sigue fallando, no guardes nada y explica los errores.
6. Ejecuta `npm run web` y publica `salidas/resultados.html` con la herramienta `Artifact` y `url` de la página de arriba, sin `capabilities`. Si se rechaza porque no has visto la versión publicada, lee las 5 primeras líneas del fichero que te indica y vuelve a publicar el tuyo.
7. Haz commit solo de `data/` con el mensaje «Semana siguiente (AAAA-MM-DD)» y `git push origin main` (hasta 4 intentos; si main ha cambiado, `git pull --rebase origin main` y vuelve a subir). Comprueba con `git fetch origin main && git log origin/main -1 --format=%s` que tu commit está en main.
8. Termina con dos o tres líneas en español: la semana preparada y su resumen, si se ha publicado y si está en main. Si los datos no han llegado a main, la primera línea es «ERROR: el menú NO se ha guardado en el proyecto» con el mensaje de git.
