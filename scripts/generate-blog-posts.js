#!/usr/bin/env node
/**
 * Gera posts novos do blog (Biblioteca Vesiuol) a partir da base "Textos blog" no Notion.
 *
 * Como funciona:
 *  1. Busca páginas com Status = "Pronto para publicar" na base Textos blog.
 *  2. Para cada uma, lê o conteúdo (blocos) da própria página do Notion.
 *  3. Clona blog/como-escolhi-um-livro-por-pais-rota-1.html (template canônico,
 *     ver Governança Blog) e substitui título, meta tags, JSON-LD, corpo do
 *     texto, tags e "Outras leituras".
 *  4. Escreve o HTML novo em blog/<slug>.html — NUNCA sobrescreve um arquivo
 *     que já existe (posts publicados não são reescritos por este script).
 *  5. Insere o card do post novo em blog/index.html (topo da grade) e
 *     atualiza o contador "textos publicados".
 *  6. Atualiza data/blog-posts.json (manifesto simples de todos os posts).
 *  7. Marca a página no Notion como Status = "Publicado".
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
const TEMPLATE_PATH = path.join(BLOG_DIR, 'como-escolhi-um-livro-por-pais-rota-1.html');
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', 'blog-posts.json');
const SITE_BASE = 'https://vesiuol.github.io/vesiuol';

// Valores exatos do template canônico (blog/como-escolhi-um-livro-por-pais-rota-1.html),
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
      filter: { property: 'Status', select: { equals: 'Pronto para publicar' } },
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

function blocksToArticle(blocks) {
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
      const imgMatch = text.match(/^\[IMAGEM:\s*([^\]]+)\]$/i);
      if (imgMatch) {
        const filename = imgMatch[1].trim();
        html += `<figure>\n  <img src="../assets/img/blog/${escapeHtml(filename)}" alt="aguardando imagem enviada por Louise" onerror="this.src='https://placehold.co/900x500/c8d4b8/2f3a26?text=aguardando+imagem'">\n</figure>\n`;
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
    } else if (type === 'heading_2') {
      html += `<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>\n`;
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
  const newUrl = `${SITE_BASE}/blog/${post.slug}.html`;

  // <title>
  html = html.replace(`<title>${OLD.title} — Biblioteca Vesiuol</title>`, `<title>${escapeHtml(newTitle)} — Biblioteca Vesiuol</title>`);
  // meta description / og:description / twitter:description (mesmo texto 3x no template)
  html = html.split(`content="${OLD.desc}"`).join(`content="${escapeHtml(newDesc)}"`);
  // canonical + og:url
  html = html.split(`https://vesiuol.github.io/vesiuol/blog/${OLD.slug}.html`).join(newUrl);
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
      '"image": "https://vesiuol.github.io/vesiuol/images/blog/estruturando-rota-1-1.jpg",',
      `"image": "${SITE_BASE}/assets/img/blog/${post.coverFilename}",`
    );
  } else {
    html = html.replace(/\s*"image": "https:\/\/vesiuol\.github\.io\/vesiuol\/images\/blog\/estruturando-rota-1-1\.jpg",\n/, '\n');
  }

  // article-meta (data + tempo de leitura)
  html = html.replace(OLD.articleMeta, `${formatDateShort(post.dateISO)} · ${post.readingTime} min de leitura`);

  // h1
  html = html.replace(
    `<h1 class="intro-headline">${OLD.title}</h1>`,
    `<h1 class="intro-headline">${escapeHtml(newTitle)}</h1>`
  );

  // article-body (âncora: do <div class="article-body"> até o </div> logo antes de <div class="article-tags">)
  html = html.replace(
    /<div class="article-body">[\s\S]*?<\/div>\n {4}<div class="article-tags">/,
    `<div class="article-body">\n${post.bodyHtml}\n</div>\n    <div class="article-tags">`
  );

  // article-tags
  const tagsHtml =
    post.tags.map((t) => `<a class="post-tag" href="index.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('') +
    (post.extraTags && post.extraTags.length
      ? post.extraTags.map((t) => `<span class="post-tag post-tag-extra">${escapeHtml(t)}</span>`).join('')
      : '');
  html = html.replace(
    /<div class="article-tags">[\s\S]*?<\/div>\n {2}<\/div>\n {2}<div class="related-wrap">/,
    `<div class="article-tags">${tagsHtml}</div>\n  </div>\n  <div class="related-wrap">`
  );

  // Outras leituras (posts-grid)
  const relatedHtml = relatedCards
    .map(
      (r) => `        <a class="post-card" href="${r.slug}.html">
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

// --- 4. Atualizar blog/index.html (card novo + contador) --------------------

function insertCardIntoIndex(indexHtml, post) {
  const newCard = `        <a class="post-card" href="${post.slug}.html">
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
    const customUrl = props['userDefined:URL']?.rich_text ? getPlainText(props['userDefined:URL'].rich_text) : '';
    const slug = slugify(customUrl || title);
    const outPath = path.join(BLOG_DIR, `${slug}.html`);

    if (fs.existsSync(outPath)) {
      console.log(`AVISO: blog/${slug}.html já existe — pulando "${title}" pra não sobrescrever post publicado. Corrija o slug/URL no Notion se for um post diferente.`);
      continue;
    }

    console.log(`Gerando: ${title} -> blog/${slug}.html`);
    const blocks = await fetchAllBlocks(page.id);
    const { html: bodyHtml, firstParagraphText, wordCount } = blocksToArticle(blocks);
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

    // 3 posts mais recentes do manifesto = "Outras leituras"
    const relatedCards = manifest.slice(0, 3);

    const finalHtml = buildPostHtml(templateRaw, post, relatedCards);
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
