/* «¿Qué puedo impartir?» · FP al día. Sin frameworks. El perfil va solo al Worker y no se guarda:
   ni en el navegador ni en el servidor. El ticket de /detalle vive solo en memoria. */
"use strict";
(function () {
  // --- Configuración: lo único que hay que cambiar al publicar ---
  // Sitekey pública del widget «eFPear impartir» (fpaldia.es, creado el 15/11/2026); en local, la clave de PRUEBA de Cloudflare.
  const TURNSTILE_SITEKEY = /^(localhost|127.0.0.1)$/.test(location.hostname) ? "1x00000000000000000000AA" : "0x4AAAAAAGCHICdwivgVzqoz";
  const API_LOCAL = "http://127.0.0.1:8787"; // npm run dev en codigo/encaje/worker
  const API_PRODUCCION = "https://efpear-encaje.efpear-encaje.workers.dev";
  const CORREO = "hola@fpaldia.es";
  const ESPERA_MS = 20000;

  const esLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = esLocal ? API_LOCAL : API_PRODUCCION;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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

  const ESTADOS = {
    puedes: "Puedes",
    puedes_si_lo_acreditas: "Puedes si lo acreditas",
    revisa: "Revisa",
  };
  const AYUDA_ESTADO = {
    puedes: "La norma estatal lo prevé para tu perfil.",
    puedes_si_lo_acreditas: "Encajas cuando termines la habilitación docente.",
    revisa: "Puede que encajes, pero hay que confirmarlo con la administración.",
  };

  // --- Estado (solo en memoria) ---
  const S = {
    paso: 1, tit: [], exp: [], comp: [],
    widget: null, token: null, ticket: null, caduca: 0, perfil: null, res: null,
    filtro: "todos", detalles: new Map(), bloqueadoHasta: 0, sig: 1,
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
      el("b", { text: "No está en la lista oficial: con este título el resultado no se compara y saldrá «revisa»." }),
      el("div", { class: "correo" },
        el("a", { class: "btn sec chico", href: enlaceCorreo(texto) }, "Avisar de que falta ↗"),
        el("span", null, "o escribe a ", el("code", { text: CORREO }))));
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
          x.libre ? [el("b", { text: "No está: usar «" + x.etiqueta + "»" }), el("small", { text: "Saldrá «revisa». Podrás avisarnos para añadirla." })]
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

  // --- Paso 1: titulaciones ---
  function pintarTitulaciones() {
    const ul = $("#elegidos-tit");
    ul.textContent = "";
    S.tit.forEach((t, i) => {
      const o = t.op;
      const nombre = o.libre ? "«" + o.etiqueta + "»" : o.etiqueta;
      const li = el("li", { class: "elegido" + (o.libre ? " libre" : "") },
        el("div", { class: "cab" },
          el("span", { class: "nom" }, el("small", { text: o.libre ? "Escrita a mano" : (o.detalle || "") }), nombre),
          el("button", { type: "button", class: "quitar", "aria-label": "Quitar " + nombre, onclick: () => { S.tit.splice(i, 1); pintarTitulaciones(); $("#buscar-tit").focus(); } }, "Quitar")));
      const extra = el("div", { class: "extra" });
      const id = "t" + t.n;
      if (o.extra === "denominacion") {
        extra.append(el("label", { for: id + "-den" }, "Nombre exacto del título (opcional)",
          el("input", { type: "text", id: id + "-den", value: t.v.denominacion || "", placeholder: o.tipo === "univ_grado" ? "Ej.: Graduado en Turismo" : o.tipo === "univ_diplomado" ? "Ej.: Diplomado en Turismo" : "Ej.: Licenciado en Biología",
            oninput: (ev) => { t.v.denominacion = ev.target.value; } })));
      } else if (o.extra === "area") {
        const areas = (LISTAS.areas[o.familia] || []);
        if (areas.length) {
          const sel = el("select", { id: id + "-area", onchange: (ev) => { t.v.area = ev.target.value; } },
            el("option", { value: "" }, "No lo sé / otra"), areas.map((a) => el("option", { value: a, selected: t.v.area === a }, a)));
          extra.append(el("label", { for: id + "-area" }, "Área profesional (opcional)", sel));
        } else {
          extra.append(el("label", { for: id + "-area" }, "Área profesional (opcional)",
            el("input", { type: "text", id: id + "-area", value: t.v.area || "", oninput: (ev) => { t.v.area = ev.target.value; } })));
        }
      } else if (o.extra === "extranjera") {
        extra.append(el("label", { for: id + "-idi" }, "Idioma del país donde la cursaste",
          el("select", { id: id + "-idi", onchange: (ev) => { t.v.idioma = ev.target.value; } },
            ["inglés", "francés", "alemán", "italiano", "portugués", "otro"].map((x) => el("option", { selected: t.v.idioma === x }, x)))));
        extra.append(el("label", { class: "opc" }, el("input", { type: "checkbox", checked: !!t.v.homologada, onchange: (ev) => { t.v.homologada = ev.target.checked; } }), "Está homologada en España"));
      }
      if (extra.childNodes.length) li.append(extra);
      if (o.libre) li.append(notaCorreo(o.etiqueta));
      ul.append(li);
    });
  }
  function anadirTitulacion(op) {
    if (!op.libre && S.tit.some((t) => t.op === op)) return;
    const v = {};
    if (op.extra === "extranjera") v.idioma = "inglés";
    S.tit.push({ op, v, n: S.sig++ });
    pintarTitulaciones();
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

  // --- Paso 3: experiencia e idiomas ---
  function pintarExperiencia() {
    const ul = $("#elegidos-exp");
    ul.textContent = "";
    S.exp.forEach((e, i) => {
      const id = "e" + e.n;
      ul.append(el("li", { class: "elegido" },
        el("div", { class: "cab" },
          el("span", { class: "nom" }, el("small", { text: e.op.detalle }), e.op.etiqueta),
          el("button", { type: "button", class: "quitar", "aria-label": "Quitar " + e.op.etiqueta, onclick: () => { S.exp.splice(i, 1); pintarExperiencia(); pintarResumen(); $("#buscar-exp").focus(); } }, "Quitar")),
        el("label", { class: "anios", for: id }, "Años de experiencia",
          el("input", { type: "number", id, min: "0.5", max: "60", step: "0.5", inputmode: "decimal", value: e.anios || "", required: true,
            oninput: (ev) => { e.anios = ev.target.value; pintarResumen(); } }))));
    });
  }
  function pintarIdiomas() {
    const ul = $("#elegidos-comp");
    ul.textContent = "";
    const nombres = Object.fromEntries($$("#comp-tipo option").map((o) => [o.value, o.textContent]));
    S.comp.forEach((c, i) => {
      ul.append(el("li", { class: "elegido" }, el("div", { class: "cab" },
        el("span", { class: "nom" }, nombres[c.tipo] + " · " + c.idioma),
        el("button", { type: "button", class: "quitar", onclick: () => { S.comp.splice(i, 1); pintarIdiomas(); pintarResumen(); } }, "Quitar"))));
    });
  }

  // --- Perfil (lo único que sale del navegador) ---
  function competenciaPerfil() {
    const marc = (n) => $$('input[name="' + n + '"]:checked').map((x) => x.value);
    const cd = { acreditada: marc("acreditada"), en_curso: marc("en_curso"), exenciones: marc("exenciones") };
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
  function pintarResumen() {
    const r = $("#resumen-perfil");
    r.textContent = "";
    const cd = competenciaPerfil();
    const n = cd.acreditada.length + cd.en_curso.length + cd.exenciones.length + (cd.horas_docencia_fp_10_anios ? 1 : 0);
    r.append(el("b", { text: "Vas a consultar con:" }), el("ul", null,
      el("li", { text: S.tit.length ? S.tit.length + " titulación(es): " + S.tit.map((t) => t.op.etiqueta).join("; ") : "Sin titulación" }),
      el("li", { text: n ? "Competencia docente: " + n + " opción(es) marcada(s)" : "Sin competencia docente marcada" }),
      el("li", { text: S.exp.length ? S.exp.length + " experiencia(s)" : "Sin experiencia profesional" }),
      S.comp.length ? el("li", { text: S.comp.length + " idioma(s)" }) : null));
  }

  // --- Navegación entre pasos ---
  function irA(n) {
    if (n === 4 && !S.res) n = 3;
    S.paso = n;
    for (let i = 1; i <= 4; i++) $("#paso-" + i).hidden = i !== n;
    $$("#pasos li").forEach((li) => {
      const p = Number(li.dataset.paso);
      if (p === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      li.classList.toggle("hecho", p < n);
    });
    if (n === 3) { pintarResumen(); prepararTurnstile(); }
    const h = $("#t" + n);
    h.focus({ preventScroll: true });
    $("#app").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  // --- Turnstile ---
  window.alCargarTurnstile = function () { if (S.paso === 3) prepararTurnstile(); };
  function prepararTurnstile() {
    if (S.widget !== null) return;
    if (!window.turnstile) {
      setTimeout(() => {
        if (S.widget === null && !window.turnstile && S.paso === 3) {
          mostrarError("#error-calc", "No se ha podido cargar la comprobación de seguridad.", "Puede que un bloqueador de contenido impida cargar Cloudflare Turnstile (challenges.cloudflare.com). Desactívalo para esta página y recárgala.");
        }
      }, 8000);
      return;
    }
    S.widget = window.turnstile.render("#turnstile", {
      sitekey: TURNSTILE_SITEKEY, language: "es", action: "evaluar",
      callback: (t) => { S.token = t; limpiarError("#error-calc"); },
      "expired-callback": () => { S.token = null; },
      "error-callback": () => {
        S.token = null;
        mostrarError("#error-calc", "La comprobación de seguridad ha fallado.", "Recarga la página y vuelve a intentarlo.");
        return true;
      },
    });
  }
  function renovarTurnstile() {
    S.token = null;
    if (S.widget !== null && window.turnstile) window.turnstile.reset(S.widget);
  }

  // --- Errores ---
  function mostrarError(sel, titulo, texto) {
    const c = $(sel);
    c.textContent = "";
    c.append(el("div", { class: "error" }, el("b", { text: titulo }), texto || ""));
  }
  function limpiarError(sel) { $(sel).textContent = ""; }

  /** Llama al Worker. Devuelve {ok, estado, datos} o lanza {titulo, texto, estado, codigo}. */
  async function llamar(ruta, cuerpo, cabeceras) {
    if (!API) throw { titulo: "El buscador aún no está disponible.", texto: "Estamos terminando de ponerlo en marcha. Vuelve en unos días." };
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
  function bloquear(boton, seg, estadoSel) {
    S.bloqueadoHasta = Date.now() + seg * 1000;
    boton.disabled = true;
    const tic = () => {
      const quedan = Math.ceil((S.bloqueadoHasta - Date.now()) / 1000);
      if (quedan <= 0) { boton.disabled = false; $(estadoSel).textContent = "Ya puedes volver a consultar."; return; }
      $(estadoSel).textContent = "Podrás volver a consultar en " + quedan + " s.";
      setTimeout(tic, 1000);
    };
    tic();
  }

  // --- Calcular (/evaluar) ---
  async function calcular() {
    const boton = $("#calcular");
    limpiarError("#error-calc");
    if (Date.now() < S.bloqueadoHasta) return;
    const sinAnios = S.exp.find((e) => !(Number(e.anios) > 0));
    if (sinAnios) {
      mostrarError("#error-calc", "Falta un dato.", "Indica los años de experiencia de «" + sinAnios.op.etiqueta + "».");
      const inp = $("#e" + sinAnios.n); if (inp) inp.focus();
      return;
    }
    if (!S.tit.length && !S.exp.length) {
      mostrarError("#error-calc", "Falta un dato.", "Añade al menos una titulación (paso 1) o una experiencia profesional.");
      $("#buscar-exp").focus();
      return;
    }
    if (!S.token) {
      mostrarError("#error-calc", "Falta la comprobación de seguridad.", window.turnstile ? "Espera a que la casilla de Cloudflare se marque (o márcala) y vuelve a pulsar." : "Se está cargando. Si no aparece, recarga la página.");
      return;
    }
    const perfil = construirPerfil();
    const token = S.token;
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    $("#estado-calc").textContent = "Calculando tu resultado…";
    try {
      const d = await llamar("/evaluar", perfil, { "X-Turnstile-Token": token });
      S.res = d; S.perfil = perfil; S.ticket = d.ticket; S.caduca = Date.now() + (d.ticket_segundos || 900) * 1000;
      S.detalles = new Map(); S.filtro = "todos";
      delete d.ticket;
      $("#estado-calc").textContent = "";
      pintarResultado();
      irA(4);
      try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "impartir-consulta", title: "Consulta de encaje docente", event: true }); } catch (e) { /* sin analítica */ }
    } catch (e) {
      $("#estado-calc").textContent = "";
      mostrarError("#error-calc", e.titulo || "No hemos podido hacer la consulta.", e.texto || "");
      if (e.estado === 429) bloquear(boton, e.seg, "#estado-calc");
    } finally {
      boton.removeAttribute("aria-busy");
      if (Date.now() >= S.bloqueadoHasta) boton.disabled = false;
      renovarTurnstile(); // cada token sirve una sola vez
    }
  }

  // --- Resultado ---
  function contar(bloques) {
    const c = { puedes: 0, puedes_si_lo_acreditas: 0, revisa: 0 };
    for (const b of bloques) for (const m of b.modulos) if (c[m.estado] != null) c[m.estado]++;
    return c;
  }
  function pintarResultado() {
    const g = S.res;
    const caja = $("#resultado");
    caja.textContent = "";
    $("#res-aviso").textContent = g.aviso || "";
    const todos = (g.en_tu_familia || []).concat(g.en_el_resto || []);
    const c = contar(todos);
    const numCita = new Map((g.citas_comunes || []).map((x, i) => [x.id, i + 1]));

    caja.append(el("div", { class: "res-cab" },
      el("div", { class: "cifra ok" }, el("b", { text: c.puedes }), el("span", { text: "módulos: Puedes" })),
      el("div", { class: "cifra acr" }, el("b", { text: c.puedes_si_lo_acreditas }), el("span", { text: "Puedes si lo acreditas" })),
      el("div", { class: "cifra rev" }, el("b", { text: c.revisa }), el("span", { text: "Revisa" })),
      el("div", { class: "cifra" }, el("b", { text: todos.length }), el("span", { text: "certificados" }))));

    const cd = g.competencia_docente;
    if (cd) {
      const tit = { ok: "Tienes la competencia docente", en_curso: "Competencia docente en curso", revisa: "Competencia docente: revisa", falta: "Te falta la competencia docente" }[cd.estado] || "Competencia docente";
      const citas = Array.isArray(cd.citas) && cd.citas.length ? cd.citas : (cd.cita ? [{ fuente: cd.fuente, cita: cd.cita }] : []);
      caja.append(el("div", { class: "cd" }, el("h3", { text: tit }), el("p", { text: cd.motivo || "" }),
        cd.fuente ? el("p", { class: "fuente", text: "Regla " + (cd.regla || "") + " · " + cd.fuente }) : null,
        citas.length ? el("details", null, el("summary", null, "Ver la norma"),
          citas.map((x) => el("div", { class: "detalle", style: "margin-top:8px" }, el("blockquote", { text: "«" + x.cita + "»" }), el("p", { class: "fuente", text: x.fuente })))) : null));
    }

    const avisos = (g.avisos || []).slice();
    if (avisos.length || (g.sin_comparar || []).length) {
      const ul = el("ul", { class: "lista-avisos", "aria-label": "Avisos" });
      avisos.forEach((a) => ul.append(el("li", { text: a })));
      caja.append(ul);
      (g.sin_comparar || []).forEach((s) => caja.append(el("div", null, el("p", { style: "margin:0 0 4px" }, el("b", { text: "«" + s.texto + "»: " }), s.motivo || ""), notaCorreo(s.texto))));
    }

    if (!todos.length) {
      caja.append(el("div", { class: "nota", style: "margin-top:16px" }, el("b", { text: "Con estos datos no sale ningún módulo de las tres familias del piloto." }),
        el("p", { style: "margin:6px 0 0" }, "Revisa tu titulación y tu competencia docente, o añade tu experiencia. Si tu familia no está en el piloto, la iremos añadiendo: suscríbete a la newsletter para enterarte.")));
      return;
    }

    if ((g.citas_comunes || []).length) {
      caja.append(el("div", { class: "comunes" }, el("h3", { text: "Frases de la norma que se repiten" }),
        el("p", { class: "fuente", style: "margin:0 0 8px" }, "Las mostramos una vez. Cada módulo indica cuál le corresponde."),
        el("ol", null, g.citas_comunes.map((x) => el("li", null,
          el("b", { text: "Frase " + numCita.get(x.id) }), " · abre " + x.modulos + " módulos de " + x.certificados + " certificado(s)",
          el("blockquote", { text: "«" + x.texto + "»" }))))));
    }

    const filtro = el("div", { class: "filtro", role: "group", "aria-label": "Filtrar por estado" });
    [["todos", "Todos"], ["puedes", ESTADOS.puedes], ["puedes_si_lo_acreditas", ESTADOS.puedes_si_lo_acreditas], ["revisa", ESTADOS.revisa]].forEach(([k, t]) => {
      const n = k === "todos" ? c.puedes + c.puedes_si_lo_acreditas + c.revisa : c[k];
      if (k !== "todos" && !n) return;
      filtro.append(el("button", { type: "button", "aria-pressed": S.filtro === k ? "true" : "false", onclick: () => { S.filtro = k; pintarResultado(); $('.filtro button[aria-pressed="true"]').focus(); } }, t + " (" + n + ")"));
    });
    caja.append(filtro);

    const fams = g.familias_experiencia || [];
    caja.append(bloque("En tu familia", fams.length ? "Certificados de " + fams.join(", ") + ", donde declaras experiencia profesional." : "Añade tu experiencia profesional (paso 3) para ver aquí los certificados de tu familia.", g.en_tu_familia || [], numCita));
    caja.append(bloque("En el resto", "Lo que te permiten tu titulación o tu competencia docente en las demás familias del piloto.", g.en_el_resto || [], numCita));
  }

  function bloque(titulo, texto, certs, numCita) {
    const sec = el("section", { class: "bloque" }, el("h3", { text: titulo }), el("p", { text: texto }));
    const filtrados = certs.map((b) => ({ b, mods: b.modulos.filter((m) => S.filtro === "todos" || m.estado === S.filtro) })).filter((x) => x.mods.length);
    if (certs.length && !filtrados.length) sec.append(el("p", { text: "Ningún módulo con este filtro." }));
    for (const { b, mods } of filtrados) {
      const cuentas = el("span", { class: "cuentas" });
      for (const k of Object.keys(ESTADOS)) {
        const n = mods.filter((m) => m.estado === k).length;
        if (n) cuentas.append(el("span", { class: "est " + k, text: n + " · " + ESTADOS[k] }));
      }
      const d = el("details", { class: "cert" },
        el("summary", null,
          el("span", { class: "cn", text: b.codigo + " · " + b.denominacion }),
          el("span", { class: "cm", text: ["Nivel " + b.nivel, b.familia, b.area].filter(Boolean).join(" · ") }),
          cuentas));
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
      if (e.codigo === "verificacion") { pintarCaducado(panel, e.texto); }
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
      texto || "Por seguridad, cada consulta vale 15 minutos. Vuelve a calcular el resultado (tus datos siguen puestos).",
      el("div", { style: "margin-top:8px" }, el("button", { type: "button", class: "btn sec chico", onclick: () => irA(3) }, "Volver a calcular"))));
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
    panel.append(dl, el("p", { class: "fuente", style: "margin:10px 0 0", text: "Orientativo: confírmalo con el centro o con el servicio público de empleo. Tu comunidad puede pedir más." }));
  }

  // --- Arranque ---
  function nuevaConsulta() {
    S.tit = []; S.exp = []; S.comp = []; S.res = null; S.ticket = null; S.perfil = null; S.detalles = new Map();
    $$("#paso-2 input[type=checkbox]").forEach((x) => { x.checked = false; });
    $("#horas").value = "";
    pintarTitulaciones(); pintarExperiencia(); pintarIdiomas();
    $("#resultado").textContent = "";
    irA(1);
  }

  async function iniciar() {
    $$("[data-ir]").forEach((b) => b.addEventListener("click", () => irA(Number(b.dataset.ir))));
    $("#calcular").addEventListener("click", calcular);
    $("#nueva").addEventListener("click", nuevaConsulta);
    $("#comp-anadir").addEventListener("click", () => {
      const c = { tipo: $("#comp-tipo").value, idioma: $("#comp-idioma").value };
      if (!S.comp.some((x) => x.tipo === c.tipo && x.idioma === c.idioma)) S.comp.push(c);
      pintarIdiomas(); pintarResumen();
    });
    $("#paso-2").addEventListener("change", pintarResumen);
    try {
      const r = await fetch("/impartir/listas.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      LISTAS = await r.json();
    } catch (e) {
      mostrarError("#nota-libre", "No se ha podido cargar la lista de titulaciones.", "Recarga la página. Si sigue sin cargar, escríbenos a " + CORREO + ".");
      $("#nota-libre").hidden = false;
      return;
    }
    const opTit = opcionesTitulacion(LISTAS), opExp = opcionesExperiencia(LISTAS);
    combo($("#buscar-tit"), $("#lista-tit"), () => opTit, anadirTitulacion, true);
    combo($("#buscar-exp"), $("#lista-exp"), () => opExp, (op) => {
      if (!S.exp.some((e) => e.op === op)) S.exp.push({ op, anios: "", n: S.sig++ });
      pintarExperiencia(); pintarResumen();
      const ult = S.exp.find((e) => e.op === op);
      const inp = ult && $("#e" + ult.n);
      if (inp) { inp.focus(); return "foco"; }
      return null;
    }, false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
