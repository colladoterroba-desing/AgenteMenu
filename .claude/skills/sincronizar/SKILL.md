---
name: sincronizar
description: Lleva al proyecto lo que la familia apunta en la web del menú (despensa, reservas, no deseados, perfiles, diario, anotaciones, cocinado, cambios y comentarios), vuelve a generar la página y la publica. Úsala cuando pidan «sincroniza», «sincroniza la web» o «trae lo de la web». Se ejecuta sola cada noche.
---

# Sincronizar la web con el proyecto

Es un trabajo mecánico: no leas ni interpretes los datos, solo cópialos (la única excepción son los desayunos nuevos del paso 4). El programa `npm run sincronizar` hace la unión. Se hace sobre la rama `main` y se guarda directamente en `main` (decisión del 30/09/2026).

Página: https://claude.ai/artifact/76bJD5hCEB8vM9pnYSkS91

1. Ponte en `main` al día: `git fetch origin main && git checkout -B main origin/main`. Si hace falta, `npm ci`.
2. Borra `salidas/web-export/` si existe.
3. Copia cada colección con `ArtifactData`, `action: "list"`, `query: {"limit": 1000}` y `out_dir` = ruta absoluta de `salidas/web-export` dentro del proyecto. Colecciones: `despensa`, `no-deseados`, `hechas`, `diario`, `cambios`, `cocinado`, `comentarios`, `eventos`, `perfil`, `comido`. Hazlo en paralelo. Si una devuelve `next_cursor`, pide la página siguiente con el mismo `out_dir`.
4. Ejecuta `npm run sincronizar`. Une los datos con `data/` (también pasa al menú los cambios de «Actualizar menú») y genera `salidas/resultados.html`. Si falla, para aquí: no publiques ni subas nada y explica el error.
   - **Desayunos nuevos (OI-41).** Si entre los avisos hay alguno «Desayuno nuevo de <ID> … en texto libre», pásalo a receta (es el único paso en que interpretas datos):
     - Añade a `data/recetas.json` una receta con el formato de las de desayuno que ya hay (por ejemplo `desayuno-cct`): `id` «desayuno-<id en minúsculas>-<AAAAMMDD>», `nombre` corto, `tipo: "desayuno"`, `tecnica: "sin cocinar"`, `racionFija: true`, `tiempoMin`, `pasos` e `ingredientes` en gramos (`unidad: "g"`) con una `seccion` de `SECCIONES` (`src/menu.ts`). Usa el nombre exacto de los ingredientes que ya existan en otras recetas; si algo va por unidades o por volumen, pásalo a gramos con `data/equivalencias.json` y, si no está, añádelo ahí con un peso medio. Cantidades de una ración normal de adulto; leche siempre semidesnatada.
     - En `data/familia.json`, en `desayunos.<ID>`: `receta` = el id nuevo, `desdeTexto` = el texto exacto del aviso y `nota` = «Desde la web, el <fecha>: <texto>». Deja `mostrarEnMenu` como estaba.
     - Vuelve a generar la página con `npm run web` y comprueba que termina sin errores. Si algo no está claro en el texto (cantidades raras, platos que no son un desayuno), no inventes: deja el desayuno como estaba y dilo en el resumen final.
5. Publica `salidas/resultados.html` con la herramienta `Artifact` y `url` de la página de arriba, sin `capabilities` (así se conservan `db` y `sample`). Si se rechaza porque no has visto la versión publicada, lee las 5 primeras líneas del fichero que te indica y vuelve a publicar el tuyo: la página siempre se genera desde el proyecto y nadie la edita a mano.
6. Si `git status` muestra cambios en `data/`, haz commit solo de `data/` con el mensaje «Sincronizar la web (AAAA-MM-DD)» y `git push origin main` (reintenta hasta 4 veces si falla la red; si main ha cambiado, `git pull --rebase origin main` y vuelve a subir). Si no hay cambios, no hagas commit. Después del push, comprueba con `git fetch origin main && git log origin/main -1 --format=%s` que tu commit está en main: la noche del 30/09/2026 se publicó la página pero los datos no llegaron a main sin que nadie se enterara.
7. Termina con dos o tres líneas: lo que ha escrito el programa (recuentos y avisos) y si se ha publicado y subido. Si los datos no han llegado a main, la primera línea es «ERROR: los datos NO se han guardado en el proyecto» con el mensaje de git.
