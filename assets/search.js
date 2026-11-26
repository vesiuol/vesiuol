/* assets/search.js — busca compartilhada das listas (Estante, 2026 e Desafio)

   Regra única, definida num lugar só:
   - ignora maiúsculas/minúsculas, acentos e pontuação ("Irã" = "ira" = "IRÃ");
   - a grafia precisa estar certa ("Hrã" não encontra "Irã");
   - com mais de uma palavra, todas precisam aparecer (em qualquer das colunas
     informadas pela página), em qualquer ordem.

   Uso nas páginas: VesiuolBusca.combina(textoDigitado, [coluna1, coluna2, ...])
   Devolve true se a linha deve aparecer. Cada página informa só as colunas de texto
   que ela mostra na lista (números e status não entram na busca). */
(function () {
  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function combina(consulta, colunas) {
    var termos = normalizar(consulta).split(' ').filter(Boolean);
    if (!termos.length) return true;
    var texto = colunas.map(normalizar).join(' | ');
    return termos.every(function (t) { return texto.indexOf(t) !== -1; });
  }

  window.VesiuolBusca = { normalizar: normalizar, combina: combina };
})();
