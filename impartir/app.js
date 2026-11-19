/* «¿Qué puedo impartir?» · FP al día (v2). Sin frameworks. El perfil va solo al Worker y no se guarda:
   ni en el navegador ni en el servidor. El ticket de /detalle vive solo en memoria. La imagen para
   compartir se dibuja en el navegador (canvas) y no se sube a ningún sitio. */
"use strict";
(function () {
  // --- Configuración: lo único que hay que cambiar al publicar ---
  // Sitekey pública del widget «eFPear impartir» (fpaldia.es, creado el 15/11/2026); en local, la clave de PRUEBA de Cloudflare.
  const TURNSTILE_SITEKEY = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "1x00000000000000000000AA" : "0x4AAAAAAGCHICdwivgVzqoz";
  const API_LOCAL = "http://127.0.0.1:8787"; // npm run dev en codigo/encaje/worker
  const API_PRODUCCION = "https://efpear-encaje.efpear-encaje.workers.dev";
  const CORREO = "hola@fpaldia.es";
  const ESPERA_MS = 20000;
  const ARCHIVO_IMAGEN = "mi-resultado-fpaldia.png";

  const esLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = esLocal ? API_LOCAL : API_PRODUCCION;
  const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  function el(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null && h !== false) e.append(h.nodeType ? h : String(h));
    return e;
  }

  const ESTADOS = { puedes: "Puedes", puedes_si_lo_acreditas: "Puedes si lo acreditas", revisa: "Revisa" };
  const AYUDA_ESTADO = {
    puedes: "La norma estatal lo prevé para tu perfil.",
    puedes_si_lo_acreditas: "Encajas cuando termines la habilitación docente.",
    revisa: "Puede que encajes, pero hay que confirmarlo con la administración.",
  };

  // --- Estado (solo en memoria) ---
  const S = {
    tit: [], exp: [], comp: [],
    widget: null, token: null, ticket: null, caduca: 0, perfil: null, res: null, etiquetas: [],
    filtro: "todos", detalles: new Map(), bloqueadoHasta: 0, sig: 1, ocupado: false,
  };
  let LISTAS = null;

  // --- Correo de la titulación que falta (Q10): no se guarda nada ---
  function enlaceCorreo(texto) {
    const asunto = "Titulación que falta en «¿Qué puedo impartir?»";
    const cuerpo = "Hola:\n\nNo encuentro mi titulación en la lista del buscador:\n«" + texto + "»\n\n" +
      "Si quieres, añade dónde y cuándo la obtuviste. No hace falta nada más.\n\nGracias.";
    return "mailto:" + CORREO + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(cuerpo);
  }
  function notaCorreo(texto) {
    return el("div", { class: "nota rev" },
      "No está en la lista: saldrá «revisa». ",
      el("a", { href: enlaceCorreo(texto) }, "Avísanos para añadirla ↗"),
      " · ", el("code", { text: CORREO }));
  }

  // --- Opciones de los buscadores ---
  function opcionesTitulacion(L) {
    const o = [];
    const add = (x) => { x.buscar = norm(x.etiqueta + " " + (x.detalle || "") + " " + (x.claves || "")); o.push(x); };
    add({ etiqueta: "Licenciado, Ingeniero o Arquitecto", detalle: "Cualquier licenciatura, ingeniería o arquitectura", claves: "universidad licenciatura", tipo: "univ_licenciado", extra: "denominacion" });
    add({ etiqueta: "Grado universitario", detalle: "Cualquier título de grado", claves: "graduado universidad", tipo: "univ_grado", extra: "denominacion" });
    add({ etiqueta: "Diplomado, Ingeniero Técnico o Arquitecto Técnico", detalle: "Cualquier diplomatura o ingeniería técnica", claves: "universidad diplomatura", tipo: "univ_diplomado", extra: "denominacion" });
    for (const t of L.titulos) add({ etiqueta: t, detalle: "Título universitario concreto", tipo: "titulo_concreto", denominacion: t });
    for (const f of L.familias) {
      add({ etiqueta: "Técnico Superior · " + f, detalle: "Ciclo formativo de grado superior", claves: "ts cfgs grado superior fp", tipo: "tecnico_superior", familia: f });
      add({ etiqueta: "Técnico · " + f, detalle: "Ciclo formativo de grado medio", claves: "cfgm grado medio fp", tipo: "tecnico", familia: f });
    }
    for (const n of [3, 2]) for (const f of L.familias) {
      add({ etiqueta: "Certificado de profesionalidad de nivel " + n + " · " + f, detalle: "Cualquier certificado de nivel " + n + " de la familia", claves: "cp", tipo: "certificado_n" + n, familia: f, extra: "area" });
    }
    for (const c of L.certificados) {
      add({ etiqueta: c.codigo + " · " + c.denominacion, detalle: "Certificado de profesionalidad de nivel " + c.nivel + " · " + c.familia, claves: "cp certificado", tipo: "certificado_n" + c.nivel, codigo: c.codigo });
    }
    add({ etiqueta: "Técnico Deportivo Superior", detalle: "Enseñanzas deportivas de grado superior", claves: "deporte", tipo: "tecnico_deportivo_superior" });
    add({ etiqueta: "Título universitario extranjero", detalle: "Indica el idioma y si está homologado", claves: "extranjero homologado", tipo: "univ_extranjera", extra: "extranjera" });
    return o;
  }
  function opcionesExperiencia(L) {
    const o = [];
    for (const u of L.uc) o.push({ etiqueta: u.codigo + " · " + u.denominacion, detalle: "Unidad de competencia · en " + u.certificados.join(", "), uc: u.codigo });
    for (const p of L.ocupaciones) o.push({ etiqueta: p.nombre, detalle: "Puesto · CNO-11 " + p.cno11, cno11: p.cno11 });
    for (const x of o) x.buscar = norm(x.etiqueta + " " + x.detalle);
    return o;
  }

  // --- Buscador accesible (patrón combobox de la WAI-ARIA) ---
  function combo(input, lista, opciones, alElegir, conLibre) {
    let vis = [], activo = -1;
    const cerrar = () => { lista.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); activo = -1; };
    const marcar = (i) => {
      activo = i;
      $$("li", lista).forEach((li, j) => li.setAttribute("aria-selected", j === i ? "true" : "false"));
      const li = lista.children[i];
      if (li && li.id) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
    };
    const elegir = (i) => { const x = vis[i]; if (!x) return; input.value = ""; cerrar(); if (alElegir(x) !== "foco") input.focus(); };
    function pintar() {
      const q = norm(input.value).trim();
      lista.textContent = "";
      if (q.length < 2) { cerrar(); return; }
      const palabras = q.split(/\s+/);
      vis = opciones().filter((x) => palabras.every((p) => x.buscar.includes(p))).slice(0, 40);
      if (conLibre && input.value.trim().length >= 3) vis.push({ libre: true, etiqueta: input.value.trim() });
      vis.forEach((x, i) => {
        const li = el("li", { id: lista.id + "-" + i, role: "option", "aria-selected": "false", class: x.libre ? "libre" : null,
          onmousedown: (ev) => { ev.preventDefault(); elegir(i); } },
          x.libre ? [el("b", { text: "No está: usar «" + x.etiqueta + "»" }), el("small", { text: "Saldrá «revisa»." })]
            : [x.etiqueta, el("small", { text: x.detalle || "" })]);
        lista.append(li);
      });
      if (!vis.length) lista.append(el("li", { class: "vacio", role: "option", "aria-disabled": "true", text: "Sin resultados. Prueba con otra palabra." }));
      lista.hidden = false;
      input.setAttribute("aria-expanded", "true");
      activo = -1;
    }
    input.addEventListener("input", pintar);
    input.addEventListener("focus", () => { if (input.value) pintar(); });
    input.addEventListener("blur", () => setTimeout(cerrar, 120));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (lista.hidden) pintar(); if (vis.length) marcar(Math.min(activo + 1, vis.length - 1)); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (vis.length) marcar(Math.max(activo - 1, 0)); }
      else if (ev.key === "Enter") { if (!lista.hidden && vis.length) { ev.preventDefault(); elegir(activo >= 0 ? activo : 0); } }
      else if (ev.key === "Escape") { cerrar(); }
    });
  }

  // --- Titulaciones ---
  function pintarTitulaciones() {
    const ul = $("#elegidos-tit");
    ul.textContent = "";
    S.tit.forEach((t, i) => {
      const o = t.op;
      const nombre = o.libre ? "«" + o.etiqueta + "»" : o.etiqueta;
      const li = el("li", { class: "elegido" + (o.libre ? " libre" : "") + (t.n === S.nuevo ? " nuevo" : "") },
        el("div", { class: "cab" },
          el("span", { class: "nom", text: nombre }),
          el("button", { type: "button", class: "quitar", "aria-label": "Quitar " + nombre, onclick: () => { S.tit.splice(i, 1); pintarTitulaciones(); marcarCambio(); $("#buscar-tit").focus(); } }, "Quitar")));
      const extra = el("div", { class: "extra" });
      const id = "t" + t.n;
      if (o.extra === "denominacion") {
        extra.append(el("label", { for: id + "-den" }, "Nombre del título (opcional)",
          el("input", { type: "text", id: id + "-den", value: t.v.denominacion || "", placeholder: o.tipo === "univ_grado" ? "Ej.: Graduado en Turismo" : o.tipo === "univ_diplomado" ? "Ej.: Diplomado en Turismo" : "Ej.: Licenciado en Biología",
            oninput: (ev) => { t.v.denominacion = ev.target.value; marcarCambio(); } })));
      } else if (o.extra === "area") {
        const areas = LISTAS.areas[o.familia] || [];
        if (areas.length) {
          extra.append(el("label", { for: id + "-area" }, "Área (opcional)",
            el("select", { id: id + "-area", onchange: (ev) => { t.v.area = ev.target.value; marcarCambio(); } },
              el("option", { value: "" }, "No lo sé / otra"), areas.map((a) => el("option", { value: a, selected: t.v.area === a }, a)))));
        } else {
          extra.append(el("label", { for: id + "-area" }, "Área (opcional)",
            el("input", { type: "text", id: id + "-area", value: t.v.area || "", oninput: (ev) => { t.v.area = ev.target.value; marcarCambio(); } })));
        }
      } else if (o.extra === "extranjera") {
        extra.append(el("label", { for: id + "-idi" }, "Idioma del país",
          el("select", { id: id + "-idi", onchange: (ev) => { t.v.idioma = ev.target.value; marcarCambio(); } },
            ["inglés", "francés", "alemán", "italiano", "portugués", "otro"].map((x) => el("option", { selected: t.v.idioma === x }, x)))));
        extra.append(el("label", { class: "opc" }, el("input", { type: "checkbox", checked: !!t.v.homologada, onchange: (ev) => { t.v.homologada = ev.target.checked; marcarCambio(); } }), "Homologada en España"));
      }
      if (extra.childNodes.length) li.append(extra);
      if (o.libre) li.append(notaCorreo(o.etiqueta));
      ul.append(li);
    });
    S.nuevo = null; // el marcador solo pasa una vez, sobre la última añadida
  }
  function anadirTitulacion(op) {
    if (!op.libre && S.tit.some((t) => t.op === op)) return;
    const v = {};
    if (op.extra === "extranjera") v.idioma = "inglés";
    S.nuevo = S.sig;
    S.tit.push({ op, v, n: S.sig++ });
    pintarTitulaciones();
    limpiarError("#error-calc");
    marcarCambio();
  }
  function titulacionesPerfil() {
    return S.tit.map(({ op, v }) => {
      if (op.libre) return { tipo: "texto_libre", texto: op.etiqueta };
      const x = { tipo: op.tipo };
      if (op.denominacion) x.denominacion = op.denominacion;
      if (op.familia) x.familia = op.familia;
      if (op.codigo) x.codigo = op.codigo;
      if (op.extra === "denominacion" && v.denominacion && v.denominacion.trim()) x.denominacion = v.denominacion.trim().slice(0, 200);
      if (op.extra === "area" && v.area && v.area.trim()) x.area = v.area.trim().slice(0, 120);
      if (op.extra === "extranjera") { x.idioma = v.idioma === "otro" ? "" : v.idioma; x.homologada = !!v.homologada; }
      return x;
    });
  }

  // --- Experiencia e idiomas (bloque «Afina tu resultado») ---
  function pintarExperiencia() {
    const ul = $("#elegidos-exp");
    ul.textContent = "";
    S.exp.forEach((e, i) => {
      const id = "e" + e.n;
      ul.append(el("li", { class: "elegido" },
        el("div", { class: "cab" },
          el("span", { class: "nom" }, el("small", { text: e.op.detalle }), e.op.etiqueta),
          el("button", { type: "button", class: "quitar", "aria-label": "Quitar " + e.op.etiqueta, onclick: () => { S.exp.splice(i, 1); pintarExperiencia(); $("#buscar-exp").focus(); } }, "Quitar")),
        el("label", { class: "anios", for: id }, "Años",
          el("input", { type: "number", id, min: "0.5", max: "60", step: "0.5", inputmode: "decimal", value: e.anios || "", required: true,
            oninput: (ev) => { e.anios = ev.target.value; } }))));
    });
  }
  function pintarIdiomas() {
    const ul = $("#elegidos-comp");
    ul.textContent = "";
    const nombres = Object.fromEntries($$("#comp-tipo option").map((o) => [o.value, o.textContent]));
    S.comp.forEach((c, i) => {
      ul.append(el("li", { class: "elegido" }, el("div", { class: "cab" },
        el("span", { class: "nom" }, nombres[c.tipo] + " · " + c.idioma),
        el("button", { type: "button", class: "quitar", "aria-label": "Quitar " + c.idioma, onclick: () => { S.comp.splice(i, 1); pintarIdiomas(); } }, "Quitar"))));
    });
  }

  // --- Perfil (lo único que sale del navegador; mismo formato que la v1) ---
  function competenciaPerfil() {
    const marc = (n) => $$('input[name="' + n + '"]:checked').map((x) => x.value);
    const habil = ($('input[name="habil"]:checked') || {}).value;
    const cd = {
      acreditada: (habil === "si" ? ["ssc_c_017_5b"] : []).concat(marc("acreditada")),
      en_curso: habil === "cursando" ? ["ssc_c_017_5b"] : [],
      exenciones: marc("exenciones"),
    };
    const h = parseInt($("#horas").value, 10);
    if (h > 0) cd.horas_docencia_fp_10_anios = Math.min(h, 20000);
    return cd;
  }
  function construirPerfil() {
    return {
      titulaciones: titulacionesPerfil(),
      competencia_docente: competenciaPerfil(),
      experiencia: S.exp.map((e) => (e.op.uc ? { uc: e.op.uc, anios: Number(e.anios) } : { cno11: e.op.cno11, anios: Number(e.anios) })),
      complementos: S.comp.map((c) => ({ tipo: c.tipo, idioma: c.idioma })),
    };
  }
  function marcarCambio() { if (S.res) $("#res-cambiado").hidden = false; }

  // --- Turnstile (en la misma pantalla, discreto) ---
  /** El script de Turnstile carga aparte (async): se espera a que exista para pintar el widget. */
  function esperarTurnstile() {
    let n = 0;
    const tic = () => {
      prepararTurnstile();
      if (S.widget !== null) return;
      if (++n < 75) setTimeout(tic, 200);
      else mostrarError("#error-calc", "No se ha podido cargar la comprobación de seguridad.", "Si usas un bloqueador de contenido, desactívalo para esta página (challenges.cloudflare.com) y recárgala.");
    };
    tic();
  }
  function prepararTurnstile() {
    if (S.widget !== null || !window.turnstile || typeof window.turnstile.render !== "function") return;
    try {
      S.widget = window.turnstile.render("#turnstile", {
      sitekey: TURNSTILE_SITEKEY, language: "es", action: "evaluar", size: innerWidth < 360 ? "compact" : "flexible", // el flexible mide 300 px como mínimo
      callback: (t) => { S.token = t; limpiarError("#error-calc"); },
      "expired-callback": () => { S.token = null; },
      "error-callback": () => {
        S.token = null;
        mostrarError("#error-calc", "La comprobación de seguridad ha fallado.", "Recarga la página y vuelve a intentarlo.");
        return true;
      },
      });
    } catch (e) {
      S.widget = false; // no se reintenta
      mostrarError("#error-calc", "No se ha podido cargar la comprobación de seguridad.", "Recarga la página y vuelve a intentarlo.");
    }
  }
  function renovarTurnstile() {
    S.token = null;
    if (S.widget !== null && S.widget !== false && window.turnstile) window.turnstile.reset(S.widget);
  }
  /** Espera a que Turnstile dé un token (se resuelve solo en modo gestionado). */
  async function token() {
    for (let i = 0; i < 60 && !S.token; i++) {
      if (i === 0) prepararTurnstile();
      await new Promise((r) => setTimeout(r, 250));
    }
    return S.token;
  }

  // --- Errores ---
  function mostrarError(sel, titulo, texto) {
    const c = $(sel);
    c.textContent = "";
    c.append(el("div", { class: "error" }, el("b", { text: titulo }), texto || ""));
  }
  function limpiarError(sel) { $(sel).textContent = ""; }

  /** Llama al Worker. Devuelve los datos o lanza {titulo, texto, estado, codigo}. */
  async function llamar(ruta, cuerpo, cabeceras) {
    if (!API) throw { titulo: "El buscador aún no está disponible.", texto: "Vuelve en unos días." };
    const ctl = new AbortController();
    const reloj = setTimeout(() => ctl.abort(), ESPERA_MS);
    let r;
    try {
      r = await fetch(API + ruta, {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store", signal: ctl.signal,
        headers: Object.assign({ "Content-Type": "application/json" }, cabeceras),
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      throw e && e.name === "AbortError"
        ? { titulo: "El buscador tarda demasiado en responder.", texto: "Inténtalo de nuevo en un momento." }
        : { titulo: "No hemos podido conectar con el buscador.", texto: "Comprueba tu conexión a internet y vuelve a intentarlo." };
    } finally { clearTimeout(reloj); }
    let datos = null;
    try { datos = await r.json(); } catch (e) { datos = null; }
    if (r.ok && datos && !datos.error) return datos;
    const msg = datos && datos.error && datos.error.mensaje;
    const codigo = datos && datos.error && datos.error.codigo;
    if (r.status === 429) {
      const seg = parseInt(r.headers.get("Retry-After"), 10) || 60;
      throw { titulo: "Demasiadas consultas seguidas.", texto: msg || "Espera un minuto y vuelve a intentarlo.", estado: 429, codigo, seg };
    }
    if (codigo === "verificacion") throw { titulo: "Comprobación de seguridad.", texto: msg, estado: r.status, codigo };
    throw {
      titulo: r.status >= 500 ? "No hemos podido calcular el resultado." : "No hemos podido hacer la consulta.",
      texto: msg || "Inténtalo de nuevo en unos minutos (código " + r.status + ").", estado: r.status, codigo,
    };
  }
  function bloquear(seg, estadoSel) {
    S.bloqueadoHasta = Date.now() + seg * 1000;
    const botones = [$("#calcular"), $("#recalcular")];
    botones.forEach((b) => { b.disabled = true; });
    const tic = () => {
      const quedan = Math.ceil((S.bloqueadoHasta - Date.now()) / 1000);
      if (quedan <= 0) { botones.forEach((b) => { b.disabled = false; }); $(estadoSel).textContent = "Ya puedes volver a consultar."; return; }
      $(estadoSel).textContent = "Podrás volver a consultar en " + quedan + " s.";
      setTimeout(tic, 1000);
    };
    tic();
  }

  // --- Calcular (/evaluar): desde el buscador o desde «Afina tu resultado» ---
  async function calcular(desde) {
    const boton = desde === "afina" ? $("#recalcular") : $("#calcular");
    const errSel = desde === "afina" ? "#error-afina" : "#error-calc";
    const estSel = desde === "afina" ? "#estado-compartir" : "#estado-calc";
    limpiarError("#error-calc"); limpiarError("#error-afina");
    if (S.ocupado || Date.now() < S.bloqueadoHasta) return;
    const sinAnios = S.exp.find((e) => !(Number(e.anios) > 0));
    if (sinAnios) {
      $("#afina").open = true;
      mostrarError("#error-afina", "Falta un dato.", "Indica los años de «" + sinAnios.op.etiqueta + "».");
      const inp = $("#e" + sinAnios.n); if (inp) inp.focus();
      return;
    }
    if (!S.tit.length && !S.exp.length) {
      mostrarError(errSel, "Elige tu titulación.", "Búscala arriba y añádela.");
      $("#buscar-tit").focus();
      return;
    }
    S.ocupado = true;
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    $(estSel).textContent = "Calculando tu resultado…";
    try {
      const tk = await token();
      if (!tk) throw { titulo: "Falta la comprobación de seguridad.", texto: window.turnstile ? "Marca la casilla de Cloudflare y vuelve a pulsar." : "No se ha podido cargar Cloudflare Turnstile. Si usas un bloqueador de contenido, desactívalo para esta página y recárgala." };
      const perfil = construirPerfil();
      const d = await llamar("/evaluar", perfil, { "X-Turnstile-Token": tk });
      S.res = d; S.perfil = perfil; S.ticket = d.ticket; S.caduca = Date.now() + (d.ticket_segundos || 900) * 1000;
      S.etiquetas = S.tit.map((t) => (t.op.libre ? "Otra titulación" : t.op.etiqueta));
      S.detalles = new Map(); S.filtro = "todos";
      delete d.ticket;
      $(estSel).textContent = "";
      pintarResultado();
      mostrarResultado();
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "impartir-consulta", title: "Consulta de encaje docente", event: true }); } catch (e) { /* sin analítica */ }
    } catch (e) {
      $(estSel).textContent = "";
      mostrarError(errSel, e.titulo || "No hemos podido hacer la consulta.", e.texto || "");
      if (e.estado === 429) bloquear(e.seg, estSel);
    } finally {
      S.ocupado = false;
      boton.removeAttribute("aria-busy");
      if (Date.now() >= S.bloqueadoHasta) boton.disabled = false;
      renovarTurnstile(); // cada token sirve una sola vez
    }
  }
  function mostrarResultado() {
    const sec = $("#res");
    sec.hidden = false;
    $("#res-cambiado").hidden = true;
    sec.scrollIntoView({ block: "start", behavior: sinMovimiento() ? "auto" : "smooth" });
    $("#res-t").focus({ preventScroll: true });
  }

  // --- Resultado ---
  function cuentas(g) {
    const todos = (g.en_tu_familia || []).concat(g.en_el_resto || []);
    const c = {};
    for (const k of Object.keys(ESTADOS)) c[k] = { modulos: 0, certificados: 0 };
    const fam = new Map();
    for (const b of todos) {
      const vistos = new Set();
      const f = fam.get(b.familia) || { familia: b.familia, certificados: 0, modulos: 0 };
      f.certificados++;
      for (const m of b.modulos) {
        if (!c[m.estado]) continue;
        c[m.estado].modulos++;
        f.modulos++;
        if (!vistos.has(m.estado)) { vistos.add(m.estado); c[m.estado].certificados++; }
      }
      fam.set(b.familia, f);
    }
    return { todos, c, familias: [...fam.values()].sort((a, b) => b.modulos - a.modulos) };
  }
  function titular(c) {
    const cert = (n) => plural(n, "certificado", "certificados");
    if (c.puedes.modulos) return "Puedes impartir " + plural(c.puedes.modulos, "módulo", "módulos") + " de " + cert(c.puedes.certificados);
    if (c.puedes_si_lo_acreditas.modulos) return "Podrás impartir " + plural(c.puedes_si_lo_acreditas.modulos, "módulo", "módulos") + " de " + cert(c.puedes_si_lo_acreditas.certificados) + " al acreditarte";
    if (c.revisa.modulos) return "Tienes " + plural(c.revisa.modulos, "módulo", "módulos") + " por revisar en " + cert(c.revisa.certificados);
    return "Con estos datos no sale ningún módulo";
  }

  function pintarResultado() {
    const g = S.res;
    const { todos, c } = cuentas(g);
    $("#res-t").textContent = titular(c);
    const cif = $("#cifras");
    cif.textContent = "";
    [["puedes", "ok"], ["puedes_si_lo_acreditas", "acr"], ["revisa", "rev"]].forEach(([k, cls]) => {
      cif.append(el("div", { class: "cifra " + cls },
        el("b", { text: c[k].modulos }), el("span", { text: ESTADOS[k] }),
        el("small", { text: "en " + plural(c[k].certificados, "certificado", "certificados") })));
    });
    $("#compartir").disabled = !todos.length;

    const caja = $("#resultado");
    caja.textContent = "";
    const numCita = new Map((g.citas_comunes || []).map((x, i) => [x.id, i + 1]));

    const cd = g.competencia_docente;
    if (cd) {
      const tit = { ok: "Tienes la competencia docente", en_curso: "Habilitación en curso", revisa: "Competencia docente: revisa", falta: "Te falta la habilitación docente" }[cd.estado] || "Competencia docente";
      const citas = Array.isArray(cd.citas) && cd.citas.length ? cd.citas : (cd.cita ? [{ fuente: cd.fuente, cita: cd.cita }] : []);
      caja.append(el("details", { class: "cd plegable" }, el("summary", null, el("b", { text: tit }), " · ", cd.motivo || ""),
        cd.fuente ? el("p", { class: "fuente", text: "Regla " + (cd.regla || "") + " · " + cd.fuente }) : null,
        citas.map((x) => el("div", { class: "detalle", style: "margin-top:8px" }, el("blockquote", { text: "«" + x.cita + "»" }), el("p", { class: "fuente", text: x.fuente })))));
    }

    const avisos = g.avisos || [];
    if (avisos.length) caja.append(el("ul", { class: "lista-avisos", "aria-label": "Avisos" }, avisos.map((a) => el("li", { text: a }))));
    (g.sin_comparar || []).forEach((s) => caja.append(el("div", null, el("p", { style: "margin:0 0 4px" }, el("b", { text: "«" + s.texto + "»: " }), s.motivo || ""), notaCorreo(s.texto))));

    if (!todos.length) {
      caja.append(el("p", { class: "nota" }, "Revisa tu titulación o tu habilitación, o añade experiencia arriba. Si tu familia no está en el piloto, la iremos añadiendo."));
      return;
    }

    if ((g.citas_comunes || []).length) {
      caja.append(el("details", { class: "comunes plegable" }, el("summary", null, "Frases de la norma que se repiten (" + g.citas_comunes.length + ")"),
        el("ol", null, g.citas_comunes.map((x) => el("li", null,
          el("b", { text: "Frase " + numCita.get(x.id) }), " · " + plural(x.modulos, "módulo", "módulos") + " de " + plural(x.certificados, "certificado", "certificados"),
          el("blockquote", { text: "«" + x.texto + "»" }))))));
    }

    const filtro = el("div", { class: "filtro", role: "group", "aria-label": "Filtrar por estado" });
    [["todos", "Todos"], ["puedes", ESTADOS.puedes], ["puedes_si_lo_acreditas", ESTADOS.puedes_si_lo_acreditas], ["revisa", ESTADOS.revisa]].forEach(([k, t]) => {
      const n = k === "todos" ? c.puedes.modulos + c.puedes_si_lo_acreditas.modulos + c.revisa.modulos : c[k].modulos;
      if (k !== "todos" && !n) return;
      filtro.append(el("button", { type: "button", "aria-pressed": S.filtro === k ? "true" : "false", onclick: () => { S.filtro = k; pintarResultado(); $('.filtro button[aria-pressed="true"]').focus(); } }, t + " (" + n + ")"));
    });
    caja.append(filtro);

    const fams = g.familias_experiencia || [];
    if (fams.length) caja.append(bloque("En tu familia", "Donde declaras experiencia: " + fams.join(", ") + ".", g.en_tu_familia || [], numCita));
    caja.append(bloque(fams.length ? "En el resto" : "Por certificado", null, g.en_el_resto || [], numCita));
  }

  function bloque(titulo, texto, certs, numCita) {
    const sec = el("section", { class: "bloque" }, el("h3", { text: titulo }), texto ? el("p", { text: texto }) : null);
    const filtrados = certs.map((b) => ({ b, mods: b.modulos.filter((m) => S.filtro === "todos" || m.estado === S.filtro) })).filter((x) => x.mods.length);
    if (!filtrados.length) sec.append(el("p", { text: certs.length ? "Ningún módulo con este filtro." : "Nada en este bloque." }));
    for (const { b, mods } of filtrados) {
      const cuentasB = el("span", { class: "cuentas" });
      for (const k of Object.keys(ESTADOS)) {
        const n = mods.filter((m) => m.estado === k).length;
        if (n) cuentasB.append(el("span", { class: "est " + k, text: n + " · " + ESTADOS[k] }));
      }
      const d = el("details", { class: "cert" },
        el("summary", null,
          el("span", { class: "cn", text: b.codigo + " · " + b.denominacion }),
          el("span", { class: "cm", text: ["Nivel " + b.nivel, b.familia, b.area].filter(Boolean).join(" · ") }),
          cuentasB));
      let hecho = false;
      d.addEventListener("toggle", () => {
        if (!d.open || hecho) return;
        hecho = true;
        const ul = el("ul", { class: "modulos" });
        if (b.ficha_sepe && /^https:\/\//.test(b.ficha_sepe)) ul.append(el("li", { class: "mod" }, el("a", { href: b.ficha_sepe, target: "_blank", rel: "noopener" }, "Ficha oficial del certificado en el SEPE ↗")));
        mods.forEach((m) => ul.append(modulo(b, m, numCita)));
        d.append(ul);
      });
      sec.append(d);
    }
    return sec;
  }

  function modulo(b, m, numCita) {
    const idDet = "det-" + b.codigo + "-" + m.codigo;
    const panel = el("div", { class: "detalle", id: idDet, hidden: true, "aria-live": "polite" });
    const boton = el("button", { type: "button", class: "btn sec chico", "aria-expanded": "false", "aria-controls": idDet }, "Ver la norma");
    boton.addEventListener("click", () => verNorma(b, m, boton, panel));
    return el("li", { class: "mod" },
      el("div", { class: "mc" },
        el("span", { class: "est " + m.estado, title: AYUDA_ESTADO[m.estado] || "", text: ESTADOS[m.estado] || m.estado }),
        el("span", { class: "mn", text: m.denominacion })),
      el("span", { class: "mm", text: [m.codigo, m.horas ? m.horas + " h" : null, m.uc].filter(Boolean).join(" · ") }),
      m.motivo ? el("p", { class: "mot", text: m.motivo }) : null,
      m.cita_comun && numCita.get(m.cita_comun) ? el("span", { class: "ref", text: "Frase " + numCita.get(m.cita_comun) }) : null,
      el("div", null, boton), panel);
  }

  // --- Ver la norma (/detalle) ---
  async function verNorma(b, m, boton, panel) {
    if (boton.getAttribute("aria-expanded") === "true") {
      boton.setAttribute("aria-expanded", "false"); boton.textContent = "Ver la norma"; panel.hidden = true; return;
    }
    const clave = b.codigo + "|" + m.codigo;
    const abrir = () => { panel.hidden = false; boton.setAttribute("aria-expanded", "true"); boton.textContent = "Ocultar la norma"; };
    if (S.detalles.has(clave)) { pintarDetalle(panel, S.detalles.get(clave)); abrir(); return; }
    if (!S.ticket || Date.now() > S.caduca) { pintarCaducado(panel); abrir(); return; }
    boton.disabled = true; boton.setAttribute("aria-busy", "true");
    panel.textContent = "Cargando la norma…"; abrir();
    try {
      const d = await llamar("/detalle", { perfil: S.perfil, modulo: m.codigo, certificado: b.codigo }, { "X-Encaje-Ticket": S.ticket });
      const det = (d.detalles || [])[0];
      if (!det) throw { titulo: "No hemos encontrado el detalle de este módulo.", texto: "" };
      S.detalles.set(clave, det.modulo);
      pintarDetalle(panel, det.modulo);
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "impartir-detalle", title: "Ver la norma", event: true }); } catch (e) { /* sin analítica */ }
    } catch (e) {
      if (e.codigo === "verificacion") pintarCaducado(panel, e.texto);
      else {
        panel.textContent = "";
        panel.append(el("div", { class: "error", style: "margin:0" }, el("b", { text: e.titulo || "No hemos podido abrir la norma." }), e.texto || ""));
      }
    } finally { boton.disabled = false; boton.removeAttribute("aria-busy"); }
  }
  function pintarCaducado(panel, texto) {
    panel.textContent = "";
    panel.append(el("div", { class: "error", style: "margin:0" },
      el("b", { text: "Tu consulta ha caducado." }),
      texto || "Cada consulta vale 15 minutos. Vuelve a calcular (tus datos siguen puestos).",
      el("div", { style: "margin-top:8px" }, el("button", { type: "button", class: "btn sec chico", onclick: () => calcular("afina") }, "Volver a calcular"))));
  }
  function pintarDetalle(panel, d) {
    panel.textContent = "";
    const dl = el("dl");
    const fila = (t, ...v) => { dl.append(el("dt", { text: t }), el("dd", null, ...v)); };
    const cita = (texto, fuente) => [texto ? el("blockquote", { text: "«" + texto + "»" }) : null, fuente ? el("p", { class: "fuente", style: "margin:4px 0 0", text: fuente }) : null];
    fila("Estado", el("span", { class: "est " + d.estado, text: ESTADOS[d.estado] || d.estado }), " ", d.motivo || "");
    if (d.cita || d.fuente) fila("Lo que dice la tabla del módulo", ...cita(d.cita, d.fuente));
    if (d.cita_sin_acreditacion) fila("Sin la titulación, la tabla dice", ...cita(d.cita_sin_acreditacion));
    if (d.regla_cita || d.regla_fuente) fila("Regla que se aplica" + (d.regla ? " (" + d.regla + ")" : ""), ...cita(d.regla_cita, d.regla_fuente));
    if (d.lecturas && typeof d.lecturas === "object") {
      for (const [k, l] of Object.entries(d.lecturas)) {
        if (!l) continue;
        if (typeof l === "string") { fila("Lectura " + k, l); continue; }
        const cr = l.criterio && typeof l.criterio === "object" ? l.criterio : null;
        fila("Lectura " + k, l.texto ? el("p", { style: "margin:0 0 4px", text: l.texto }) : null, ...cita(l.cita, l.fuente),
          cr && (cr.nota || cr.cita) ? el("p", { style: "margin:6px 0 0", text: "Criterio: " + (cr.nota || cr.cita) }) : null,
          cr && cr.fuente ? el("p", { class: "fuente", style: "margin:2px 0 0", text: cr.fuente }) : null);
      }
    }
    const e = d.experiencia;
    if (e) {
      const partes = [];
      if (e.nota) partes.push(e.nota);
      else {
        if (e.tabla_anios != null) partes.push("La tabla pide " + e.tabla_anios + " año(s).");
        if (e.declarada_anios != null) partes.push("Declaras " + e.declarada_anios + ".");
        if (e.periodo) partes.push("Periodo: «" + e.periodo + "».");
      }
      if (partes.length) fila("Experiencia profesional", partes.join(" "));
    }
    if (d.cita_vigencia || d.fuente_vigencia) fila("Vigencia", ...cita(d.cita_vigencia, d.fuente_vigencia));
    panel.append(dl);
  }

  // --- Compartir: imagen 1080×1350 dibujada en el navegador. Solo cifras y familias, nunca citas ni módulos. ---
  const C = { sol: "#FFC400", tinta: "#111111", papel: "#dadada", gris: "#3a3a3a", ok: "#e3f4ea", okT: "#0b6b3a", acr: "#fff1c7", acrT: "#7a4a00", rev: "#fde8e8", revT: "#8a1c1c" };
  const ARCHIVO = (peso, px) => peso + " " + px + "px Archivo, 'Arial Black', sans-serif";
  const INTER = (peso, px) => peso + " " + px + "px 'Inter Tight', Arial, sans-serif";

  function lineas(ctx, texto, ancho, max) {
    const palabras = String(texto).split(/\s+/);
    const out = [];
    let l = "";
    for (const p of palabras) {
      const prueba = l ? l + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !l) l = prueba;
      else { out.push(l); l = p; }
    }
    if (l) out.push(l);
    if (out.length > max) {
      const corte = out.slice(0, max);
      let u = corte[max - 1];
      while (u.length > 1 && ctx.measureText(u + "…").width > ancho) u = u.slice(0, -1);
      corte[max - 1] = u.replace(/\s+\S*$/, "") + "…";
      return corte;
    }
    return out;
  }
  function cargarImagen(src) {
    return new Promise((res) => {
      const i = new Image();
      const t = setTimeout(() => res(null), 3000);
      i.onload = () => { clearTimeout(t); res(i); };
      i.onerror = () => { clearTimeout(t); res(null); };
      i.src = src;
    });
  }
  function rect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  async function dibujarImagen() {
    const W = 1080, H = 1350, M = 72, A = W - 2 * M;
    try {
      await Promise.all([
        document.fonts.load(ARCHIVO(800, 100), "¿QUÉ"), document.fonts.load(INTER(700, 34), "a"),
        document.fonts.load(INTER(600, 26), "a"), document.fonts.load(INTER(500, 24), "a"),
      ]);
      await document.fonts.ready;
    } catch (e) { /* se dibuja con la fuente de reserva */ }
    const logo = await cargarImagen("/marca/fp-al-dia-avatar.png");
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const { c, familias } = cuentas(S.res);

    // Fondo y marca de agua diagonal
    ctx.fillStyle = C.papel; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 7);
    ctx.font = ARCHIVO(800, 30); ctx.fillStyle = "rgba(17,17,17,0.04)"; ctx.textBaseline = "middle";
    const marca = "FP AL DÍA · FPALDIA.ES/IMPARTIR · ";
    const paso = ctx.measureText(marca).width;
    for (let y = -H, fila = 0; y < H; y += 110, fila++) {
      for (let x = -W * 1.2 - (fila % 2) * paso / 2; x < W * 1.2; x += paso) ctx.fillText(marca, x, y);
    }
    ctx.restore();
    ctx.textBaseline = "alphabetic";

    // Cabecera
    let y = M;
    if (logo) { ctx.save(); rect(ctx, M, y, 76, 76, 16, "#fff"); ctx.clip(); ctx.drawImage(logo, M, y, 76, 76); ctx.restore(); }
    const xT = logo ? M + 96 : M;
    ctx.fillStyle = C.tinta; ctx.font = ARCHIVO(800, 30); ctx.fillText("FP AL DÍA", xT, y + 34);
    ctx.fillStyle = C.gris; ctx.font = INTER(500, 24); ctx.fillText("Buscador de encaje docente", xT, y + 66);

    // Título
    y += 76 + 110;
    ctx.fillStyle = C.tinta; ctx.font = ARCHIVO(800, 104); ctx.fillText("¿QUÉ PUEDO", M - 4, y);
    const t2 = "IMPARTIR?";
    const w2 = ctx.measureText(t2).width;
    rect(ctx, M - 4, y + 18, w2 + 28, 112, 0, C.tinta);
    ctx.fillStyle = C.sol; ctx.fillText(t2, M + 10, y + 110);
    y += 130 + 62;

    // Titulaciones (el texto de la lista)
    ctx.fillStyle = C.gris; ctx.font = INTER(600, 26); ctx.fillText(S.etiquetas.length > 1 ? "Con mis titulaciones:" : "Con mi titulación:", M, y);
    y += 44;
    ctx.fillStyle = C.tinta; ctx.font = INTER(700, 34);
    const tits = S.etiquetas.slice(0, 3);
    for (const t of tits) for (const l of lineas(ctx, t, A, tits.length > 1 ? 1 : 2)) { ctx.fillText(l, M, y); y += 44; }
    if (S.etiquetas.length > 3) { ctx.font = INTER(500, 26); ctx.fillText("y " + (S.etiquetas.length - 3) + " más", M, y); y += 40; }
    y += 18;

    // Cifras por estado
    const anchoC = (A - 2 * 18) / 3, altoC = 184;
    [["puedes", C.ok, C.okT, "Puedo"], ["puedes_si_lo_acreditas", C.acr, C.acrT, "Si lo acredito"], ["revisa", C.rev, C.revT, "Por revisar"]].forEach(([k, fondo, texto, etq], i) => {
      const x = M + i * (anchoC + 18);
      rect(ctx, x, y, anchoC, altoC, 18, fondo);
      ctx.fillStyle = texto; ctx.font = ARCHIVO(800, 76); ctx.fillText(String(c[k].modulos), x + 22, y + 82);
      ctx.font = INTER(700, 25); ctx.fillText(etq, x + 22, y + 122);
      ctx.font = INTER(500, 22); ctx.fillText("módulos · " + plural(c[k].certificados, "cert.", "cert."), x + 22, y + 156);
    });
    y += altoC + 56;

    // Reparto por familia
    ctx.fillStyle = C.tinta; ctx.font = ARCHIVO(800, 30); ctx.fillText("POR FAMILIA", M, y);
    y += 22;
    const maxM = Math.max(1, ...familias.map((f) => f.modulos));
    const filas = familias.slice(0, 4);
    const alto = Math.min(78, (H - 150 - 70 - y) / Math.max(1, filas.length));
    for (const f of filas) {
      y += alto;
      const dcha = plural(f.certificados, "cert.", "cert.") + " · " + plural(f.modulos, "módulo", "módulos");
      ctx.font = INTER(500, 24); const wD = ctx.measureText(dcha).width;
      ctx.fillStyle = C.gris; ctx.fillText(dcha, W - M - wD, y - 22);
      ctx.fillStyle = C.tinta; ctx.font = INTER(700, 27);
      ctx.fillText(lineas(ctx, f.familia, A - wD - 24, 1)[0], M, y - 22);
      rect(ctx, M, y - 8, A, 12, 6, "rgba(17,17,17,0.12)");
      rect(ctx, M, y - 8, Math.max(12, A * f.modulos / maxM), 12, 6, C.tinta);
    }
    if (familias.length > 4) { y += 36; ctx.font = INTER(500, 22); ctx.fillStyle = C.gris; ctx.fillText("y " + (familias.length - 4) + " familias más", M, y); }

    // Aviso y marca de agua de abajo
    ctx.fillStyle = C.gris; ctx.font = INTER(500, 24);
    ctx.fillText("Resultado orientativo según la norma estatal", M, H - 150);
    ctx.fillStyle = C.tinta; ctx.fillRect(0, H - 110, W, 110);
    ctx.fillStyle = C.sol; ctx.font = ARCHIVO(800, 38); ctx.fillText("FP al día · fpaldia.es/impartir", M, H - 42);

    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
  }

  async function compartir() {
    const boton = $("#compartir"), estado = $("#estado-compartir");
    if (!S.res) return;
    boton.disabled = true; boton.setAttribute("aria-busy", "true");
    estado.textContent = "Preparando la imagen…";
    try {
      const blob = await dibujarImagen();
      const archivo = new File([blob], ARCHIVO_IMAGEN, { type: "image/png" });
      let compartido = false;
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: "Mi resultado · ¿Qué puedo impartir?", text: "Lo que puedo impartir según la norma estatal. Hazlo tú en fpaldia.es/impartir" });
          compartido = true;
          estado.textContent = "Imagen compartida.";
        } catch (e) {
          if (e && e.name === "AbortError") { estado.textContent = ""; return; }
        }
      }
      if (!compartido) {
        const url = URL.createObjectURL(blob);
        const a = el("a", { href: url, download: ARCHIVO_IMAGEN, hidden: true });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        estado.textContent = "Imagen descargada: " + ARCHIVO_IMAGEN + ".";
      }
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "impartir-compartir", title: "Compartir resultado", event: true }); } catch (e) { /* sin analítica */ }
    } catch (e) {
      estado.textContent = "No hemos podido crear la imagen. Prueba con otro navegador.";
    } finally { boton.disabled = false; boton.removeAttribute("aria-busy"); }
  }

  // --- Arranque ---
  async function iniciar() {
    $("#calcular").addEventListener("click", () => calcular("buscador"));
    $("#recalcular").addEventListener("click", () => calcular("afina"));
    $("#compartir").addEventListener("click", compartir);
    $("#cambiar").addEventListener("click", () => {
      $("#buscador").scrollIntoView({ block: "start", behavior: sinMovimiento() ? "auto" : "smooth" });
      $("#buscar-tit").focus({ preventScroll: true });
    });
    $("#comp-anadir").addEventListener("click", () => {
      const c = { tipo: $("#comp-tipo").value, idioma: $("#comp-idioma").value };
      if (!S.comp.some((x) => x.tipo === c.tipo && x.idioma === c.idioma)) S.comp.push(c);
      pintarIdiomas();
    });
    $("#buscador").addEventListener("change", (ev) => { if (ev.target.closest(".habil, #mas-cd")) marcarCambio(); });
    esperarTurnstile();
    try {
      const r = await fetch("/impartir/listas.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      LISTAS = await r.json();
    } catch (e) {
      mostrarError("#error-listas", "No se ha podido cargar la lista de titulaciones.", "Recarga la página. Si sigue igual, escríbenos a " + CORREO + ".");
      return;
    }
    const opTit = opcionesTitulacion(LISTAS), opExp = opcionesExperiencia(LISTAS);
    combo($("#buscar-tit"), $("#lista-tit"), () => opTit, anadirTitulacion, true);
    combo($("#buscar-exp"), $("#lista-exp"), () => opExp, (op) => {
      if (!S.exp.some((e) => e.op === op)) S.exp.push({ op, anios: "", n: S.sig++ });
      pintarExperiencia();
      const ult = S.exp.find((e) => e.op === op);
      const inp = ult && $("#e" + ult.n);
      if (inp) { inp.focus(); return "foco"; }
      return null;
    }, false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
