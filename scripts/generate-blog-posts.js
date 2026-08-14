#!/usr/bin/env node
/**
 * Gera posts novos do blog (Biblioteca Vesiuol) a partir da base "Textos blog" no Notion.
 *
 * Como funciona:
 *  1. Busca páginas com Status = "Pronto para publicar" na base Textos blog.
 *  2. Para cada uma, lê o conteúdo (blocos) da própria página do Notion.
 *  3. Clona blog/como-escolhi-um-livro-por-pais-rota-1/index.html (template
 *     canônico, ver Governança Blog) e substitui título, meta tags, JSON-LD,
 *     corpo do texto, tags e "Outras leituras".
 *  4. Escreve o HTML novo em blog/<slug>/index.html — NUNCA sobrescreve um
 *     arquivo que já existe (posts publicados não são reescritos por este
 *     script). Formato de pasta desde a migração de URLs de 12/08/2026.
 *  5. Insere o card do post novo em blog/index.html (topo da grade) e
 *     atualiza o contador "textos publicados".
 *  6. Atualiza data/blog-posts.json (manifesto simples de todos os posts).
 *  7. Marca a página no Notion como Status = "Publicado".
 *
 * Ciclo de vida do campo Status (base Textos blog, ver Governança Blog):
 *  - "Pronto para publicar" → gera o post pela primeira vez (passo 3 acima).
 *    Se blog/<slug>/index.html já existir, pula e avisa (nunca sobrescreve).
 *  - "Atualizar"            → resincroniza um post JÁ publicado: corpo do
 *    texto, tags e tempo de leitura na PRÓPRIA página (não mexe em título/
 *    meta/JSON-LD). ALÉM DISSO, se o card não estiver em blog/index.html
 *    e/ou o post não estiver em data/blog-posts.json — porque um "Rascunho"
 *    anterior os removeu (ver abaixo) — este passo os RECRIA automaticamente.
 *    Ou seja, "Atualizar" é também o caminho de volta de um post oculto.
 *  - "Rascunho"             → se o arquivo do post NÃO existe ainda, é só um
 *    rascunho normal sendo escrito (nada a fazer). Se o arquivo JÁ existe
 *    (post publicado antes), este status OCULTA o post: remove o card de
 *    blog/index.html e a entrada de data/blog-posts.json, decrementa o
 *    contador "textos publicados", mas MANTÉM o arquivo blog/<slug>/index.html
 *    no ar (acessível por URL direta). Não publica nada novo nem sincroniza.
 *  - "Excluído"             → apaga de vez: arquivo, card e manifesto.
 *  - "Publicado"            → estado final, estático. NÃO é buscado por
 *    fetchReadyPages() — o script nunca olha pra páginas nesse status. Editar
 *    o Status direto pra "Publicado" no Notion não aciona nada no site.
 *
 * Variáveis de ambiente necessárias:
 *  - NOTION_TOKEN        token de integração interna do Notion (secret do GitHub)
 *  - NOTION_BLOG_DB_ID   ID da base "Textos blog" (sem hífens ou com, tanto faz)
 *
 * IMPORTANTE (leia antes do primeiro uso):
 *  - A base "Textos blog" precisa estar compartilhada com a integração do Notion
 *    que gerou o NOTION_TOKEN (Notion > ... > Conexões > adicionar a integração).
 *  - Convenção de imagem no corpo do texto, escrita direto no Notion como um
 *    parágrafo próprio:
 *        [IMAGEM: nome-do-arquivo.jpg]
 *        Legenda: texto opcional da legenda
 *    A imagem em si precisa ser enviada manualmente para assets/img/blog/ no
 *    repositório — o gerador só referencia o nome do arquivo.
 *  - Rode primeiro manualmente (workflow_dispatch) e confira o resultado antes
 *    de confiar no agendamento automático.
 */

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_BLOG_DB_ID = process.env.NOTION_BLOG_DB_ID;
const NOTION_VERSION = '2022-06-28';

