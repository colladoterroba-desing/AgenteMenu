// Script de la página web (npm run web lo incrusta en salidas/resultados.html).
// Datos guardados en la página publicada en claude.ai (capacidad db): despensa, no-deseados, hechas,
// diario, cambios, cocinado, comentarios y eventos. «Actualizar menú» usa la capacidad sample.
(() => {
  document.querySelectorAll('[role="tablist"]').forEach((lista) => {
    const tabs = [...lista.querySelectorAll('[role="tab"]')];
    const activar = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on);
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => activar(t));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") activar(tabs[(i + 1) % tabs.length]);
        if (e.key === "ArrowLeft") activar(tabs[(i - 1 + tabs.length) % tabs.length]);
      });
    });
  });

  // Páginas: una vista visible según el #ancla; #r-<id> abre la receta.
  const vistas = [...document.querySelectorAll("[data-vista]")];
  const enlaces = [...document.querySelectorAll("[data-pagina]")];
  const irA = () => {
    let destino = location.hash.slice(1) || "menu";
    let receta = null;
    if (destino.startsWith("r-")) { receta = destino; destino = "recetas"; }
    if (!vistas.some((v) => v.id === destino)) destino = "menu";
    vistas.forEach((v) => (v.hidden = v.id !== destino));
    enlaces.forEach((a) => a.toggleAttribute("aria-current", a.dataset.pagina === destino));
    const el = receta && document.getElementById(receta);
    if (el) el.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
  };
  addEventListener("hashchange", irA);
  irA();

  const tip = document.createElement("div");
  tip.className = "tip"; tip.hidden = true; document.body.append(tip);
  const mostrar = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false;
    const w = tip.offsetWidth; tip.style.left = Math.min(Math.max(8, x - w / 2), innerWidth - w - 8) + "px"; tip.style.top = (y - 36) + "px"; };
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("pointermove", (e) => mostrar(el, e.clientX, e.clientY));
    el.addEventListener("pointerleave", () => (tip.hidden = true));
    el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top); });
    el.addEventListener("blur", () => (tip.hidden = true));
  });

  const filtros = [...document.querySelectorAll("[data-filtro]")];
  filtros.forEach((b) => b.addEventListener("click", () => {
    filtros.forEach((x) => x.setAttribute("aria-pressed", x === b));
    const f = b.dataset.filtro;
    document.querySelectorAll(".receta").forEach((r) => {
      r.hidden = f === "no-deseado" ? r.dataset.nd !== "1" : f !== "todas" && !r.dataset.categorias.split(" ").includes(f);
    });
  }));
  document.querySelectorAll('a[href^="#r-"]').forEach((a) => a.addEventListener("click", () => {
    const todas = filtros.find((b) => b.dataset.filtro === "todas");
    if (todas) todas.click();
  }));


  // ================= Datos =================
  const datos = JSON.parse(document.getElementById("datos-pagina").textContent);
  const REC = datos.rec, MENU = datos.menu;
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const COMIDA_TXT = { desayuno: "Desayuno", almuerzo: "Almuerzo", comida: "Comida", merienda: "Merienda", cena: "Cena" };
  const celdas = new Map();
  Object.values(MENU).forEach((s) => s.celdas.forEach((c) => celdas.set(c.id, c)));
  const nombreDe = new Map();
  Object.values(REC).forEach((r) => r.ing.forEach(([k, n]) => nombreDe.set(k, n)));

  const fmtNum = (n, d) => {
    const [ent, dec] = Number(n).toFixed(d || 0).split(".");
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? "," + dec : "");
  };
  const fmtG = (g) => (g > 0 && g < 1 ? fmtNum(g, 1) : fmtNum(g)) + " g";
  const fmtCant = (n, u) => (u === "g" || !u ? fmtG(n) : u === "ud" ? fmtNum(n, n % 1 ? 1 : 0) + " ud" : fmtNum(n) + " " + u);
  const fmtRac = (n) => fmtNum(n, 2);
  const clave = (nombre, unidad) => (nombre + "|" + (unidad || "g")).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const equivalencia = (k, g) => {
    if (!g) return "";
    const gu = datos.gud[k], de = datos.den[k];
    if (gu) return " (≈" + fmtNum(Math.ceil(g / gu - 1e-9)) + " ud)";
    if (de) return " (≈" + fmtNum(Math.round(g / de)) + " ml)";
    return "";
  };
  const redondear = (n, k) => {
    if (n <= 0.0001) return 0;
    const gu = datos.gud[k];
    if (gu) return Math.ceil(n / gu - 1e-9) * gu;
    const paso = n > 500 ? 50 : 10;
    return Math.ceil(n / paso) * paso;
  };
  const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const HOY = isoLocal(new Date());
  const hoy = () => HOY;
  // Rotación de semanas: la semana en curso es la que contiene hoy; si ya ha empezado la
  // semana siguiente y la página no se ha regenerado, esa pasa a ser la semana en curso.
  const sumar = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoLocal(new Date(y, m - 1, d + n)); };
  const SEMANAS = Object.keys(MENU).sort();
  const ACTUAL = SEMANAS.filter((k) => k <= HOY).pop() || SEMANAS[0];
  const PROXIMA = SEMANAS.find((k) => k > ACTUAL) || null;
  (() => {
    const avisoSem = document.getElementById("aviso-semanas");
    const tabs = [...document.querySelectorAll('[role="tab"][data-sem]')];
    const etiqueta = (t, txt) => { t.firstChild.textContent = txt + " · " + MENU[t.dataset.sem].letra + " "; };
    tabs.forEach((t) => {
      const k = t.dataset.sem;
      if (k < ACTUAL) { t.hidden = true; t.setAttribute("aria-selected", "false"); t.tabIndex = -1; document.getElementById(t.getAttribute("aria-controls")).hidden = true; }
      else if (k === ACTUAL) { etiqueta(t, "Semana en curso"); t.setAttribute("aria-selected", "true"); t.tabIndex = 0; document.getElementById(t.getAttribute("aria-controls")).hidden = false; }
      else etiqueta(t, "Próxima semana");
    });
    const etq = document.getElementById("etq-semana");
    if (etq && ACTUAL !== datos.semanaActual) { const dm = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); };
      etq.textContent = "Semana " + MENU[ACTUAL].letra + " · " + dm(ACTUAL) + " – " + dm(sumar(ACTUAL, 6)); }
    const falta = !PROXIMA ? "Falta el menú de la próxima semana: pídeselo a Claude." : "";
    const caducado = HOY > sumar(ACTUAL, 6) ? "El menú de esta semana ya ha terminado. " : "";
    if (avisoSem && (caducado || falta)) { avisoSem.textContent = caducado + falta; avisoSem.hidden = false; }
  })();
  const fechaCelda = (c) => { const [y, m, d] = MENU[c.sem].inicio.split("-").map(Number); return isoLocal(new Date(y, m - 1, d + c.dia)); };
  const fechaCorta = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }); };
  const nombreRec = (id) => (REC[id] ? REC[id].n : id);
  // Las siglas de cada miembro se muestran con su alias (Cristina, Ricardo...).
  const ALIAS = datos.alias || {};
  const reAlias = Object.keys(ALIAS).length ? new RegExp("\\b(" + Object.keys(ALIAS).join("|") + ")\\b", "g") : null;
  const conAlias = (t) => (reAlias ? String(t).replace(reAlias, (x) => ALIAS[x] || x) : String(t));
  const el = (tag, props, ...hijos) => {
    const e = document.createElement(tag);
    if (props) Object.entries(props).forEach(([k, v]) => { if (k === "class") e.className = v; else if (k === "text") e.textContent = conAlias(v); else if (k === "title") e.title = conAlias(v); else if (k in e) e[k] = v; else e.setAttribute(k, v); });
    hijos.flat().forEach((h) => h != null && e.append(typeof h === "string" ? conAlias(h) : h));
    return e;
  };
  const aviso = (txt) => {
    const a = document.getElementById("aviso-flotante");
    a.textContent = txt; a.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 3500);
  };

  // ================= Estado (lo guardado en la página) =================
  let db = null;
  let editable = false;
  const despensaBase = new Map(datos.despensa.map((p) => [p.clave, p]));
  let despensaDb = new Map(), ndDb = new Map(), diarioDb = new Map(), cambiosDb = new Map(), cocinadoDb = new Map(), reservasDb = new Map();
  let eventos = [], comentarios = [];
  const ndBase = new Map(datos.noDeseados.map((n) => [n.receta + "__" + n.por, n]));
  const reservasBase = new Map((datos.reservas || []).map((x) => [x.id, x]));

  const despensaActual = () => { const t = new Map(despensaBase); despensaDb.forEach((v, k) => t.set(k, v)); return t; };
  const tengoDe = (k) => Number(despensaActual().get(k)?.cantidad || 0);
  const noDeseadosActuales = () => { const t = new Map(ndBase); ndDb.forEach((v, k) => (v.quitado ? t.delete(k) : t.set(k, v))); return [...t.values()]; };
  const reservasActuales = () => {
    const t = new Map(reservasBase);
    reservasDb.forEach((v, k) => t.set(k, v));
    return [...t.entries()].map(([id, v]) => ({ ...v, id })).filter((x) => Number(x.reserva) > 0);
  };

  // Qué se come en cada casilla: diario > cambio de Claude > menú.
  const efectivo = (c) => {
    const d = diarioDb.get(c.id);
    if (d && d.tipo === "receta" && REC[d.receta]) return { origen: "diario", recetas: [d.receta], nota: d.nota };
    if (d && d.tipo === "texto") return { origen: "diario", recetas: [], texto: d.texto, nota: d.nota };
    const k = cambiosDb.get(c.id);
    if (k && Array.isArray(k.recetas) && k.recetas.every((r) => REC[r])) {
      const com = Array.isArray(k.comensales) && k.comensales.length ? k.comensales.filter((q) => datos.factores[q]) : null;
      return { origen: "claude", recetas: k.recetas, motivo: k.motivo, nota: d && d.nota, comensales: com,
        rac: com ? Math.round(com.reduce((s, q) => s + datos.factores[q], 0) * 100) / 100 : c.rac, personas: com ? com.length : c.quien.length };
    }
    return { origen: "menu", recetas: c.platos, nota: d && d.nota };
  };
  const corto = (r) => nombreRec(r).split(" ").filter((w) => !/^(de|con|a|al|la|el|en|y|del|los|las)$/i.test(w)).slice(0, 2).join(" ");
  /** Lo que se cocina en una casilla: cada plato, variante y tupper, con sus raciones. */
  const instancias = (c) => {
    if (c.comida === "desayuno") {
      return [{ inst: c.id + "~des", items: (c.desayunos || []).map((x) => ({ receta: x.receta, rac: x.rac, personas: x.personas })), etiqueta: "Desayunos", esDes: true }];
    }
    const e = efectivo(c), out = [];
    e.recetas.forEach((r, i) => {
      const deMenu = e.origen === "menu";
      out.push({ inst: c.id + "~p" + i, items: [{ receta: r, rac: deMenu ? c.racCocinar : (e.rac ?? c.rac), personas: deMenu ? c.personas : (e.personas ?? c.quien.length) }],
        sobras: deMenu && c.sobras, etiqueta: e.recetas.length > 1 ? corto(r) : "" });
    });
    (c.variantes || []).forEach((v, i) => out.push({ inst: c.id + "~var" + (i || ""), items: [{ receta: v.receta, rac: v.rac, personas: 1 }], etiqueta: v.quien }));
    c.tuppers.forEach((t) => out.push({ inst: c.id + "~t" + t.quien, items: t.recetas.map((r) => ({ receta: r, rac: t.rac, personas: 1 })), sobras: t.sobras, etiqueta: "Tupper " + t.quien }));
    return out;
  };
  const cantidadIng = ([, , g, , porPersona], it, rac) => (porPersona ? g * it.personas * (rac / (it.rac || 1)) : g * rac);
  const ingredientesDe = (items, factor) => {
    const m = new Map();
    items.forEach((it) => (REC[it.receta]?.ing || []).forEach((ing) => {
      const rac = it.rac * factor;
      m.set(ing[0], (m.get(ing[0]) || 0) + cantidadIng(ing, it, rac));
    }));
    return m;
  };

  /** Lo que falta para lo que queda de la semana actual (desde hoy), sin lo cocinado y gastando antes las reservas. */
  const necesidades = () => {
    const nec = new Map();
    const reserva = new Map();
    reservasActuales().forEach((x) => { if (x.receta) reserva.set(x.receta, (reserva.get(x.receta) || 0) + Number(x.reserva)); });
    MENU[ACTUAL].celdas.slice().sort((a, b) => a.dia - b.dia).forEach((c) => {
      if (fechaCelda(c) < HOY) return;
      instancias(c).forEach((i) => {
        if (i.sobras || cocinadoDb.has(i.inst)) return;
        i.items.forEach((it) => {
          const deReserva = Math.min(reserva.get(it.receta) || 0, it.rac);
          if (deReserva > 0) reserva.set(it.receta, reserva.get(it.receta) - deReserva);
          const rac = it.rac - deReserva;
          if (rac <= 0) return;
          (REC[it.receta]?.ing || []).forEach((ing) => {
            const [k, n, , seccion, , unidad] = ing;
            const x = nec.get(k) || { nombre: n, g: 0, recetas: new Set(), seccion, unidad };
            x.g += cantidadIng(ing, it, rac); x.recetas.add(nombreRec(it.receta)); nec.set(k, x);
          });
        });
      });
    });
    return nec;
  };

  // ================= Escrituras =================
  const guardarProducto = async (nombre, cantidadNueva, caducidad, unidad) => {
    const u = unidad || "g";
    const k = clave(nombre, u);
    const previo = despensaActual().get(k) || {};
    const doc = { nombre, unidad: u, cantidad: Math.max(0, Math.round((Number(cantidadNueva) || 0) * 10) / 10), actualizado: new Date().toISOString() };
    const cad = caducidad !== undefined ? caducidad : previo.caducidad;
    if (cad) doc.caducidad = cad;
    if (previo.nota) doc.nota = previo.nota;
    await db.doc("despensa/" + k).set(doc);
    despensaDb.set(k, doc);
  };
  const registrar = async (tipo, texto) => {
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    try { await db.doc("eventos/" + id).set({ tipo, texto, fecha: new Date().toISOString() }); } catch (e) {}
  };
  const guardarNoDeseado = async (n) => {
    const doc = { receta: n.receta, por: n.por, motivo: n.motivo, fecha: n.fecha || HOY };
    if (n.quitado) doc.quitado = true;
    await db.doc("no-deseados/" + n.receta + "__" + n.por).set(doc);
  };
  const guardarReserva = async (x) => {
    const { id, ...doc } = x;
    Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);
    doc.actualizado = new Date().toISOString();
    try { await db.doc("hechas/" + id).set(doc); }
    catch (e) { aviso("No se ha podido guardar la reserva (" + (e && e.code || "error") + ")."); }
  };

  let ocupado = false;
  const marcarCocinado = async (c, i, factor) => {
    if (ocupado) return; ocupado = true;
    try {
      const nec = ingredientesDe(i.items, factor);
      const descontado = {};
      for (const [k, g] of nec) {
        const tengo = tengoDe(k);
        const quita = Math.min(tengo, g);
        if (quita > 0) { descontado[k] = Math.round(quita * 10) / 10; await guardarProducto(despensaActual().get(k)?.nombre || nombreDe.get(k) || k, tengo - quita); }
      }
      const raciones = Math.round(i.items[0].rac * factor * 100) / 100;
      const doc = { celda: c.id, recetas: i.items.map((x) => x.receta), raciones, descontado, fecha: new Date().toISOString(), etiqueta: i.etiqueta || "" };
      await db.doc("cocinado/" + i.inst).set(doc);
      cocinadoDb.set(i.inst, doc);
      await registrar("cocinado", (i.esDes ? "Desayunos hechos" : "Cocinado: " + doc.recetas.map(nombreRec).join(", ") + " · " + fmtRac(raciones) + " rac.") +
        " (" + DIAS[c.dia].toLowerCase() + ", " + COMIDA_TXT[c.comida].toLowerCase() + "). Se restan " + Object.keys(descontado).length + " productos de la despensa.");
      aviso("Hecho. Ingredientes restados de la despensa.");
    } catch (e) { aviso("No se ha podido guardar (" + (e && e.code || "error") + ")."); }
    ocupado = false; renderTodo();
  };
  const desmarcarCocinado = async (c, i) => {
    if (ocupado) return; ocupado = true;
    try {
      const doc = cocinadoDb.get(i.inst);
      for (const [k, g] of Object.entries(doc?.descontado || {})) await guardarProducto(despensaActual().get(k)?.nombre || nombreDe.get(k) || k, tengoDe(k) + Number(g));
      await db.doc("cocinado/" + i.inst).delete();
      cocinadoDb.delete(i.inst);
      await registrar("cocinado", "Desmarcado: " + (doc?.recetas || []).map(nombreRec).join(", ") + ". Los ingredientes vuelven a la despensa.");
      aviso("Desmarcado. Los ingredientes vuelven a la despensa.");
    } catch (e) { aviso("No se ha podido guardar (" + (e && e.code || "error") + ")."); }
    ocupado = false; renderTodo();
  };

  // ================= Menú: casillas =================
  const renderMenu = () => {
    let cocinados = 0;
    document.querySelectorAll("[data-acciones]").forEach((caja) => {
      const c = celdas.get(caja.dataset.acciones);
      if (!c) return;
      const td = caja.closest("td");
      const e = efectivo(c);
      td.querySelectorAll(":scope > .plato-menu").forEach((a) => a.classList.toggle("tachado", e.origen !== "menu"));
      td.querySelector(":scope > .plato-real")?.remove();
      const ancla = td.querySelector(":scope > .comensales, :scope > .des-sub, :scope > .desayunos-dia") || caja;
      if (e.origen !== "menu") {
        const real = el("div", { class: "plato-real" });
        const etq = el("span", { class: "origen " + e.origen, text: e.origen === "diario" ? "Diario" : "Claude" });
        if (e.recetas.length) e.recetas.forEach((r, n) => real.append(el("div", null, n ? null : etq, el("a", { href: "#r-" + r, text: nombreRec(r) }))));
        else real.append(el("div", null, etq, el("strong", { text: e.texto })));
        if (e.comensales) real.append(el("span", { class: "motivo", text: "Comen: " + e.comensales.join(", ") + " (" + fmtRac(e.rac) + " rac.)" }));
        const txt = [e.motivo, e.nota].filter(Boolean).join(" · ");
        if (txt) real.append(el("span", { class: "motivo", text: txt }));
        if (e.origen === "claude" && editable) {
          const b = el("button", { type: "button", class: "btn-mini", text: "Volver al plato previsto" });
          b.addEventListener("click", async () => {
            try { await db.doc("cambios/" + c.id).delete(); cambiosDb.delete(c.id);
              await registrar("actualizacion", "Deshecho el cambio de Claude del " + DIAS[c.dia].toLowerCase() + " (" + COMIDA_TXT[c.comida].toLowerCase() + ")."); renderTodo(); }
            catch (err) { aviso("No se ha podido guardar."); }
          });
          real.append(b);
        }
        ancla.before(real);
      } else if (e.nota) {
        ancla.before(el("div", { class: "plato-real" }, el("span", { class: "motivo", text: "Nota: " + e.nota })));
      }
      caja.replaceChildren();
      const insts = instancias(c);
      if (insts.some((i) => i.etiqueta && !i.esDes)) caja.append(el("span", { class: "etq", text: "Cocinado" }));
      insts.forEach((i) => {
        const doc = cocinadoDb.get(i.inst);
        if (doc) cocinados++;
        if (i.sobras && !doc) {
          caja.append(el("span", { class: "sobras-txt", text: (i.etiqueta ? i.etiqueta + ": " : "") + "sobras de otra comida" }));
          return;
        }
        const fila = el("div", { class: "coc" + (doc ? " hecho" : "") });
        const chk = el("input", { type: "checkbox", checked: !!doc, disabled: !editable });
        const base = i.items[0]?.rac || 1;
        const rac = el("input", { type: "number", min: "0", step: "0.01", value: String(doc ? doc.raciones : base), disabled: !editable || !!doc, "aria-label": "Raciones" });
        fila.append(el("label", null, chk, i.esDes ? "Hechos" : (i.etiqueta || "Cocinado")));
        if (!i.esDes) fila.append(rac, el("span", { class: "quien", text: "rac." }));
        chk.addEventListener("change", () => {
          if (chk.checked) {
            const r = i.esDes ? base : Number(rac.value);
            if (!(r > 0)) { chk.checked = false; rac.focus(); return; }
            marcarCocinado(c, i, r / base);
          } else desmarcarCocinado(c, i);
        });
        caja.append(fila);
      });
      if (c.comida !== "desayuno") {
        const tiene = diarioDb.has(c.id);
        const b = el("button", { type: "button", class: "btn-mini" + (tiene ? " con-dato" : ""), text: tiene ? "Diario ✓" : "Diario", disabled: !editable });
        b.addEventListener("click", () => abrirDiario(c));
        caja.append(b);
      }
    });
    const rc = document.getElementById("resumen-cocinados"); if (rc) rc.textContent = cocinados;
  };

  // Días que ya han pasado: ocultos, con un enlace para verlos.
  let verPasados = false;
  const ocultarPasados = () => {
    document.querySelectorAll("table.semana").forEach((t) => {
      const fila = [...t.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("td[data-celda]"));
      if (!fila) return;
      const pasados = [...fila.querySelectorAll("td[data-celda]")].map((td) => {
        const [, sem, dia] = /^(.+)-(\d)-[a-z]+$/.exec(td.dataset.celda);
        return fechaCelda({ sem, dia: Number(dia) }) < HOY;
      });
      t.querySelectorAll("tr").forEach((tr) => [...tr.children].slice(1).forEach((cel, i) => (cel.hidden = !verPasados && pasados[i])));
      const n = pasados.filter(Boolean).length;
      const cont = t.closest(".semana-scroll");
      let nota = cont.previousElementSibling;
      if (!nota || !nota.classList.contains("aviso-pasados")) {
        if (!n) return;
        nota = el("p", { class: "sub aviso-pasados" });
        cont.before(nota);
      }
      const b = el("button", { type: "button", class: "enlace", text: verPasados ? "Ocultarlos" : "Mostrarlos" });
      b.addEventListener("click", () => { verPasados = !verPasados; ocultarPasados(); });
      nota.replaceChildren(verPasados ? "Se muestran también los días que ya han pasado. " : (n === 7 ? "Esta semana ya ha pasado entera. " : "Se ocultan los días que ya han pasado. "), b);
    });
  };
  ocultarPasados();

  // ================= Diálogo del diario =================
  const dlgD = document.getElementById("dlg-diario");
  const formD = document.getElementById("form-diario");
  const selD = document.getElementById("dlg-diario-receta");
  let celdaDiario = null;
  Object.entries(REC).filter(([, r]) => !r.cat.includes("desayuno")).sort((a, b) => a[1].n.localeCompare(b[1].n, "es"))
    .forEach(([id, r]) => selD.append(el("option", { value: id, text: r.n })));
  const abrirDiario = (c) => {
    celdaDiario = c;
    const d = diarioDb.get(c.id) || {};
    document.getElementById("dlg-diario-titulo").textContent = "Diario · " + DIAS[c.dia] + " " + fechaCorta(fechaCelda(c)).split(" ").slice(1).join(" ") + ", " + COMIDA_TXT[c.comida].toLowerCase();
    document.getElementById("dlg-diario-previsto").textContent = "Previsto: " + c.platos.map(nombreRec).join(" + ") + " (" + conAlias(c.quien.join(", ")) + ")";
    formD.tipo.value = d.tipo || "previsto";
    selD.value = d.receta || c.platos[0] || "";
    formD.texto.value = d.texto || "";
    formD.nota.value = d.nota || "";
    formD.querySelector(".estado-form").textContent = "";
    dlgD.showModal();
  };
  selD.addEventListener("change", () => (formD.tipo.value = "receta"));
  formD.texto.addEventListener("input", () => (formD.tipo.value = "texto"));
  formD.addEventListener("submit", async (ev) => {
    if (ev.submitter && ev.submitter.value === "cancelar") return;
    ev.preventDefault();
    const c = celdaDiario, tipo = formD.tipo.value, nota = formD.nota.value.trim();
    const estado = formD.querySelector(".estado-form");
    if (tipo === "texto" && !formD.texto.value.trim()) { estado.textContent = "Escribe qué se comió."; formD.texto.focus(); return; }
    try {
      if (tipo === "previsto" && !nota) { await db.doc("diario/" + c.id).delete(); diarioDb.delete(c.id); }
      else {
        const doc = { celda: c.id, tipo, nota, fecha: new Date().toISOString() };
        if (tipo === "receta") doc.receta = selD.value;
        if (tipo === "texto") doc.texto = formD.texto.value.trim();
        await db.doc("diario/" + c.id).set(doc); diarioDb.set(c.id, doc);
      }
      const que = tipo === "previsto" ? "lo previsto" : tipo === "receta" ? nombreRec(selD.value) : formD.texto.value.trim();
      await registrar("diario", "Diario del " + DIAS[c.dia].toLowerCase() + " (" + COMIDA_TXT[c.comida].toLowerCase() + "): se comió " + que + (nota ? " · " + nota : "") + ".");
      dlgD.close(); renderTodo(); aviso("Guardado en el diario.");
    } catch (e) { estado.textContent = "No se ha podido guardar (" + (e && e.code || "error") + ")."; }
  });

  // ================= Compra =================
  const CLAVE_LS = "agentemenu-compra2-" + document.title;
  let marcas = (() => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE_LS) || "[]")); } catch { return new Set(); } })();
  const guardarMarcas = () => { try { localStorage.setItem(CLAVE_LS, JSON.stringify([...marcas])); } catch {} };
  let listaCompra = [];
  const renderCompra = () => {
    listaCompra = [...necesidades().entries()].map(([k, x]) => {
      const tengo = tengoDe(k);
      return { k, nombre: x.nombre, unidad: x.unidad, g: x.g, tengo, comprar: redondear(x.g - tengo, k), recetas: [...x.recetas], pasillo: x.seccion || "Otros" };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const cont = document.getElementById("pasillos");
    const porPasillo = new Map();
    // Lo que ya está en casa no se muestra.
    listaCompra.filter((p) => p.comprar > 0).forEach((p) => porPasillo.set(p.pasillo, [...(porPasillo.get(p.pasillo) || []), p]));
    cont.replaceChildren();
    datos.ordenPasillos.filter((n) => porPasillo.has(n)).forEach((n) => {
      const items = porPasillo.get(n);
      const ul = el("ul");
      items.forEach((p) => {
        const id = "c-" + p.k;
        const chk = el("input", { type: "checkbox", id, checked: marcas.has(p.k) });
        chk.addEventListener("change", () => { chk.checked ? marcas.add(p.k) : marcas.delete(p.k); guardarMarcas(); actualizarBotonCompra(); });
        const para = p.recetas.slice(0, 2).join(" · ") + (p.recetas.length > 2 ? " y " + (p.recetas.length - 2) + " recetas más" : "");
        ul.append(el("li", null, chk, el("label", { htmlFor: id },
          el("span", { class: "producto", text: p.nombre }),
          el("span", { class: "cant mono", text: fmtCant(p.comprar, p.unidad) + equivalencia(p.k, p.comprar) }),
          el("span", { class: "para", text: para + (p.tengo ? " · en despensa " + fmtCant(p.tengo, p.unidad) : "") }))));
      });
      cont.append(el("section", { class: "pasillo" }, el("h3", null, n + " ", el("span", { class: "sub mono", text: String(items.length) })), ul));
    });
    if (!porPasillo.size) cont.append(el("p", { class: "sub", text: "No hace falta comprar nada: lo que queda de semana ya está en casa." }));
    const pendientes = listaCompra.filter((p) => p.comprar > 0).length;
    document.getElementById("compra-total").textContent = pendientes;
    const rc = document.getElementById("resumen-compra"); if (rc) rc.textContent = pendientes;
    actualizarBotonCompra();
  };
  const marcadosCompra = () => listaCompra.filter((p) => p.comprar > 0 && marcas.has(p.k));
  const btnCompra = document.getElementById("btn-confirmar-compra");
  const actualizarBotonCompra = () => {
    const n = marcadosCompra().length;
    document.getElementById("compra-marcados").textContent = n;
    btnCompra.hidden = !(n && !document.getElementById("compra").hidden && editable);
    btnCompra.textContent = "Confirmar compra (" + n + ")";
  };
  addEventListener("hashchange", actualizarBotonCompra);
  btnCompra.addEventListener("click", async () => {
    const items = marcadosCompra();
    if (!items.length || !db) return;
    btnCompra.disabled = true;
    try {
      for (const p of items) { await guardarProducto(p.nombre, tengoDe(p.k) + p.comprar, undefined, p.unidad); marcas.delete(p.k); }
      guardarMarcas();
      await registrar("compra", "Compra confirmada (" + items.length + " productos): " + items.map((p) => p.nombre + " " + fmtCant(p.comprar, p.unidad)).join(", ") + ".");
      aviso(items.length + " productos añadidos a la despensa.");
    } catch (e) { aviso("No se ha podido guardar la compra (" + (e && e.code || "error") + ")."); }
    btnCompra.disabled = false; renderTodo();
  });
  document.getElementById("desmarcar")?.addEventListener("click", () => { marcas.clear(); guardarMarcas(); renderCompra(); });
  document.getElementById("copiar-lista")?.addEventListener("click", () => {
    const porPasillo = new Map();
    listaCompra.filter((p) => p.comprar > 0 && !marcas.has(p.k)).forEach((p) => porPasillo.set(p.pasillo, [...(porPasillo.get(p.pasillo) || []), "- " + p.nombre + ": " + fmtCant(p.comprar, p.unidad) + equivalencia(p.k, p.comprar)]));
    const texto = datos.ordenPasillos.filter((n) => porPasillo.has(n)).map((n) => n + "\n" + porPasillo.get(n).join("\n")).join("\n\n");
    const av = document.getElementById("copiado");
    navigator.clipboard.writeText(texto).then(() => (av.textContent = "Lista copiada"), () => (av.textContent = "No se ha podido copiar; selecciona la lista a mano."));
  });

  // ================= Despensa =================
  const inventario = document.getElementById("inventario");
  const tablaDesp = document.getElementById("tabla-despensa");
  const renderDespensa = () => {
    const d = despensaActual();
    if (!tablaDesp.contains(document.activeElement)) {
      const porPasillo = new Map();
      [...necesidades().entries()].forEach(([k, x]) => { const p = x.seccion || "Otros"; porPasillo.set(p, [...(porPasillo.get(p) || []), [k, x]]); });
      tablaDesp.replaceChildren();
      datos.ordenPasillos.filter((n) => porPasillo.has(n)).forEach((n) => {
        tablaDesp.append(el("tr", { class: "grupo-despensa" }, el("th", { colSpan: 3, text: n })));
        porPasillo.get(n).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")).forEach(([k, x]) => {
          const inp = el("input", { type: "number", inputmode: "decimal", min: "0", step: "any", id: "d-" + k, value: d.get(k)?.cantidad ? String(d.get(k).cantidad) : "", placeholder: "0", disabled: !editable });
          inp.addEventListener("change", async () => {
            try { await guardarProducto(x.nombre, inp.value, undefined, x.unidad); } catch (e) { aviso("No se ha podido guardar."); }
            renderTodo();
          });
          tablaDesp.append(el("tr", null, el("td", null, el("label", { htmlFor: "d-" + k, text: x.nombre })),
            el("td", { class: "num mono", text: fmtCant(Math.round(x.g), x.unidad) }),
            el("td", { class: "num" }, el("span", { class: "tengo" }, inp, " ", el("span", { class: "mono", text: x.unidad || "g" })))));
        });
      });
    }
    const items = [...d.values()].filter((p) => Number(p.cantidad) > 0)
      .sort((a, b) => (a.caducidad || "9999").localeCompare(b.caducidad || "9999") || a.nombre.localeCompare(b.nombre, "es"));
    inventario.replaceChildren();
    if (!items.length) { inventario.append(el("li", { class: "sub", text: "Sin productos apuntados." })); return; }
    items.forEach((p) => {
      const li = el("li", null, el("span", { class: "producto", text: p.nombre }), el("span", { class: "mono", text: fmtCant(Number(p.cantidad), p.unidad || "g") }));
      if (p.caducidad) li.append(el("span", { class: "sub caduca", text: "caduca " + p.caducidad }));
      if (p.nota) li.append(el("span", { class: "sub nota-producto", text: p.nota }));
      if (editable) {
        const q = el("button", { type: "button", class: "enlace", text: "Quitar" });
        q.addEventListener("click", async () => { try { await guardarProducto(p.nombre, 0, undefined, p.unidad); } catch (e) {} renderTodo(); });
        li.append(q);
      }
      inventario.append(li);
    });
  };
  const formDesp = document.getElementById("form-despensa");
  formDesp.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(formDesp), estado = formDesp.querySelector(".estado-form");
    const nombre = String(f.get("nombre")).trim(), cant = Number(f.get("cantidad"));
    if (!nombre || !(cant > 0)) { estado.textContent = "Pon el producto y la cantidad en gramos."; return; }
    try {
      const k = clave(nombre, "g"), nombreFinal = despensaActual().get(k)?.nombre || nombreDe.get(k) || nombre;
      await guardarProducto(nombreFinal, tengoDe(k) + cant, String(f.get("caducidad") || "") || undefined);
      await registrar("despensa", "Añadido a la despensa: " + nombreFinal + " " + fmtG(cant) + ".");
      estado.textContent = "Añadido: " + nombreFinal + " (" + fmtG(tengoDe(k)) + " en total).";
      formDesp.reset(); formDesp.nombre.focus(); renderTodo();
    } catch (err) { estado.textContent = "No se ha podido guardar (" + (err && err.code || "error") + ")."; }
  });

  // ================= Raciones hechas (reservas) =================
  const sumarDias = (iso, dias, meses) => {
    const d = new Date(iso + "T12:00:00Z");
    if (meses) d.setUTCMonth(d.getUTCMonth() + meses); else d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const caducaReserva = (fecha, donde) => donde === "congelador" ? sumarDias(fecha, 0, 3) : sumarDias(fecha, 3, 0);
  const fechaCortaDia = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" }); } catch (e) { return iso; } };
  const fmtRacTxt = (n) => fmtNum(Number(n), Number(n) % 1 ? 1 : 0) + " rac.";
  const nombreReserva = (x) => (x.receta && datos.recetas[x.receta]) || x.descripcion || x.receta || "Reserva";
  const renderReservas = () => {
    const lista = reservasActuales().sort((a, b) => String(a.caduca || "9999").localeCompare(String(b.caduca || "9999")));
    const porReceta = new Map();
    lista.forEach((x) => { if (x.receta) porReceta.set(x.receta, [...(porReceta.get(x.receta) || []), x]); });
    document.querySelectorAll(".hecho[data-receta]").forEach((bloque) => {
      const suyas = porReceta.get(bloque.dataset.receta) || [];
      const p = bloque.querySelector(".reserva-receta");
      const total = suyas.reduce((s, x) => s + Number(x.reserva), 0);
      p.hidden = !total;
      p.textContent = total ? "En reserva: " + fmtRacTxt(total) + " · " + suyas.map((x) => (x.donde || "nevera") + (x.caduca ? " hasta el " + fechaCortaDia(x.caduca) : "")).join(" · ") : "";
      const tarjeta = bloque.closest(".receta");
      const cats = tarjeta.dataset.categorias.split(" ").filter((c) => c && c !== "reserva");
      if (total) cats.push("reserva");
      tarjeta.dataset.categorias = cats.join(" ");
    });
    const ul = document.getElementById("reservas");
    if (!ul) return;
    ul.replaceChildren();
    if (!lista.length) { ul.append(el("li", { class: "sub", text: "Sin reservas. Márcalas desde cada receta con «Marcar cantidad hecha»." })); return; }
    lista.forEach((x) => {
      const nombre = el(x.receta ? "a" : "span", { class: "producto", text: nombreReserva(x) });
      if (x.receta) nombre.href = "#r-" + x.receta;
      const det = el("span", { class: "sub nota-producto", text: (x.donde === "congelador" ? "Congelador" : "Nevera") + (x.fecha ? " · hecho el " + fechaCortaDia(x.fecha) : "") + (x.hechas ? " (" + fmtRacTxt(x.hechas) + " en total)" : "") });
      if (x.caduca) det.append(el("span", { class: x.caduca <= sumarDias(HOY, 1, 0) ? "vence" : "", text: " · consumir antes del " + fechaCortaDia(x.caduca) }));
      const li = el("li", null, nombre, el("span", { class: "mono", text: fmtRacTxt(x.reserva) }), det);
      if (editable) {
        const usar = el("button", { type: "button", class: "enlace", text: "Usar 1 ración" });
        usar.addEventListener("click", () => guardarReserva({ ...x, reserva: Math.max(0, Math.round((Number(x.reserva) - 1) * 10) / 10) }));
        const agotar = el("button", { type: "button", class: "enlace", text: "Ya no queda" });
        agotar.addEventListener("click", () => guardarReserva({ ...x, reserva: 0 }));
        li.append(usar, agotar);
      }
      ul.append(li);
    });
  };
  document.querySelectorAll('.form-hecho input[name="fecha"]').forEach((i) => { i.value = HOY; });
  document.querySelectorAll(".form-hecho").forEach((formH) => formH.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) return;
    const f = new FormData(formH), estado = formH.querySelector(".estado-form");
    const receta = formH.closest(".hecho").dataset.receta;
    const hechas = Number(f.get("hechas")) || 0, comer = Number(f.get("comer")) || 0;
    const reserva = Math.max(0, Math.round((hechas - comer) * 10) / 10);
    const fecha = String(f.get("fecha") || HOY), donde = String(f.get("donde"));
    await guardarReserva({ id: receta + "__" + Date.now(), receta, hechas, comer, reserva, donde, fecha, caduca: caducaReserva(fecha, donde), semana: ACTUAL });
    estado.textContent = reserva > 0 ? "Guardado: " + fmtRacTxt(reserva) + " en reserva (" + donde + ")." : "Guardado: se come todo esta semana, no queda reserva.";
    formH.closest("details").open = false;
  }));

  // ================= No deseados =================
  const renderNoDeseados = () => {
    const porReceta = new Map();
    noDeseadosActuales().forEach((n) => porReceta.set(n.receta, [...(porReceta.get(n.receta) || []), n]));
    document.querySelectorAll(".no-deseado[data-receta]").forEach((bloque) => {
      const lista = porReceta.get(bloque.dataset.receta) || [];
      const ul = bloque.querySelector(".marcas"); ul.replaceChildren();
      lista.forEach((n) => {
        const li = el("li", null, el("strong", { text: "No deseado · " + (n.por === "familia" ? "toda la familia" : n.por) }), el("span", { text: ": " + n.motivo }));
        if (editable) { const q = el("button", { type: "button", class: "enlace", text: "Quitar" }); q.addEventListener("click", () => guardarNoDeseado({ ...n, quitado: true })); li.append(" ", q); }
        ul.append(li);
      });
      bloque.closest(".receta").dataset.nd = lista.length ? "1" : "0";
    });
    document.querySelectorAll('.semana a[href^="#r-"]').forEach((a) => {
      const lista = porReceta.get(a.getAttribute("href").slice(3)) || [];
      let badge = a.nextElementSibling && a.nextElementSibling.classList.contains("badge-nd") ? a.nextElementSibling : null;
      if (!lista.length) { if (badge) badge.remove(); return; }
      if (!badge) { badge = el("span", { class: "badge-nd" }); a.after(badge); }
      badge.textContent = conAlias("No deseado: " + lista.map((n) => (n.por === "familia" ? "familia" : n.por)).join(", "));
      badge.title = conAlias(lista.map((n) => n.por + ": " + n.motivo).join(" · "));
    });
  };
  document.querySelectorAll(".form-nd").forEach((formNd) => formNd.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) return;
    const f = new FormData(formNd), estado = formNd.querySelector(".estado-form");
    const receta = formNd.closest(".no-deseado").dataset.receta;
    try {
      await guardarNoDeseado({ receta, por: String(f.get("por")), motivo: String(f.get("motivo")).trim() });
      estado.textContent = "Guardado. No se volverá a proponer a " + (f.get("por") === "familia" ? "la familia" : f.get("por")) + ".";
      formNd.reset(); formNd.closest("details").open = false;
    } catch (err) { estado.textContent = "No se ha podido guardar (" + (err && err.code || "error") + ")."; }
  }));

  // ================= Diario (página) =================
  const renderDiario = () => {
    const tb = document.getElementById("diario-cambios"); tb.replaceChildren();
    const filas = [];
    celdas.forEach((c) => { const e = efectivo(c); if (e.origen !== "menu" || e.nota) filas.push([fechaCelda(c), c, e]); });
    filas.sort((a, b) => a[0].localeCompare(b[0]) || a[1].id.localeCompare(b[1].id));
    filas.forEach(([f, c, e]) => tb.append(el("tr", null, el("td", { text: fechaCorta(f) }), el("td", { text: COMIDA_TXT[c.comida] }),
      el("td", { text: c.platos.map(nombreRec).join(" + ") }),
      el("td", { text: e.origen === "menu" ? "Lo previsto" : (e.recetas.length ? e.recetas.map(nombreRec).join(" + ") + (e.comensales ? " (comen " + e.comensales.join(", ") + ")" : "") : e.texto) }),
      el("td", null, e.origen === "menu" ? "—" : el("span", { class: "origen " + e.origen, text: e.origen === "diario" ? "Diario" : "Claude" })),
      el("td", { text: [e.motivo, e.nota].filter(Boolean).join(" · ") || "—" }))));
    if (!filas.length) tb.append(el("tr", null, el("td", { colSpan: 6, class: "sub", text: "Sin cambios: se está comiendo lo previsto." })));

    const tc = document.getElementById("diario-cocinado"); tc.replaceChildren();
    const coc = [...cocinadoDb.entries()].map(([inst, d]) => [celdas.get(d.celda || inst.split("~")[0]), d]).filter(([c]) => c)
      .sort((a, b) => fechaCelda(a[0]).localeCompare(fechaCelda(b[0])));
    coc.forEach(([c, d]) => tc.append(el("tr", null, el("td", { text: fechaCorta(fechaCelda(c)) }),
      el("td", { text: COMIDA_TXT[c.comida] + (d.etiqueta && c.comida !== "desayuno" ? " · " + d.etiqueta : "") }),
      el("td", { text: c.comida === "desayuno" ? "Desayunos fijos" : (d.recetas || []).map(nombreRec).join(", ") }),
      el("td", { class: "num mono", text: c.comida === "desayuno" ? "—" : fmtRac(d.raciones) }))));
    if (!coc.length) tc.append(el("tr", null, el("td", { colSpan: 4, class: "sub", text: "Todavía no se ha marcado nada como cocinado." })));

    const ul = document.getElementById("diario-actividad"); ul.replaceChildren();
    eventos.slice(0, 60).forEach((ev) => {
      const f = new Date(ev.fecha);
      ul.append(el("li", null, el("span", { class: "sub mono", text: f.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " + f.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) }), el("span", { text: ev.texto })));
    });
    if (!eventos.length) ul.append(el("li", { class: "sub", text: "Sin actividad todavía." }));
  };
  const renderComentarios = () => {
    const ul = document.getElementById("diario-comentarios"); if (!ul) return;
    ul.replaceChildren();
    comentarios.forEach((x) => {
      const f = new Date(x.fecha);
      const texto = el("span", { text: x.texto });
      if (editable) {
        const q = el("button", { type: "button", class: "enlace", text: "Quitar" });
        q.addEventListener("click", async () => { try { await db.doc("comentarios/" + x.id).delete(); } catch (e) { aviso("No se ha podido quitar."); } });
        texto.append(" ", q);
      }
      ul.append(el("li", null, el("span", { class: "sub mono", text: f.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }) }), texto));
    });
    if (!comentarios.length) ul.append(el("li", { class: "sub", text: "Sin comentarios." }));
  };
  const formCom = document.getElementById("form-comentario");
  formCom?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = formCom.texto.value.trim(), estado = formCom.querySelector(".estado-form");
    if (!texto || !db) return;
    try {
      const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      await db.doc("comentarios/" + id).set({ texto: texto.slice(0, 500), fecha: new Date().toISOString() });
      await registrar("comentario", "Comentario: " + texto.slice(0, 500));
      formCom.reset(); estado.textContent = "Guardado. Claude lo tendrá en cuenta al actualizar el menú.";
    } catch (err) { estado.textContent = "No se ha podido guardar (" + (err && err.code || "error") + ")."; }
  });

  // ================= Actualizar menú con Claude =================
  const dlgA = document.getElementById("dlg-actualizar");
  const actCuerpo = document.getElementById("act-cuerpo"), actEstado = document.getElementById("act-estado"), actBotones = document.getElementById("act-botones");
  let sample = null, abortar = null;
  const modificables = () => [...celdas.values()].filter((c) => fechaCelda(c) > HOY && c.comida !== "desayuno" && c.platos.length &&
    !c.sobras && c.racCocinar === c.rac && !diarioDb.has(c.id));
  const botonesA = (...b) => actBotones.replaceChildren(...b);
  const cerrarBtn = () => { const b = el("button", { type: "button", class: "secundario", text: "Cerrar" }); b.addEventListener("click", () => { abortar?.abort(); dlgA.close(); }); return b; };
  const abrirActualizar = () => {
    const nDiario = [...celdas.values()].filter((c) => efectivo(c).origen === "diario").length;
    actEstado.textContent = "";
    actCuerpo.replaceChildren(
      el("p", { text: nDiario ? "Lo apuntado en el diario (" + nDiario + " comidas) ya está puesto en el menú." : "No hay nada apuntado en el diario todavía." }),
      el("p", { text: "Claude revisará los " + modificables().length + " platos de los días que quedan (a partir de mañana) con el diario, los comentarios, lo cocinado y la despensa, y te propondrá cambios. Nada se cambia hasta que lo apliques." }));
    const pedir = el("button", { type: "button", class: "btn-principal", text: "Pedir propuesta a Claude", disabled: !sample || !editable });
    if (!sample) actEstado.textContent = "Para pedir la propuesta hay que abrir la página en claude.ai.";
    pedir.addEventListener("click", pedirPropuesta);
    botonesA(pedir, cerrarBtn());
    dlgA.showModal();
  };
  document.querySelectorAll(".btn-actualizar").forEach((b) => b.addEventListener("click", abrirActualizar));

  const contexto = () => {
    const pasadas = [...celdas.values()].filter((c) => fechaCelda(c) <= HOY && c.comida !== "desayuno" && c.platos.length).map((c) => {
      const e = efectivo(c);
      return { fecha: fechaCelda(c), comida: c.comida, previsto: c.platos.map(nombreRec), comido: e.origen === "menu" ? "lo previsto" : (e.recetas.length ? e.recetas.map(nombreRec).join(" + ") : e.texto), nota: e.nota || undefined };
    });
    const futuras = modificables().map((c) => ({ celda: c.id, fecha: fechaCelda(c), dia: DIAS[c.dia], comida: c.comida, comensales: efectivo(c).comensales || c.quien, platos: efectivo(c).recetas.map((r) => ({ id: r, nombre: nombreRec(r) })) }));
    const fijas = [...celdas.values()].filter((c) => fechaCelda(c) > HOY && c.comida !== "desayuno" && c.platos.length && !futuras.some((f) => f.celda === c.id))
      .map((c) => ({ fecha: fechaCelda(c), comida: c.comida, platos: efectivo(c).recetas.map(nombreRec) }));
    return {
      hoy: HOY, normas: datos.normas, factoresRacion: datos.factores, nombres: ALIAS,
      comentariosDeLaFamilia: comentarios.map((x) => ({ fecha: String(x.fecha).slice(0, 10), texto: x.texto })),
      noDeseados: noDeseadosActuales().map((n) => ({ receta: n.receta, quien: n.por, motivo: n.motivo })),
      comidasHastaHoy: pasadas, platosQueNoSeTocan: fijas, platosRevisables: futuras,
      despensa: [...despensaActual().values()].filter((p) => Number(p.cantidad) > 0).map((p) => ({ nombre: p.nombre, gramos: Math.round(p.cantidad), caduca: p.caducidad })),
      recetario: Object.entries(REC).filter(([, r]) => !r.cat.includes("desayuno")).map(([id, r]) => ({ id, nombre: r.n, tipo: r.cat.join(" ") })),
    };
  };
  const pedirPropuesta = async () => {
    const ctx = contexto();
    if (!ctx.platosRevisables.length) { actEstado.textContent = "No quedan platos que revisar en el menú."; return; }
    const prompt = "Eres el planificador del menú semanal de una familia española. Revisa SOLO los platos de 'platosRevisables' (días posteriores a hoy) teniendo en cuenta lo que se ha comido de verdad hasta hoy ('comidasHastaHoy': si se comió otra cosa distinta de lo previsto, reequilibra el resto de la semana: legumbre, pescado, verdura, no repetir lo ya comido), lo que hay en la despensa (aprovecha lo que haya, sobre todo lo que caduca antes), las normas de la casa, los platos no deseados y los comentarios de la familia (por ejemplo, si alguien no come en casa ciertos días, quítalo de 'comensales' en esas casillas; si nadie come, no incluyas la casilla). Cambia solo lo que tenga un motivo claro y explícalo con datos de la entrada; no inventes peticiones de la familia. Si todo está bien, no cambies nada. Usa únicamente ids del 'recetario', adecuados al tipo de comida (almuerzo, comida, merienda o cena). Cada casilla lleva 1 o 2 recetas. 'comensales' es opcional: ponlo solo si cambia quién come (códigos " + datos.miembros.join(", ") + "; en 'nombres' está el nombre de cada código, que es como la familia se refiere a ellos en los comentarios).\n\nDevuelve solo JSON con esta forma: {\"resumen\": \"una o dos frases en español\", \"cambios\": [{\"celda\": \"id de platosRevisables\", \"recetas\": [\"id del recetario\"], \"comensales\": [\"" + datos.miembros[0] + "\"], \"motivo\": \"frase corta en español\"}]}\n\nDatos:\n" + JSON.stringify(ctx);
    botonesA(el("button", { type: "button", class: "btn-principal", text: "Pensando…", disabled: true }), cerrarBtn());
    actEstado.textContent = "Claude está revisando el menú. Puede tardar un minuto.";
    abortar = new AbortController();
    try {
      const r = await sample.json(prompt, { signal: abortar.signal, cache: false, modelTier: "default" });
      const validas = new Set(ctx.platosRevisables.map((p) => p.celda));
      const cambios = (Array.isArray(r && r.cambios) ? r.cambios : []).map((x) => {
        if (!x || !validas.has(x.celda) || !Array.isArray(x.recetas) || x.recetas.length < 1 || x.recetas.length > 2 || !x.recetas.every((id) => REC[id])) return null;
        const c = celdas.get(x.celda), e = efectivo(c);
        const com = Array.isArray(x.comensales) ? [...new Set(x.comensales.filter((q) => datos.factores[q]))] : null;
        const comAhora = e.comensales || c.quien;
        const out = { celda: x.celda, recetas: x.recetas, motivo: x.motivo };
        if (com && com.length && com.slice().sort().join() !== comAhora.slice().sort().join()) out.comensales = com;
        else if (e.comensales) out.comensales = e.comensales;
        if (out.recetas.join() === e.recetas.join() && (out.comensales || c.quien).slice().sort().join() === comAhora.slice().sort().join()) return null;
        return out;
      }).filter(Boolean);
      mostrarPropuesta(String(r && r.resumen || ""), cambios);
    } catch (e) {
      const msg = { not_granted: "No se ha dado permiso para consultar a Claude.", rate_limited: "Demasiadas consultas seguidas. Prueba dentro de un rato.", cancelled: "Consulta cancelada." }[e && e.code] || "No se ha podido obtener la propuesta (" + (e && e.code || "error") + ").";
      actEstado.textContent = msg;
      const otra = el("button", { type: "button", class: "btn-principal", text: "Pedir propuesta a Claude" }); otra.addEventListener("click", pedirPropuesta);
      botonesA(otra, cerrarBtn());
    }
  };
  const mostrarPropuesta = (resumen, cambios) => {
    actEstado.textContent = "";
    const lista = el("ul", { class: "propuestas" });
    cambios.forEach((x, n) => {
      const c = celdas.get(x.celda), id = "prop-" + n;
      lista.append(el("li", null, el("input", { type: "checkbox", id, checked: true, "data-n": String(n) }),
        el("label", { htmlFor: id }, el("strong", { text: DIAS[c.dia] + " " + fechaCorta(fechaCelda(c)).split(" ").slice(1).join(" ") + " · " + COMIDA_TXT[c.comida] + ": " }),
          efectivo(c).recetas.map(nombreRec).join(" + ") + " → " + x.recetas.map(nombreRec).join(" + ") + (x.comensales ? " · comen " + x.comensales.join(", ") : "")),
        el("span", { class: "motivo", text: x.motivo || "" })));
    });
    actCuerpo.replaceChildren(el("p", { text: resumen || "Propuesta de Claude:" }), cambios.length ? lista : el("p", { class: "sub", text: "Claude no ve necesario cambiar nada." }));
    const aplicar = el("button", { type: "button", class: "btn-principal", text: "Aplicar los marcados", disabled: !cambios.length });
    aplicar.addEventListener("click", async () => {
      const elegidos = [...lista.querySelectorAll("input:checked")].map((i) => cambios[Number(i.dataset.n)]);
      aplicar.disabled = true;
      try {
        for (const x of elegidos) {
          const doc = { celda: x.celda, recetas: x.recetas, motivo: String(x.motivo || "").slice(0, 300), fecha: new Date().toISOString() };
          if (x.comensales) doc.comensales = x.comensales;
          await db.doc("cambios/" + x.celda).set(doc); cambiosDb.set(x.celda, doc);
        }
        await registrar("actualizacion", "Menú actualizado con Claude: " + elegidos.length + " cambios. " + resumen);
        dlgA.close(); renderTodo(); aviso(elegidos.length ? "Menú actualizado." : "Sin cambios.");
      } catch (e) { actEstado.textContent = "No se han podido guardar los cambios (" + (e && e.code || "error") + ")."; aplicar.disabled = false; }
    });
    botonesA(aplicar, cerrarBtn());
  };

  // ================= Fichas de las personas: peso, objetivo, gustos y desayuno =================
  // Se guardan en la colección «perfil» (un documento por persona). La ficha se recalcula al momento;
  // el menú y la compra se ajustan cuando se copian al proyecto y se regenera la página.
  const PERF = datos.perfiles, K = datos.constantes;
  let perfilDb = new Map();
  const perfil = (id) => {
    const base = PERF[id], d = perfilDb.get(id) || {};
    return { ...base, pesoKg: d.pesoKg ?? base.pesoKg, objetivo: d.objetivo ?? base.objetivo, gustos: d.gustos ?? base.gustos,
      desayunoTexto: d.desayuno ? d.desayuno.texto : null, desayunoFecha: d.desayuno ? d.desayuno.fecha : null, pesos: d.pesos || [] };
  };
  const energia = (p, peso) => {
    const tmb = p.tmbPorKg * peso + p.tmbFija;
    const gasto = tmb * K.factorBase + p.deportePorKg * peso;
    const kcal = p.objetivo ? p.objetivo.kcalDiarias : Math.round(gasto);
    return { tmb, gasto, kcal, imc: peso / Math.pow(p.alturaCm / 100, 2), racion: kcal / K.kcalReferencia };
  };
  const estadoImc = (p, imc) => (!p.adulto ? ["info", "Menor: percentiles"] : imc < 18.5 ? ["aviso", "Bajo peso"]
    : imc < 25 ? ["bien", "Normopeso"] : imc < 30 ? ["aviso", "Sobrepeso"] : ["aviso", "Obesidad"]);
  const posImc = (v) => ((Math.min(Math.max(v, K.imcMin), K.imcMax) - K.imcMin) / (K.imcMax - K.imcMin)) * 100;
  const fmtDia = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const huecoDe = (id, campo) => document.querySelector('[data-m="' + id + '"][data-campo="' + campo + '"]');

  const renderPerfiles = () => {
    Object.keys(PERF).forEach((id) => {
      const p = perfil(id), e = energia(p, p.pesoKg);
      const poner = (campo, txt) => { const x = huecoDe(id, campo); if (x) x.textContent = txt; };
      poner("peso", fmtNum(p.pesoKg, 1) + " kg");
      poner("imc", fmtNum(e.imc, 1));
      poner("tmb", fmtNum(e.tmb)); poner("gasto", fmtNum(e.gasto)); poner("kcal", fmtNum(e.kcal)); poner("racion", "×" + fmtNum(e.racion, 2));
      const [clase, txt] = estadoImc(p, e.imc);
      const est = huecoDe(id, "estado"); if (est) { est.className = "chip " + clase; est.textContent = txt; }
      const marca = huecoDe(id, "imc-marca"); if (marca) marca.style.left = posImc(e.imc) + "%";
      const hist = huecoDe(id, "historial-peso");
      if (hist) {
        hist.replaceChildren();
        if (p.pesos.length) hist.append(el("ul", { class: "historial-peso", "aria-label": "Últimos pesos" },
          p.pesos.slice(-5).reverse().map((x) => el("li", null, el("span", { text: fmtDia(x.fecha) }), el("span", { class: "mono", text: fmtNum(x.kg, 1) + " kg" })))));
      }
      const obj = huecoDe(id, "objetivo");
      if (obj) {
        const o = p.objetivo;
        obj.replaceChildren(o
          ? el("p", { class: "nota bien-borde" }, el("strong", { text: "Objetivo acordado: " }),
            fmtNum(o.pesoObjetivoKg, 1) + " kg en " + o.semanas + " semanas · " + fmtNum(o.kcalDiarias) + " kcal/día" + (o.fechaInicio ? " (desde el " + fmtDia(o.fechaInicio) + ")" : ""))
          : !p.adulto ? el("p", { class: "nota", text: "Sin restricciones calóricas: prioridad al crecimiento y al deporte. Dudas de peso, con su pediatra." })
          : e.imc >= 25 ? el("p", { class: "nota aviso-borde", text: "IMC por encima de 25 y sin objetivo acordado. Con «Cambiar objetivo» se calcula una propuesta. Conviene consultarlo con su médico." })
          : el("p", { class: "nota", text: "Sin objetivo de peso: está en normopeso." }));
      }
      const gus = huecoDe(id, "gustos");
      if (gus) gus.replaceChildren(p.gustos.length ? p.gustos.join(", ") : el("span", { class: "sub", text: "Sin indicar" }));
      const des = huecoDe(id, "desayuno");
      if (des && p.desayunoTexto) des.replaceChildren(p.desayunoTexto, el("br"), el("span", { class: "sub",
        text: "Apuntado el " + fmtDia(p.desayunoFecha) + (p.desayuno ? ". La lista de la compra sigue contando «" + p.desayuno + "» hasta que se pase a receta." : ".") }));
    });
    document.querySelectorAll(".botones-ficha").forEach((b) => (b.hidden = !editable));
  };

  const dlgP = document.getElementById("dlg-perfil");
  const cuerpoP = document.getElementById("dlg-perfil-cuerpo");
  const estadoP = document.getElementById("dlg-perfil-estado");
  const botonesP = document.getElementById("dlg-perfil-botones");
  const botonP = (texto, fn, principal) => { const b = el("button", { type: "button", class: principal ? "btn-principal" : "secundario", text: texto }); b.addEventListener("click", fn); return b; };
  const cancelarP = () => botonP("Cancelar", () => dlgP.close());
  const abrirPerfil = (titulo, cuerpo, botones) => {
    document.getElementById("dlg-perfil-titulo").textContent = titulo;
    cuerpoP.replaceChildren(...cuerpo); estadoP.textContent = ""; botonesP.replaceChildren(...botones);
    dlgP.showModal();
  };
  const guardarPerfil = async (id, cambios, evento) => {
    const doc = { ...(perfilDb.get(id) || {}), ...cambios, actualizado: new Date().toISOString() };
    try {
      await db.doc("perfil/" + id).set(doc);
      perfilDb.set(id, doc);
      await registrar("perfil", evento);
      dlgP.close(); renderPerfiles(); aviso("Guardado.");
    } catch (e) { estadoP.textContent = "No se ha podido guardar (" + (e && e.code || "error") + ")."; }
  };
  const nom = (id) => ALIAS[id] || id;
  const campoNum = (etq, valor, attrs) => { const i = el("input", { type: "number", inputmode: "decimal", value: String(valor), ...attrs }); return [i, el("label", null, etq, i)]; };

  const editarPeso = (id) => {
    const p = perfil(id);
    const [inp, lab] = campoNum("Peso (kg)", p.pesoKg, { min: "20", max: "250", step: "0.1" });
    abrirPerfil("Peso de " + nom(id), [lab, p.objetivo ? el("p", { class: "sub", text: "Tiene un objetivo acordado: las kcal del día no cambian con el peso. Si hace falta, cambia también el objetivo." }) : null].filter(Boolean), [
      botonP("Guardar", () => {
        const kg = Math.round(Number(inp.value) * 10) / 10;
        if (!(kg >= 20 && kg <= 250)) { estadoP.textContent = "Escribe un peso entre 20 y 250 kg."; return; }
        const pesos = p.pesos.filter((x) => x.fecha !== HOY).concat({ fecha: HOY, kg });
        guardarPerfil(id, { pesoKg: kg, pesos }, nom(id) + ": peso " + fmtNum(kg, 1) + " kg");
      }, true), cancelarP()]);
    inp.focus();
  };

  const editarObjetivo = (id) => {
    const p = perfil(id), e = energia(p, p.pesoKg);
    const h2 = Math.pow(p.alturaCm / 100, 2);
    const pesoSano = Math.round(24.9 * h2 * 10) / 10;
    const pesoIni = p.objetivo ? p.objetivo.pesoObjetivoKg : (e.imc >= 25 ? pesoSano : p.pesoKg);
    const semIni = p.objetivo ? p.objetivo.semanas : Math.max(1, Math.ceil(Math.abs(p.pesoKg - pesoIni) / K.perdidaKgSemana));
    const [inpPeso, labPeso] = campoNum("Peso objetivo (kg)", pesoIni, { min: "30", max: "250", step: "0.1" });
    const [inpSem, labSem] = campoNum("Plazo (semanas)", semIni, { min: "1", max: "104", step: "1" });
    const resultado = el("div", { class: "resultado-objetivo", "aria-live": "polite" });
    let propuesta = null;
    const calcular = () => {
      propuesta = null;
      const objetivo = Math.round(Number(inpPeso.value) * 10) / 10, semanas = Math.round(Number(inpSem.value));
      const errores = [];
      if (!(objetivo >= 30 && objetivo <= 250)) errores.push("Escribe un peso objetivo entre 30 y 250 kg.");
      if (!(semanas >= 1 && semanas <= 104)) errores.push("Escribe un plazo entre 1 y 104 semanas.");
      if (errores.length) return mostrar(errores);
      const kg = p.pesoKg - objetivo, ritmo = Math.abs(kg) / semanas;
      const kcal = Math.round(e.gasto - (kg * K.kcalPorKg) / (semanas * 7));
      if (objetivo / h2 < 18.5) errores.push("Ese peso queda por debajo de lo saludable (IMC " + fmtNum(objetivo / h2, 1) + "; el mínimo es 18,5, unos " + fmtNum(Math.ceil(18.5 * h2 * 10) / 10, 1) + " kg).");
      if (ritmo > K.perdidaMaxima) errores.push("Es demasiado rápido: " + fmtNum(ritmo, 2) + " kg por semana. No conviene pasar de " + fmtNum(K.perdidaMaxima) + " kg por semana; alarga el plazo.");
      else if (kg > 0 && kcal < e.tmb) errores.push("Tendría que comer " + fmtNum(kcal) + " kcal al día, por debajo de su metabolismo basal (" + fmtNum(e.tmb) + " kcal). Alarga el plazo.");
      if (errores.length) return mostrar(errores);
      const fin = new Date(HOY + "T12:00:00"); fin.setDate(fin.getDate() + semanas * 7);
      propuesta = { pesoObjetivoKg: objetivo, semanas, kcalDiarias: kcal, fechaInicio: HOY, notas: "Cambiado desde la web" };
      const accion = kg > 0 ? "Perder " + fmtNum(kg, 1) + " kg" : kg < 0 ? "Ganar " + fmtNum(-kg, 1) + " kg" : "Mantener el peso";
      mostrar([], [
        el("p", { class: "nota" }, el("strong", { text: accion + " en " + semanas + " semanas" }),
          (kg ? " (" + fmtNum(ritmo, 2) + " kg por semana)" : "") + ": unas " + fmtNum(kcal) + " kcal al día (ahora gasta unas " + fmtNum(e.gasto) + "). Fecha prevista: " + fmtDia(isoLocal(fin)) + "."),
        el("p", { class: "sub", text: "Conviene consultarlo con su médico." }),
        el("p", { text: "¿Aceptar este objetivo?" }),
      ]);
    };
    const mostrar = (errores, contenido) => {
      resultado.replaceChildren(...(errores.length ? errores.map((x) => el("p", { class: "nota aviso-borde", text: x })) : contenido));
      botonesP.replaceChildren(...(propuesta
        ? [botonP("Sí, aceptar", () => guardarPerfil(id, { objetivo: propuesta },
            nom(id) + ": nuevo objetivo, " + fmtNum(propuesta.pesoObjetivoKg, 1) + " kg en " + propuesta.semanas + " semanas (" + fmtNum(propuesta.kcalDiarias) + " kcal/día)"), true),
          botonP("No", () => { dlgP.close(); aviso("El objetivo no ha cambiado."); })]
        : [botonP("Calcular", calcular, true), cancelarP()]));
    };
    [inpPeso, inpSem].forEach((i) => i.addEventListener("input", () => { if (propuesta) { propuesta = null; resultado.replaceChildren(); mostrar([], []); } }));
    abrirPerfil("Objetivo de " + nom(id), [
      el("p", { class: "sub", text: "Peso actual: " + fmtNum(p.pesoKg, 1) + " kg." + (p.objetivo ? " Objetivo actual: " + fmtNum(p.objetivo.pesoObjetivoKg, 1) + " kg en " + p.objetivo.semanas + " semanas." : "") + " Cambia el peso objetivo, el plazo o los dos y pulsa «Calcular»." }),
      el("div", { class: "fila-campos" }, labPeso, labSem), resultado,
    ], [botonP("Calcular", calcular, true), cancelarP()]);
    inpPeso.focus();
  };

  const editarTexto = (id, que) => {
    const p = perfil(id);
    const esGustos = que === "gustos";
    const area = el("textarea", { rows: esGustos ? 4 : 3, value: esGustos ? p.gustos.join("\n") : (p.desayunoTexto || p.desayuno || "") });
    abrirPerfil((esGustos ? "Gustos de " : "Desayuno de ") + nom(id), [
      el("label", null, esGustos ? "Uno por línea (por ejemplo: «No le gusta el pescado»)" : "Qué desayuna", area),
      esGustos ? null : el("p", { class: "sub", text: "Texto libre. La lista de la compra seguirá contando el desayuno actual" + (p.desayuno ? " («" + p.desayuno + "»)" : "") + " hasta que Claude lo pase a receta." }),
    ].filter(Boolean), [
      botonP("Guardar", () => {
        if (esGustos) {
          const gustos = area.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
          guardarPerfil(id, { gustos }, nom(id) + ": gustos «" + (gustos.join(", ") || "sin indicar") + "»");
        } else {
          const texto = area.value.trim().slice(0, 300);
          if (!texto) { estadoP.textContent = "Escribe qué desayuna."; return; }
          guardarPerfil(id, { desayuno: { texto, fecha: HOY } }, nom(id) + ": desayuno «" + texto + "»");
        }
      }, true), cancelarP()]);
    area.focus();
  };

  document.querySelectorAll(".botones-ficha").forEach((caja) => caja.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || !editable) return;
    const id = caja.dataset.m, tipo = caja.dataset.editar;
    if (tipo === "peso") editarPeso(id);
    else if (tipo === "objetivo") editarObjetivo(id);
    else editarTexto(id, b.dataset.que);
  }));

  // ================= Ids antiguos de las casillas =================
  // Hasta el 30/09/2026 las casillas se llamaban por la letra de la semana («A-3-cena»). Ahora se llaman
  // por su lunes («2026-09-28-3-cena») para que no choquen al rotar las semanas. Lo guardado con el
  // formato antiguo se traslada al nuevo la primera vez que se abre la página con permiso de edición.
  const LEGADO = { A: "2026-09-28", B: "2026-10-05" };
  const idNuevo = (id) => { const m = /^([AB])-(\d-.+)$/.exec(String(id)); return m ? LEGADO[m[1]] + "-" + m[2] : id; };
  const trasladados = new Set();
  const migrar = (col, m) => {
    if (!["diario", "cambios", "cocinado"].includes(col)) return m;
    const out = new Map([...m].filter(([k]) => idNuevo(k) === k));
    m.forEach((v, k) => {
      const nk = idNuevo(k);
      if (nk === k) return;
      const nv = v && v.celda ? { ...v, celda: idNuevo(v.celda) } : v;
      const yaEsta = out.has(nk);
      if (!yaEsta) out.set(nk, nv);
      if (editable && !trasladados.has(col + "/" + k)) {
        trasladados.add(col + "/" + k);
        (async () => { try { if (!yaEsta) await db.doc(col + "/" + nk).set(nv); await db.doc(col + "/" + k).delete(); } catch (e) {} })();
      }
    });
    return out;
  };

  // ================= Arranque =================
  const renderTodo = () => { renderMenu(); renderCompra(); renderDespensa(); renderReservas(); renderNoDeseados(); renderDiario(); renderComentarios(); renderPerfiles(); };
  const avisoDb = document.getElementById("despensa-aviso");
  const soloLectura = (motivo) => {
    editable = false;
    document.querySelectorAll("[data-solo-editable]").forEach((x) => (x.hidden = true));
    document.querySelectorAll("[data-solo-editable-input]").forEach((x) => (x.disabled = true));
    if (avisoDb) avisoDb.textContent = motivo;
    renderTodo();
  };
  renderTodo();
  (async () => {
    db = window.claude && window.claude.use ? await window.claude.use("db") : null;
    if (!db) { soloLectura("La despensa, el diario y los platos cocinados solo se pueden editar abriendo esta página en claude.ai. Se muestra lo último sincronizado."); return; }
    editable = true;
    document.querySelectorAll("[data-solo-editable-input]").forEach((x) => (x.disabled = false));
    if (avisoDb) avisoDb.textContent = "Los cambios se guardan al momento.";
    const sub = (col, fn) => db.collection(col).onSnapshot((snap) => { fn(migrar(col, new Map(snap.docs.map((d) => [d.id, d.data()])))); renderTodo(); },
      () => { if (col === "despensa") soloLectura("No se puede acceder a los datos guardados ahora mismo."); });
    sub("despensa", (m) => (despensaDb = m));
    sub("no-deseados", (m) => (ndDb = m));
    sub("hechas", (m) => (reservasDb = m));
    sub("diario", (m) => (diarioDb = m));
    sub("cambios", (m) => (cambiosDb = m));
    sub("cocinado", (m) => (cocinadoDb = m));
    sub("perfil", (m) => (perfilDb = m));
    db.collection("comentarios").onSnapshot((snap) => { comentarios = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha))); renderComentarios(); }, () => {});
    db.collection("eventos").orderBy("fecha", "desc").limit(100).onSnapshot((snap) => { eventos = snap.docs.map((d) => d.data()); renderDiario(); }, () => {});
    sample = await window.claude.use("sample");
    renderTodo();
  })();
})();
