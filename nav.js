// Menú común de fpaldia.es (v3, 18/11/2026): la pastilla negra se coloca en la sección activa,
// sigue al ratón y vuelve al salir, como en la portada. La publica codigo/radar_web.py en /nav.js.
(function () {
  var nav = document.getElementById("nav");
  if (!nav) return;
  var sl = nav.querySelector(".slider");
  var links = nav.querySelectorAll("a");
  var actual = nav.querySelector("a.on");
  if (!sl) return;
  nav.classList.add("js");
  function mover(a) {
    if (!a) { sl.style.opacity = "0"; links.forEach(function (x) { x.classList.remove("sobre"); }); return; }
    sl.style.opacity = "1";
    sl.style.left = a.offsetLeft + "px";
    sl.style.width = a.offsetWidth + "px";
    links.forEach(function (x) { x.classList.toggle("sobre", x === a); });
  }
  // Primera colocación sin transición, para que no entre deslizándose desde la izquierda.
  sl.style.transition = "none";
  mover(actual);
  void sl.offsetWidth;
  sl.style.transition = "";
  links.forEach(function (a) {
    a.addEventListener("mouseenter", function () { mover(a); });
    a.addEventListener("focus", function () { mover(a); });
  });
  nav.addEventListener("mouseleave", function () { mover(actual); });
  nav.addEventListener("focusout", function (e) { if (!nav.contains(e.relatedTarget)) mover(actual); });
  window.addEventListener("resize", function () { mover(actual); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { mover(actual); });
})();

// Entrada de la página, con los mismos valores que la portada (landing.html): el menú baja, el titular
// sube desde su línea y los bloques entran uno tras otro. Sin movimiento si la persona lo ha pedido.
(function () {
  if (!document.body || !document.body.animate) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var suave = "cubic-bezier(.2,.8,.2,1)";
  // Al terminar, cada animación se quita: el elemento vuelve a su estilo normal, sin transform residual.
  function limpia(a) { if (a && a.finished) a.finished.then(function () { a.cancel(); }, function () {}); return a; }
  var nav = document.getElementById("nav");
  if (nav) limpia(nav.animate([{ transform: "translateY(-20px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 700, easing: "ease-out", fill: "both" }));
  var h1 = document.querySelector("h1");
  if (h1) limpia(h1.animate([{ transform: "translateY(.35em)", clipPath: "inset(0 0 100% 0)" }, { transform: "none", clipPath: "inset(0 0 0 0)" }], { duration: 1000, delay: 120, easing: suave, fill: "both" }));
  var vistos = [];
  document.querySelectorAll("header > *, .hero > *, .wrap > *, main > *, body > section, body > .strip, body > .cta, body > footer").forEach(function (el) {
    if (el === h1 || el.contains(nav) || el.contains(h1) || el.tagName === "NOSCRIPT" || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    if (vistos.some(function (v) { return v.contains(el) || el.contains(v); })) return;
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return;   // ocultos
    vistos.push(el);
  });
  vistos.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
  vistos.slice(0, 12).forEach(function (el, i) {
    limpia(el.animate([{ transform: "translateY(14px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 800, delay: 250 + i * 55, easing: suave, fill: "both" }));
  });
})();