const REPO_ROOT = path.join(__dirname, '..');
const BLOG_DIR = path.join(REPO_ROOT, 'blog');
const INDEX_PATH = path.join(BLOG_DIR, 'index.html');
const TEMPLATE_PATH = path.join(BLOG_DIR, 'como-escolhi-um-livro-por-pais-rota-1', 'index.html');
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', 'blog-posts.json');
const SITE_BASE = 'https://vesiuol.github.io/vesiuol';

// Valores exatos do template canônico (blog/como-escolhi-um-livro-por-pais-rota-1/index.html),
// usados como "âncoras" para saber o que substituir. Se o template canônico mudar de
// verdade (não só o texto do post, mas a estrutura do HTML), essas constantes precisam
// ser atualizadas junto — ver Governança Blog > Padrão obrigatório.
const OLD = {
  slug: 'como-escolhi-um-livro-por-pais-rota-1',
  title: 'Desafio livros pelo mundo: como escolhi os livros por país',
  desc: 'Desafio livros pelo mundo — um livro para cada país: como organizo minha lista de leituras, critérios de escolha e os primeiros países da rota.',
  articleMeta: '26 jul 2024 · 2 min de leitura',
  datePublished: '2024-07-26',
  dateModified: '2026-07-27',
  keywords: '["Livros Pelo Mundo", "Organização", "Desafio Literário"]'
};

function fail(msg) {
  console.error('ERRO: ' + msg);
  process.exit(1);
}

if (!NOTION_TOKEN || !NOTION_BLOG_DB_ID) {
  fail('faltam as variáveis de ambiente NOTION_TOKEN e/ou NOTION_BLOG_DB_ID.');
}

async function notionRequest(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status} em ${url}: ${body}`);
  }
  return res.json();
}

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

// O campo "URL" no Notion pode vir de duas formas: só o slug ("meu-post") ou o
// caminho completo como foi publicado originalmente ("blog/meu-post.html").
// Normaliza pra sempre extrair só o nome do arquivo, sem pasta nem extensão.
function normalizeSlugField(rawUrl, title) {
  if (!rawUrl) return slugify(title);
  let clean = rawUrl.trim();
  clean = clean.replace(/^https?:\/\/[^/]+\/(vesiuol\/)?/i, ''); // remove domínio, se colou a URL inteira
  clean = clean.replace(/^blog\//i, ''); // remove prefixo de pasta
  clean = clean.replace(/\.html?$/i, ''); // remove extensão
  clean = clean.replace(/^\/+|\/+$/g, '');
  return clean ? slugify(clean) : slugify(title);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPlainText(richTextArr) {
  return (richTextArr || []).map((t) => t.plain_text).join('');
}

function richTextToHtml(richTextArr) {
  return (richTextArr || [])
    .map((t) => {
      let text = escapeHtml(t.plain_text);
      if (t.annotations && t.annotations.bold) text = `<strong>${text}</strong>`;
      if (t.annotations && t.annotations.italic) text = `<em>${text}</em>`;
      if (t.href) text = `<a href="${t.href}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join('');
}

// "Outras leituras": prioriza posts com pelo menos 1 tag em comum; sem match nenhum,
// cai de volta pro comportamento antigo (mais recentes), já que o manifest já vem
// ordenado por data (unshift = mais novo primeiro) e o sort abaixo é estável.
function pickRelatedCards(manifest, post) {
  const currentTags = post.tags || [];
  return manifest
    .filter((m) => m.slug !== post.slug)
    .map((m) => ({ item: m, shared: (m.tags || []).filter((t) => currentTags.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 3)
    .map((s) => s.item);
}

function formatDateShort(iso) {
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]} ${y}`;
}

function readingTime(wordCount) {
  return Math.max(1, Math.round(wordCount / 200));
}

// --- 1. Buscar páginas prontas para publicar --------------------------------

async function fetchReadyPages() {
  const data = await notionRequest(`https://api.notion.com/v1/databases/${NOTION_BLOG_DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        or: [
          { property: 'Status', select: { equals: 'Pronto para publicar' } },
          { property: 'Status', select: { equals: 'Atualizar' } },
          { property: 'Status', select: { equals: 'Rascunho' } },
          { property: 'Status', select: { equals: 'Excluído' } }
        ]
      },
      sorts: [{ property: 'Data de publicação', direction: 'ascending' }]
    })
  });
  return data.results;
}

