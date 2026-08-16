// Troca o content="" de uma <meta> específica, localizando-a por um atributo
// âncora (name="description", property="og:title" etc.), sem depender da
// ordem dos atributos nem do valor antigo do content.
function setMetaContent(html, anchorAttrRegex, newValue) {
  const tagRegex = new RegExp(`<meta[^>]*${anchorAttrRegex.source}[^>]*>`, 'i');
  return html.replace(tagRegex, (fullTag) =>
    fullTag.replace(/content="[^"]*"/, `content="${escapeHtml(newValue)}"`)
  );
}

// --- 3b. Atualizar (re-sincronizar) um post JÁ PUBLICADO ---------------------
// Sincroniza corpo do texto, tags, tempo de leitura E (desde 2026-08-16, ver
// Registro de Decisões) título/meta/JSON-LD. A URL do post (nome do arquivo,
// canonical, og:url) NUNCA muda aqui — só o texto exibido é atualizado, então
// nada que referencia o post pela URL (home, manifesto, sitemap, links
// internos) é afetado.
function updateArticleContent(existingHtml, post) {
  let html = existingHtml;
  const newTitleFull = `${post.title} — Biblioteca Vesiuol`;
  const newDesc = post.metaDescription;

  // <title>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(newTitleFull)}</title>`);

  // meta description / og:description / twitter:description
  html = setMetaContent(html, /name="description"/, newDesc);
  html = setMetaContent(html, /property="og:description"/, newDesc);
  html = setMetaContent(html, /name="twitter:description"/, newDesc);

  // og:title / twitter:title
  html = setMetaContent(html, /property="og:title"/, newTitleFull);
  html = setMetaContent(html, /name="twitter:title"/, newTitleFull);

  // JSON-LD: headline / description (canonical/URL do JSON-LD não é tocado)
  html = html.replace(/"headline":\s*"[^"]*",/, `"headline": ${JSON.stringify(post.title)},`);
  html = html.replace(/"description":\s*"[^"]*",/, `"description": ${JSON.stringify(newDesc)},`);

  // h1
  html = html.replace(
    /(<h1 class="intro-headline">)[^<]*(<\/h1>)/,
    `$1${escapeHtml(post.title)}$2`
  );

  // breadcrumb (texto da página atual, não-clicável)
  html = html.replace(
    /(<span class="breadcrumb-current" aria-current="page">)[^<]*(<\/span>)/,
    `$1${escapeHtml(post.title)}$2`
  );

  // corpo do artigo
  html = html.replace(
    /<div class="article-body">[\s\S]*?<\/div>\n {4}<div class="article-tags">/,
    `<div class="article-body">\n${post.bodyHtml}\n</div>\n    <div class="article-tags">`
  );

  // tags + tags extras
  const tagsHtml = post.tags.map((t) => `<a class="post-tag" href="/vesiuol/blog/?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('');
  const extraTagsHtml =
    post.extraTags && post.extraTags.length
      ? `\n    <div class="article-tags-extra">${post.extraTags.map((t) => `<span class="post-tag-extra">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
  html = html.replace(/\n {4}<div class="article-tags-extra">[\s\S]*?<\/div>/, '');
  html = html.replace(
    /<div class="article-tags">[\s\S]*?<\/div>\n {2}<\/div>\n {2}<div class="related-wrap">/,
    `<div class="article-tags">${tagsHtml}</div>${extraTagsHtml}\n  </div>\n  <div class="related-wrap">`
  );

  // article-meta: mantém a data que já estava no arquivo, só recalcula o tempo de leitura
  html = html.replace(
    /(<div class="article-meta">[^·]+· )\d+( min de leitura<\/div>)/,
    `$1${post.readingTime}$2`
  );

  return html;
}
