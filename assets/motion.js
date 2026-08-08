// ============================================================
// MOTION.JS — Biblioteca Vesiuol
// Observer genérico de scroll-reveal, compartilhado por todas
// as páginas. Não sabe nada sobre dado ou conteúdo: só observa
// elementos com a classe "reveal" e adiciona "in-view" quando
// eles entram na tela. Editar SÓ aqui quando a lógica de motion
// mudar — nunca duplicar em cada página.
// ============================================================
(function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealAll() {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('in-view');
    });
  }

  if (prefersReduced || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.reveal').forEach(function (el) {
      observer.observe(el);
    });
  });
})();
