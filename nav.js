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