async function fetchAllBlocks(blockId) {
  let blocks = [];
  let cursor;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const data = await notionRequest(url.toString());
    blocks = blocks.concat(data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return blocks;
}

// --- 2. Converter blocos do Notion em HTML do corpo do artigo ---------------

function blocksToArticle(blocks, tags) {
  const isDesafioLpm = (tags || []).includes('Livros Pelo Mundo');
  let html = '';
  let firstParagraphText = '';
  let wordCount = 0;
  let listBuffer = [];

  function flushList() {
    if (listBuffer.length) {
      html += `<ul>\n${listBuffer.join('\n')}\n</ul>\n`;
      listBuffer = [];
    }
  }

  for (const block of blocks) {
    const type = block.type;
    if (type !== 'bulleted_list_item' && type !== 'numbered_list_item') flushList();

    if (type === 'paragraph') {
      const text = getPlainText(block.paragraph.rich_text);
      const rotuloMatch = text.match(/^\[CITACAO-ROTULO:\s*([^\]]+)\]$/i);
      if (rotuloMatch) {
        html += `<h3 class="quote-label-pill">${escapeHtml(rotuloMatch[1].trim())}</h3>\n`;
        continue;
      }
      const livroMatch = text.match(/^\[LIVRO:\s*([^|]+)\|([^|]+)\|([^\]]+)\]$/i);
      if (livroMatch) {
        const [, country, bookTitle, author] = livroMatch.map((s) => (s || '').trim());
        const countryHtml = isDesafioLpm
          ? `<a class="book-country" href="/vesiuol/desafio/?pais=${encodeURIComponent(country)}">${escapeHtml(country)}</a>`
          : `<span class="book-country">${escapeHtml(country)}</span>`;
        html += `<p class="book-subhead">${countryHtml}: <strong>${escapeHtml(bookTitle)}</strong><span class="book-author">${escapeHtml(author)}</span></p>\n`;
        continue;
      }
      const imgMatch = text.match(/^\[IMAGEM:\s*([^\]]+)\]$/i);
      if (imgMatch) {
        const filename = imgMatch[1].trim();
        html += `<figure>\n  <img src="/vesiuol/assets/img/blog/${escapeHtml(filename)}" alt="aguardando imagem enviada por Louise" onerror="this.src='https://placehold.co/900x500/c8d4b8/2f3a26?text=aguardando+imagem'">\n</figure>\n`;
        continue;
      }
      const legendaMatch = text.match(/^Legenda:\s*(.+)$/i);
      if (legendaMatch && html.trimEnd().endsWith('</figure>')) {
        const trimmed = html.trimEnd();
        html = trimmed.slice(0, -'</figure>'.length) + `  <figcaption>${escapeHtml(legendaMatch[1])}</figcaption>\n</figure>\n`;
        continue;
      }
      if (!text.trim()) continue;
      if (!firstParagraphText) firstParagraphText = text;
      wordCount += text.split(/\s+/).filter(Boolean).length;
      html += `<p>${richTextToHtml(block.paragraph.rich_text)}</p>\n`;
    } else if (type === 'heading_1' || type === 'heading_2') {
      const rt = type === 'heading_1' ? block.heading_1.rich_text : block.heading_2.rich_text;
      html += `<h2>${richTextToHtml(rt)}</h2>\n`;
    } else if (type === 'heading_3') {
      html += `<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>\n`;
    } else if (type === 'quote') {
      html += `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>\n`;
      wordCount += getPlainText(block.quote.rich_text).split(/\s+/).filter(Boolean).length;
    } else if (type === 'bulleted_list_item') {
      listBuffer.push(`<li>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`);
      wordCount += getPlainText(block.bulleted_list_item.rich_text).split(/\s+/).filter(Boolean).length;
    } else {
      // Toggle, callout, tabela etc. não são suportados ainda — ver limitação
      // conhecida na Governança Blog. Ignorado silenciosamente.
    }
  }
  flushList();
  return { html: html.trim(), firstParagraphText, wordCount };
}

