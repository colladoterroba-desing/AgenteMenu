---
name: sincronizar
description: Lleva al proyecto lo que la familia apunta en la web del menú (despensa, reservas, no deseados, perfiles, diario, anotaciones, cocinado, cambios y comentarios), vuelve a generar la página y la publica. Úsala cuando pidan «sincroniza», «sincroniza la web» o «trae lo de la web». Se ejecuta sola cada noche.
---

# Sincronizar la web con el proyecto

Es un trabajo mecánico: no leas ni interpretes los datos, solo cópialos. El programa `npm run sincronizar` hace la unión. Se hace sobre la rama `main` y se guarda directamente en `main` (decisión del 30/09/2026).

Página: https://claude.ai/artifact/76bJD5hCEB8vM9pnYSkS91

1. Ponte en `main` al día: `git fetch origin main && git checkout -B main origin/main`. Si hace falta, `npm ci`.
2. Borra `salidas/web-export/` si existe.
3. Copia cada colección con `ArtifactData`, `action: "list"`, `query: {"limit": 1000}` y `out_dir` = ruta absoluta de `salidas/web-export` dentro del proyecto. Colecciones: `despensa`, `no-deseados`, `hechas`, `diario`, `cambios`, `cocinado`, `comentarios`, `eventos`, `perfil`, `comido`. Hazlo en paralelo. Si una devuelve `next_cursor`, pide la página siguiente con el mismo `out_dir`.
4. Ejecuta `npm run sincronizar`. Une los datos con `data/` (también pasa al menú los cambios de «Actualizar menú») y genera `salidas/resultados.html`. Si falla, para aquí: no publiques ni subas nada y explica el error.
5. Publica `salidas/resultados.html` con la herramienta `Artifact` y `url` de la página de arriba, sin `capabilities` (así se conservan `db` y `sample`). Si se rechaza porque no has visto la versión publicada, lee las 5 primeras líneas del fichero que te indica y vuelve a publicar el tuyo: la página siempre se genera desde el proyecto y nadie la edita a mano.
6. Si `git status` muestra cambios en `data/`, haz commit solo de `data/` con el mensaje «Sincronizar la web (AAAA-MM-DD)» y `git push origin main` (reintenta hasta 4 veces si falla la red; si main ha cambiado, `git pull --rebase origin main` y vuelve a subir). Si no hay cambios, no hagas commit.
7. Termina con dos o tres líneas: lo que ha escrito el programa (recuentos y avisos) y si se ha publicado y subido.