// --- 3. Montar o HTML final clonando o template canônico --------------------

function buildPostHtml(templateRaw, post, relatedCards) {
  let html = templateRaw;
  const newTitle = post.title;
  const newDesc = post.metaDescription;
  const newUrl = `${SITE_BASE}/blog/${post.slug}/`;

  // <title>
  html = html.replace(`<title>${OLD.title} — Biblioteca Vesiuol</title>`, `<title>${escapeHtml(newTitle)} — Biblioteca Vesiuol</title>`);
  // meta description / og:description / twitter:description (mesmo texto 3x no template)
  html = html.split(`content="${OLD.desc}"`).join(`content="${escapeHtml(newDesc)}"`);
  // canonical + og:url
  html = html.split(`${SITE_BASE}/blog/${OLD.slug}/`).join(newUrl);
  // og:title / twitter:title (mesmo texto 2x, mais o <title> já trocado acima)
  html = html.split(`content="${OLD.title} — Biblioteca Vesiuol"`).join(`content="${escapeHtml(newTitle)} — Biblioteca Vesiuol"`);
  // JSON-LD: headline
  html = html.replace(`"headline": "${OLD.title}",`, `"headline": ${JSON.stringify(newTitle)},`);
  // JSON-LD: description
  html = html.replace(`"description": "${OLD.desc}",`, `"description": ${JSON.stringify(newDesc)},`);
  // JSON-LD: datas
  html = html.replace(`"datePublished": "${OLD.datePublished}",`, `"datePublished": "${post.dateISO}",`);
  html = html.replace(`"dateModified": "${OLD.dateModified}",`, `"dateModified": "${post.dateISO}",`);
  // JSON-LD: keywords
  html = html.replace(`"keywords": ${OLD.keywords}`, `"keywords": ${JSON.stringify(post.tags)}`);
  // JSON-LD: image — se não tiver capa, remove a linha inteira
  if (post.coverFilename) {
    html = html.replace(
      '"image": "https://vesiuol.github.io/vesiuol/assets/img/blog/estruturando-rota-1-1.jpg",',
      `"image": "${SITE_BASE}/assets/img/blog/${post.coverFilename}",`
    );
  } else {
    html = html.replace(/\s*"image": "https:\/\/vesiuol\.github\.io\/vesiuol\/assets\/img\/blog\/estruturando-rota-1-1\.jpg",\n/, '\n');
  }

  // article-meta (data + tempo de leitura)
  html = html.replace(OLD.articleMeta, `${formatDateShort(post.dateISO)} · ${post.readingTime} min de leitura`);

  // h1
  html = html.replace(
    `<h1 class="intro-headline">${OLD.title}</h1>`,
    `<h1 class="intro-headline">${escapeHtml(newTitle)}</h1>`
  );

  // breadcrumb — o texto da página atual (não-clicável) é o mesmo título do post.
  // Só entra na geração inicial (não no updateArticleContent), mesma regra do h1/meta/JSON-LD.
  html = html.replace(
    `<span class="breadcrumb-current" aria-current="page">${OLD.title}</span>`,
    `<span class="breadcrumb-current" aria-current="page">${escapeHtml(newTitle)}</span>`
  );

  // article-body (âncora: do <div class="article-body"> até o </div> logo antes de <div class="article-tags">)
  html = html.replace(
    /<div class="article-body">[\s\S]*?<\/div>\n {4}<div class="article-tags">/,
    `<div class="article-body">\n${post.bodyHtml}\n</div>\n    <div class="article-tags">`
  );

  // article-tags (tags normais, clicáveis) + tags extras (linha própria abaixo, não clicável)
  const tagsHtml = post.tags.map((t) => `<a class="post-tag" href="/vesiuol/blog/?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('');
  const extraTagsHtml =
    post.extraTags && post.extraTags.length
      ? `\n    <div class="article-tags-extra">${post.extraTags.map((t) => `<span class="post-tag-extra">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
  html = html.replace(
    /<div class="article-tags">[\s\S]*?<\/div>\n {2}<\/div>\n {2}<div class="related-wrap">/,
    `<div class="article-tags">${tagsHtml}</div>${extraTagsHtml}\n  </div>\n  <div class="related-wrap">`
  );

  // Outras leituras (posts-grid)
  const relatedHtml = relatedCards
    .map(
      (r) => `        <a class="post-card" href="/vesiuol/blog/${r.slug}/">
          <div class="post-wbar"><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div></div>
          <div class="post-body">
            <h3 class="post-title">${escapeHtml(r.title)}</h3>
          </div>
          <div class="post-tags">${r.tags
            .slice(0, 2)
            .map((t) => `<span class="post-tag">${escapeHtml(t)}</span>`)
            .join('')}</div>
          <div class="post-foot"><span>${formatDateShort(r.dateISO)} · ${r.readingTime} min</span><span>→</span></div>
        </a>`
    )
    .join('\n');
  html = html.replace(
    /<div class="posts-grid">\n[\s\S]*?\n {4}<\/div>\n {2}<\/div>\n\n<footer>/,
    `<div class="posts-grid">\n${relatedHtml}\n    </div>\n  </div>\n\n<footer>`
  );

  return html;
}

// --- 3b. Atualizar (re-sincronizar) um post JÁ PUBLICADO ---------------------
// Escopo intencionalmente menor que buildPostHtml: só troca o corpo do texto,
// as tags e o tempo de leitura no article-meta — não mexe em <title>/meta/JSON-LD
// nem no card da home, pra não arriscar quebrar nada que já está no ar por causa
// de uma correção de texto. Se um dia precisar sincronizar título/meta também,
// estender aqui.
function updateArticleContent(existingHtml, post) {
  let html = existingHtml;

  html = html.replace(
    /<div class="article-body">[\s\S]*?<\/div>\n {4}<div class="article-tags">/,
    `<div class="article-body">\n${post.bodyHtml}\n</div>\n    <div class="article-tags">`
  );

  const tagsHtml = post.tags.map((t) => `<a class="post-tag" href="/vesiuol/blog/?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('');
  const extraTagsHtml =
    post.extraTags && post.extraTags.length
      ? `\n    <div class="article-tags-extra">${post.extraTags.map((t) => `<span class="post-tag-extra">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
  // Remove article-tags-extra existente (se já tinha de uma sincronização anterior) antes de recriar
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

// --- 4. Atualizar blog/index.html (card novo + contador) --------------------

function insertCardIntoIndex(indexHtml, post) {
  const newCard = `        <a class="post-card" href="/vesiuol/blog/${post.slug}/">
          <div class="post-wbar"><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div></div>
          <div class="post-body">
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            <p class="post-desc">${escapeHtml(post.metaDescription)}</p>
          </div>
          <div class="post-tags">${post.tags.map((t) => `<span class="post-tag">${escapeHtml(t)}</span>`).join('')}</div>
          <div class="post-foot"><span>${formatDateShort(post.dateISO)} · ${post.readingTime} min</span><span>→</span></div>
        </a>
`;
  let html = indexHtml.replace(
    /(<div class="posts-grid" id="posts-grid">\n)/,
    `$1${newCard}`
  );
  // contador "textos publicados"
  html = html.replace(/(<div class="kpi-num">)(\d+)(<\/div>)/, (m, a, num, c) => `${a}${parseInt(num, 10) + 1}${c}`);
  return html;
}

// --- 4b. Ocultar / excluir um post já publicado ------------------------------

function removeCardFromIndex(indexHtml, slug) {
  const re = new RegExp(`\\s*<a class="post-card" href="/vesiuol/blog/${slug}/">[\\s\\S]*?<\\/a>\\n?`);
  let html = indexHtml.replace(re, '\n');
  if (html !== indexHtml) {
    html = html.replace(/(<div class="kpi-num">)(\d+)(<\/div>)/, (m, a, num, c) => `${a}${Math.max(0, parseInt(num, 10) - 1)}${c}`);
  }
  return { html, removed: html !== indexHtml };
}

function removeFromManifest(slug) {
  if (!fs.existsSync(MANIFEST_PATH)) return;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const filtered = manifest.filter((p) => p.slug !== slug);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(filtered, null, 2) + '\n', 'utf8');
}

// --- 5. Manifesto data/blog-posts.json --------------------------------------

function updateManifest(post) {
  let manifest = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
  manifest.unshift({
    slug: post.slug,
    title: post.title,
    dateISO: post.dateISO,
    tags: post.tags,
    extraTags: post.extraTags || [],
    readingTime: post.readingTime
  });
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function markAsPublished(pageId) {
  await notionRequest(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { Status: { select: { name: 'Publicado' } } } })
  });
}

// --- Principal ----------------------------------------------------------------

async function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) fail(`template canônico não encontrado em ${TEMPLATE_PATH}`);
  const templateRaw = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  let manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : [];

  const pages = await fetchReadyPages();
  if (!pages.length) {
    console.log('Nenhuma página com Status = "Pronto para publicar". Nada a fazer.');
    return;
  }

  for (const page of pages) {
    const props = page.properties;
    const title = getPlainText(props['Nome'].title);
    const tags = (props['Tags']?.multi_select || []).map((t) => t.name);
    const extraTags = (props['Tags extras']?.multi_select || []).map((t) => t.name);
    const dateISO = props['Data de publicação']?.date?.start || new Date().toISOString().slice(0, 10);
    const coverFilename = props['Capa (nome do arquivo)']?.rich_text ? getPlainText(props['Capa (nome do arquivo)'].rich_text) : '';
    const urlProp = props['URL'];
    const customUrl = urlProp?.url || (urlProp?.rich_text ? getPlainText(urlProp.rich_text) : '') || '';
    const slug = normalizeSlugField(customUrl, title);
    const outPath = path.join(BLOG_DIR, slug, 'index.html');
    const status = props['Status']?.select?.name;

    // --- Excluído: apaga de vez (arquivo + card + manifesto) ---
    if (status === 'Excluído') {
      let removedSomething = false;
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
        removedSomething = true;
      }
      let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
      const { html: newIndexHtml, removed } = removeCardFromIndex(indexHtml, slug);
      if (removed) {
        fs.writeFileSync(INDEX_PATH, newIndexHtml, 'utf8');
        removedSomething = true;
      }
      removeFromManifest(slug);
      manifest = manifest.filter((p) => p.slug !== slug);
      console.log(removedSomething ? `OK: "${title}" excluído (arquivo, card e manifesto removidos).` : `AVISO: "${title}" marcado como Excluído, mas não encontrei blog/${slug}/index.html nem card correspondente — talvez já tenha sido removido antes, ou o campo URL não bate com o nome do arquivo.`);
      continue;
    }

    // --- Rascunho num post que JÁ tinha sido publicado: oculta (mantém o arquivo, tira da home/manifesto) ---
    if (status === 'Rascunho') {
      if (!fs.existsSync(outPath)) {
        // Rascunho normal, nunca publicado — nada a fazer, é só um texto sendo escrito.
        continue;
      }
      let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
      const { html: newIndexHtml, removed } = removeCardFromIndex(indexHtml, slug);
      if (removed) {
        fs.writeFileSync(INDEX_PATH, newIndexHtml, 'utf8');
        removeFromManifest(slug);
        manifest = manifest.filter((p) => p.slug !== slug);
        console.log(`OK: "${title}" ocultado (card e manifesto removidos; o arquivo blog/${slug}/index.html continua no repositório, só não aparece mais listado).`);
      } else {
        console.log(`"${title}" já está como Rascunho e não tinha card na home — nada a fazer.`);
      }
      continue;
    }

    const blocks = await fetchAllBlocks(page.id);
    const { html: bodyHtml, firstParagraphText, wordCount } = blocksToArticle(blocks, tags);
    const metaDescription = firstParagraphText.slice(0, 155).trim();
    const post = {
      slug,
      title,
      tags,
      extraTags,
      dateISO,
      coverFilename,
      bodyHtml,
      metaDescription,
      readingTime: readingTime(wordCount)
    };

    if (status === 'Atualizar') {
      if (!fs.existsSync(outPath)) {
        console.log(`AVISO: Status "Atualizar" em "${title}", mas blog/${slug}/index.html não existe (campo URL lido como: "${customUrl}"). Preencha o campo URL com o nome exato do arquivo já publicado. Pulando.`);
        continue;
      }
      console.log(`Sincronizando: ${title} -> blog/${slug}/index.html`);
      const existingHtml = fs.readFileSync(outPath, 'utf8');
      const updatedHtml = updateArticleContent(existingHtml, post);
      fs.writeFileSync(outPath, updatedHtml, 'utf8');

      // Caminho de volta de um "Rascunho" anterior: se o card sumiu de
      // blog/index.html e/ou a entrada sumiu do manifesto (porque este post
      // já foi ocultado antes), "Atualizar" também restaura os dois. Sem
      // isso, não existia nenhum jeito de tirar um post do estado "oculto".
      let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
      const cardExists = new RegExp(`<a class="post-card" href="/vesiuol/blog/${slug}/">`).test(indexHtml);
      const inManifest = manifest.some((p) => p.slug === slug);
      let restored = false;

      if (!cardExists) {
        indexHtml = insertCardIntoIndex(indexHtml, post);
        fs.writeFileSync(INDEX_PATH, indexHtml, 'utf8');
        restored = true;
      }
      if (!inManifest) {
        updateManifest(post);
        manifest.unshift({ slug, title, dateISO, tags, extraTags, readingTime: post.readingTime });
        restored = true;
      }

      await markAsPublished(page.id);
      console.log(
        restored
          ? `OK: ${title} sincronizado e RESTAURADO na home (estava oculto por um "Rascunho" anterior — card e/ou manifesto recriados, contador ajustado).`
          : `OK: ${title} sincronizado (corpo, tags e tempo de leitura atualizados; título/meta/card da home não foram tocados).`
      );
      continue;
    }

    // status === 'Pronto para publicar'
    if (fs.existsSync(outPath)) {
      console.log(`AVISO: blog/${slug}/index.html já existe — pulando "${title}" pra não sobrescrever post publicado. Se a intenção era atualizar o texto, mude o Status pra "Atualizar" em vez de "Pronto para publicar".`);
      continue;
    }

    console.log(`Gerando: ${title} -> blog/${slug}/index.html`);
    // "Outras leituras" — por tag em comum (ver pickRelatedCards); sem match, mais recentes
    const relatedCards = pickRelatedCards(manifest, post);
    const finalHtml = buildPostHtml(templateRaw, post, relatedCards);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, finalHtml, 'utf8');

    let indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
    indexHtml = insertCardIntoIndex(indexHtml, post);
    fs.writeFileSync(INDEX_PATH, indexHtml, 'utf8');

    updateManifest(post);
    manifest.unshift({ slug, title, dateISO, tags, extraTags, readingTime: post.readingTime });

    await markAsPublished(page.id);
    console.log(`OK: ${title} publicado.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
