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
// ============================================================
// generate-blog-posts.js
// Lê a base "Textos blog" do Notion, gera a página HTML final
// de cada post pronto para publicar e atualiza blog/index.html.
//
// Modelo de autenticação/fetch reaproveitado de
// scripts/fetch-notion-desafio.js (mesmo token NOTION_TOKEN).
// ============================================================

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2022-06-28';
// ID da database "📝 Textos blog" (Governança Blog, workspace Notion).
const DB_ID = '3a9abcf3-db1e-80a2-acb1-f34e8262c191';

const REPO_ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(REPO_ROOT, 'blog');
const IMG_DIR = path.join(REPO_ROOT, 'assets', 'img', 'blog');
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', 'blog-posts.json');
const INDEX_PATH = path.join(BLOG_DIR, 'index.html');

const SITE_URL = 'https://vesiuol.github.io/vesiuol';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image-livros-favoritos.png`;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// ---------- Notion API helpers ----------

async function notionFetch(pathname, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Erro na API do Notion:', JSON.stringify(data, null, 2));
    throw new Error(`Notion API error (${res.status})`);
  }
  return data;
}

async function queryDatabase() {
  let results = [];
  let cursor;
  do {
    const data = await notionFetch(`/databases/${DB_ID}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
    });
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function getAllBlocks(blockId) {
  let results = [];
  let cursor;
  do {
    const data = await notionFetch(
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
    );
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function updatePageStatus(pageId, status) {
  await notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { Status: { select: { name: status } } } })
  });
}

// ---------- Propriedades ----------

function getProp(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case 'title': return p.title.map(t => t.plain_text).join('') || null;
    case 'rich_text': return p.rich_text.map(t => t.plain_text).join('') || null;
    case 'select': return p.select ? p.select.name : null;
    case 'multi_select': return p.multi_select.map(o => o.name);
    case 'date': return p.date ? p.date.start : null;
    default: return null;
  }
}

// ---------- Texto: slug, data, tempo de leitura ----------

function slugify(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function formatDateLongLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MESES_LONGOS[m - 1]} de ${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

// ---------- Notion rich_text -> HTML inline ----------

function richTextToHtml(richTextArr) {
  return richTextArr.map(rt => {
    let text = escapeHtml(rt.plain_text);
    if (rt.annotations.code) text = `<code>${text}</code>`;
    if (rt.annotations.bold) text = `<strong>${text}</strong>`;
    if (rt.annotations.italic) text = `<em>${text}</em>`;
    if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
    if (rt.href) text = `<a href="${escapeAttr(rt.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    return text;
  }).join('');
}

function plainText(richTextArr) {
  return richTextArr.map(rt => rt.plain_text).join('');
}

// ---------- Conversão de blocos Notion -> corpo do artigo ----------

const IMAGE_TAG_RE = /^\[IMAGEM:\s*([^\]]+)\]\s*$/i;
const LEGENDA_RE = /^Legenda:\s*(.+)$/i;

function humanizeFilename(filename) {
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[-_]+/g, ' ').trim();
}

function buildFigure(filename, legenda) {
  const exists = fs.existsSync(path.join(IMG_DIR, filename));
  const src = `../assets/img/blog/${filename}`;
  const humanAlt = humanizeFilename(filename);
  const alt = exists ? humanAlt : `${humanAlt} — aguardando imagem enviada por Louise`;
  const placeholderText = encodeURIComponent('aguardando+imagem');
  const fallback = `https://placehold.co/900x500/c8d4b8/2f3a26?text=${placeholderText}`;
  const caption = legenda ? `\n  <figcaption>${escapeHtml(legenda)}</figcaption>` : '';
  return `<figure>\n  <img src="${src}" alt="${escapeAttr(alt)}" onerror="this.src='${fallback}'">${caption}\n</figure>`;
}

function blocksToArticle(blocks) {
  const htmlParts = [];
  const wordsParts = [];
  let firstParagraph = '';

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const type = block.type;
    const data = block[type];

    if (type === 'paragraph') {
      const text = plainText(data.rich_text).trim();
      const imgMatch = text.match(IMAGE_TAG_RE);
      if (imgMatch) {
        const filename = imgMatch[1].trim();
        let legenda = null;
        const next = blocks[i + 1];
        if (next && next.type === 'paragraph') {
          const nextText = plainText(next.paragraph.rich_text).trim();
          const legMatch = nextText.match(LEGENDA_RE);
          if (legMatch) {
            legenda = legMatch[1].trim();
            i++; // consome o bloco de legenda
          }
        }
        htmlParts.push(buildFigure(filename, legenda));
        continue;
      }
      if (!text) continue; // parágrafo vazio (espaçamento no Notion)
      if (!firstParagraph) firstParagraph = text;
      htmlParts.push(`<p>${richTextToHtml(data.rich_text)}</p>`);
      wordsParts.push(text);
    } else if (type === 'heading_2') {
      htmlParts.push(`<h2>${richTextToHtml(data.rich_text)}</h2>`);
    } else if (type === 'heading_3') {
      // Sinal de exceção: se a Louise pintar o texto do Heading 3 com o fundo
      // verde do próprio Notion, o H3 sai como pílula preenchida (padrão antigo,
      // usado hoje só como rótulo de citação em "Histórias cruzadas"). Sem cor
      // nenhuma aplicada, sai no padrão novo (pílula sem fundo, texto preto).
      const hasGreenBg = data.rich_text.some(rt => rt.annotations.color === 'green_background');
      const cls = hasGreenBg ? ' class="h3-pill-solid"' : '';
      htmlParts.push(`<h3${cls}>${richTextToHtml(data.rich_text)}</h3>`);
    } else if (type === 'heading_1') {
      // Notion H1 não tem equivalente no template (H1 é o título do post) — trata como H2.
      htmlParts.push(`<h2>${richTextToHtml(data.rich_text)}</h2>`);
    } else if (type === 'quote') {
      htmlParts.push(`<blockquote>${richTextToHtml(data.rich_text)}</blockquote>`);
      wordsParts.push(plainText(data.rich_text));
    } else if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      // agrupa itens consecutivos da mesma lista
      const tag = type === 'bulleted_list_item' ? 'ul' : 'ol';
      const items = [`<li>${richTextToHtml(data.rich_text)}</li>`];
      wordsParts.push(plainText(data.rich_text));
      while (blocks[i + 1] && blocks[i + 1].type === type) {
        i++;
        const nextData = blocks[i][type];
        items.push(`<li>${richTextToHtml(nextData.rich_text)}</li>`);
        wordsParts.push(plainText(nextData.rich_text));
      }
      htmlParts.push(`<${tag}>\n${items.join('\n')}\n</${tag}>`);
    } else if (type === 'image') {
      const src = data.type === 'external' ? data.external.url : data.file.url;
      const caption = data.caption && data.caption.length ? plainText(data.caption) : '';
      htmlParts.push(
        `<figure>\n  <img src="${src}" alt="${escapeAttr(caption || 'Imagem do post')}">${
          caption ? `\n  <figcaption>${escapeHtml(caption)}</figcaption>` : ''
        }\n</figure>`
      );
    }
    // outros tipos de bloco (toggle, callout, divider, etc.) são ignorados por enquanto —
    // se a Louise passar a usar algum desses no texto, expandir aqui.
  }

  const wordCount = wordsParts.join(' ').split(/\s+/).filter(Boolean).length;
  return {
    html: htmlParts.join('\n'),
    wordCount,
    firstParagraph
  };
}

function buildMetaDescription(firstParagraph) {
  if (!firstParagraph) return '';
  if (firstParagraph.length <= 155) return firstParagraph;
  const cut = firstParagraph.slice(0, 155);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

// ---------- Templates de HTML ----------

function renderTagsFooter(tags) {
  return tags
    .map(t => `<a class="post-tag" href="index.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
    .join('');
}

function renderRelatedCard(post) {
  return `        <a class="post-card" href="${post.url}">
          <div class="post-wbar"><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div></div>
          <div class="post-body">
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
          </div>
          <div class="post-tags">${post.tags.map(t => `<span class="post-tag">${escapeHtml(t)}</span>`).join('')}</div>
          <div class="post-foot"><span>${escapeHtml(post.dateLabel)} · ${post.readMin} min</span><span>→</span></div>
        </a>`;
}

function renderIndexCard(post) {
  return `        <a class="post-card" href="${post.url}">
          <div class="post-wbar"><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div><div class="wdot" aria-hidden="true"></div></div>
          <div class="post-body">
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            <p class="post-desc">${escapeHtml(post.desc)}</p>
          </div>
          <div class="post-tags">${post.tags.map(t => `<span class="post-tag">${escapeHtml(t)}</span>`).join('')}</div>
          <div class="post-foot"><span>${escapeHtml(post.foot)}</span><span>→</span></div>
        </a>`;
}

function renderPostPage({ title, description, canonicalUrl, ogImage, jsonLd, dateLabel, readMin, articleHtml, tags, relatedPosts }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-JE6ED0PYHR"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-JE6ED0PYHR');
</script>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link rel="icon" href="../assets/favicon.svg">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<title>${escapeHtml(title)} — Biblioteca Vesiuol</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Biblioteca Vesiuol">
<meta property="og:title" content="${escapeAttr(title)} — Biblioteca Vesiuol">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)} — Biblioteca Vesiuol">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta property="og:image" content="${DEFAULT_OG_IMAGE}">
<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/theme.css">
<style>
:root {
  --sidebar-w:272px;
  --header-h:52px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{-webkit-font-smoothing:antialiased;}
body{background:var(--white);color:var(--text);font-family:'DM Sans',sans-serif;font-weight:500;}
a{color:inherit;text-decoration:none;}

.skip-link{position:absolute;left:-999px;top:0;z-index:200;background:var(--green);color:var(--white);padding:.6rem 1.2rem;font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:600;}
.skip-link:focus{left:1rem;top:.6rem;}

nav{position:sticky;top:0;z-index:200;height:var(--header-h);background:var(--white);border-bottom:1.5px solid #c5c5a0;display:flex;align-items:center;padding:0 2rem;gap:1.5rem;}
.nav-logo{display:flex;gap:5px;align-items:center;}
.nav-dot{width:10px;height:10px;border-radius:50%;background:var(--black);}
nav ul{list-style:none;display:flex;gap:2rem;margin-left:auto;align-items:center;}
nav ul li a{color:var(--black);font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;transition:color .2s;font-family:'DM Sans',sans-serif;font-weight:500;}
nav ul li a:hover{color:var(--green);}
nav ul li a.active{background:var(--green);color:var(--white);padding:.28rem .7rem;border-radius:3px;font-weight:700;}
.nav-hamburger{display:none;background:none;border:none;color:var(--black);font-size:1.4rem;cursor:pointer;margin-left:auto;}

main{padding:2rem 2.4rem 3rem;position:relative;z-index:1;min-width:0;}

.posts-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;}
.post-card{border:1.5px solid var(--border);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s;text-decoration:none;color:inherit;box-shadow:2px 2px 0 var(--border);}
.post-card:hover{transform:translateY(-2px);box-shadow:2px 4px 0 var(--border);}
.post-wbar{padding:.45rem .9rem;display:flex;gap:4px;border-bottom:1px solid var(--border-soft);}
.wdot{width:8px;height:8px;border-radius:50%;background:#bbb;}
.post-body{padding:1rem 1.1rem;flex:1;display:flex;flex-direction:column;gap:.5rem;}
.post-title{font-family:'Lora',serif;font-size:1.22rem;font-weight:700;line-height:1.38;color:var(--text);}
.post-foot{border-top:1px solid var(--border-soft);padding:.55rem 1.1rem;display:flex;align-items:center;justify-content:space-between;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.post-tags{display:flex;flex-wrap:wrap;gap:.35rem;padding:0 1.1rem .9rem;}
.post-tag{font-size:.64rem;letter-spacing:.03em;text-transform:uppercase;color:var(--white);background:var(--green);padding:.14rem .5rem;border-radius:100px;}
.article-tags .post-tag{cursor:pointer;text-decoration:none;border:none;}
.article-tags .post-tag:hover{background:var(--green-dark);}

.article-wrap{max-width:720px;margin:0 auto;padding:2.2rem 2rem 3rem;}
.article-meta{font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:.7rem;}
.article-body{font-size:1.02rem;line-height:1.85;color:var(--text);}
.article-body p{margin-bottom:1.15rem;}
.article-body h2{font-family:'DM Sans',sans-serif;font-size:1.85rem;font-weight:700;color:var(--green-dark);margin:2.1rem 0 .9rem;padding-bottom:.3rem;border-bottom:2px solid var(--green-light);}
.article-body h3{font-family:'DM Sans',sans-serif;font-size:.92rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--black);background:none;display:inline-block;padding:.4rem 0;border-radius:100px;margin:1.9rem 0 .8rem;}
.article-body h3.h3-pill-solid{background:var(--green-dark);color:var(--white);font-size:.74rem;padding:.3rem .9rem;}
.article-body a{color:var(--text);font-weight:700;text-decoration:underline;text-decoration-color:var(--green);text-decoration-thickness:1.5px;text-underline-offset:2px;}
.article-body a:hover{color:var(--green-dark);}
.article-body blockquote{border-left:3px solid var(--green);padding-left:1rem;margin:1.4rem 0;color:var(--muted);font-style:italic;}
.article-body ul,.article-body ol{margin:0 0 1.15rem 1.3rem;}
.article-body li{margin-bottom:.4rem;}
.article-body figure{margin:1.7rem 0;}
.article-body img{width:100%;border-radius:10px;border:1.5px solid var(--border);display:block;}
.article-body figcaption{font-size:.72rem;letter-spacing:.02em;color:var(--black);text-align:center;margin-top:.5rem;}
.article-tags{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.8rem 0 2.6rem;}
.article-back{display:inline-block;margin-bottom:1.4rem;font-size:.74rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);}
.article-back:hover{color:var(--green);}

.related-wrap{border-top:1.5px solid var(--border);padding-top:2.4rem;padding-bottom:2.4rem;margin-top:0;max-width:720px;margin-left:auto;margin-right:auto;padding-left:2rem;padding-right:2rem;}
.related-wrap .posts-grid{display:flex;flex-direction:column;gap:0;margin-top:1rem;border-top:1px solid var(--border-soft);}
.related-wrap .post-card{flex-direction:row;flex-wrap:wrap;align-items:center;gap:.4rem 1rem;border:none;border-bottom:1px solid var(--border-soft);border-radius:0;box-shadow:none;padding:.6rem .1rem;}
.related-wrap .post-card:hover{transform:none;box-shadow:none;background:var(--surface);}
.related-wrap .post-wbar{display:none;}
.related-wrap .post-body{padding:0;flex:1 1 220px;gap:0;}
.related-wrap .post-title{font-size:.85rem;font-weight:600;line-height:1.35;}
.related-wrap .post-tags{padding:0;flex-shrink:0;}
.related-wrap .post-foot{border-top:none;padding:0;flex-shrink:0;gap:.5rem;font-size:.62rem;}

footer{background:var(--green);padding:1rem 2rem;display:flex;align-items:center;gap:1rem;border-top:1.5px solid var(--green-dark);}
.footer-dots{display:flex;gap:5px;}
.footer-dot{width:10px;height:10px;border-radius:50%;background:var(--white);}
.footer-text{font-size:.60rem;letter-spacing:.1em;text-transform:uppercase;color:var(--white);font-weight:500;font-family:'DM Sans',sans-serif;}

@media(max-width:900px){
  .article-wrap{padding:1.6rem 1.2rem 2.4rem;}
  .related-wrap{padding-left:1.2rem;padding-right:1.2rem;}
}
@media(max-width:600px){
  nav ul{display:none;position:absolute;top:52px;left:0;right:0;background:var(--white);flex-direction:column;padding:1rem 2rem;gap:1rem;border-bottom:1px solid var(--border);}
  nav ul.open{display:flex;}
  .nav-hamburger{display:block;}
  .posts-grid{grid-template-columns:1fr;}
}
</style>
</head>
<body>

<a href="#conteudo-principal" class="skip-link">Pular para o conteúdo principal</a>

<!-- NAV -->
<nav>
  <a href="../index.html" class="nav-logo" style="text-decoration:none">
    <div class="nav-dot"></div>
    <div class="nav-dot"></div>
    <div class="nav-dot" style="background:var(--green)"></div>
  </a>
  <ul id="nav-menu">
    <li><a href="../index.html">Início</a></li>
    <li><a href="../2026.html">2026</a></li>
    <li><a href="../estante.html">Estante</a></li>
    <li><a href="../historico.html">Histórico</a></li>
    <li><a href="../desafio.html">Desafio</a></li>
    <li><a href="../sobre.html">Sobre</a></li>
  </ul>
  <button class="nav-hamburger" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav-menu" onclick="const u=document.getElementById('nav-menu');u.classList.toggle('open');this.setAttribute('aria-expanded', u.classList.contains('open'));">☰</button>
</nav>

  <div class="article-wrap" id="conteudo-principal">
    <a class="article-back" href="index.html">← Voltar para o blog</a>
    <div class="article-meta">${escapeHtml(dateLabel)} · ${readMin} min de leitura</div>
    <div class="intro-headline-wrap">
      <h1 class="intro-headline" style="font-family:'Cormorant Garamond',serif;font-size:clamp(2.4rem,4vw,3.8rem);font-weight:600;line-height:1.45;">${escapeHtml(title)}</h1>
    </div>
    <div class="article-body">
${articleHtml}
    </div>
    <div class="article-tags">${renderTagsFooter(tags)}</div>
  </div>
  <div class="related-wrap">
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:700;display:inline-block;background:var(--green);color:var(--white);padding:.08em .4em;">Outras leituras</h2>
    <div class="posts-grid">
${relatedPosts.map(renderRelatedCard).join('\n')}
    </div>
  </div>

<footer>
  <div class="footer-dots"><div class="footer-dot"></div><div class="footer-dot"></div><div class="footer-dot"></div></div>
  <span class="footer-text"><span id="footer-autora"></span>&nbsp;&nbsp;|&nbsp;&nbsp;© <span id="footer-ano"></span>&nbsp;&nbsp;|&nbsp;&nbsp;Atualizado em <span id="data-atualizacao">${formatDateLongLabel(todayISO())}</span></span>
</footer>
<script src="../assets/config.js"></script>
<script>
document.getElementById("footer-autora").textContent = SITE_CONFIG.autora;
document.getElementById("footer-ano").textContent = SITE_CONFIG.copyrightAno;
</script>
</body>
</html>
`;
}

// ---------- blog/index.html: regenerar apenas o bloco de cards ----------

function updateBlogIndex(manifest) {
  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  const sorted = [...manifest].sort((a, b) => (a.date < b.date ? 1 : -1));
  const cardsHtml = sorted.map(renderIndexCard).join('\n');

  const startMarker = '<div class="posts-grid" id="posts-grid">';
  const endMarker = '</div>';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) {
    console.warn('⚠️  Não encontrei #posts-grid em blog/index.html — pulei a atualização do índice.');
    return;
  }
  // encontra o </div> de fechamento correspondente (o primeiro </div> após o marcador,
  // já que os cards internos usam <a>/<div> mas o bloco em si é fechado no template atual
  // por um </div> dedicado ao final da lista de cards).
  const afterStart = startIdx + startMarker.length;
  const closeIdx = html.indexOf('\n    </div>', afterStart);
  if (closeIdx === -1) {
    console.warn('⚠️  Não encontrei o fechamento de #posts-grid — pulei a atualização do índice.');
    return;
  }
  const newBlock = `${startMarker}\n${cardsHtml}\n    </div>`;
  html = html.slice(0, startIdx) + newBlock + html.slice(closeIdx + '\n    </div>'.length);
  fs.writeFileSync(INDEX_PATH, html);
  console.log('✅ blog/index.html atualizado com', sorted.length, 'posts.');
}

// ---------- Execução principal ----------

async function run() {
  if (!NOTION_TOKEN) {
    console.error('NOTION_TOKEN não definido.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const today = todayISO();

  const pages = await queryDatabase();
  const eligible = pages.filter(page => {
    const status = getProp(page, 'Status');
    const pubDate = getProp(page, 'Data de publicação');
    return status === 'Pronto para publicar' && pubDate && pubDate <= today;
  });

  if (eligible.length === 0) {
    console.log('Nenhum post pronto para publicar hoje.');
    return;
  }

  let published = 0;

  for (const page of eligible) {
    const title = getProp(page, 'Nome');
    const pubDate = getProp(page, 'Data de publicação');
    const tags = getProp(page, 'Tags') || [];
    const capa = getProp(page, 'Capa (nome do arquivo)');
    let filenameField = getProp(page, 'URL'); // antigo "Nome do arquivo no site" — renomeado pela Louise

    if (!title) {
      console.warn(`⚠️  Post ${page.id} sem título ("Nome") — pulado.`);
      continue;
    }

    let filename;
    if (filenameField) {
      filename = filenameField.replace(/^blog\//, '').replace(/\.html$/, '') + '.html';
    } else {
      filename = `${slugify(title)}.html`;
    }
    const url = filename;
    const outPath = path.join(BLOG_DIR, filename);

    console.log(`→ Gerando ${url} ("${title}")...`);

    const blocks = await getAllBlocks(page.id);
    const { html: articleHtml, wordCount, firstParagraph } = blocksToArticle(blocks);
    const readMin = Math.max(1, Math.round(wordCount / 200));
    const description = buildMetaDescription(firstParagraph);
    const dateLabel = formatDateLabel(pubDate);
    const canonicalUrl = `${SITE_URL}/blog/${url}`;

    const relatedPosts = [...manifest]
      .filter(p => p.url !== url)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 3);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      description,
      image: capa ? `${SITE_URL}/assets/img/blog/${capa}` : DEFAULT_OG_IMAGE,
      datePublished: pubDate,
      dateModified: today,
      inLanguage: 'pt-BR',
      author: { '@type': 'Person', name: 'Louise Victoria' },
      publisher: { '@type': 'Person', name: 'Louise Victoria' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      keywords: tags
    };

    const pageHtml = renderPostPage({
      title,
      description,
      canonicalUrl,
      jsonLd,
      dateLabel,
      readMin,
      articleHtml,
      tags,
      relatedPosts
    });

    fs.writeFileSync(outPath, pageHtml);

    manifest.push({
      url,
      title,
      desc: description,
      tags,
      date: pubDate,
      dateLabel,
      readMin,
      foot: tags[0] || 'Blog',
      capa: capa || null
    });

    await updatePageStatus(page.id, 'Publicado');
    published++;
    console.log(`  ✅ ${url} gerado e marcado como Publicado no Notion.`);
  }

  if (published > 0) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    updateBlogIndex(manifest);
  }

  console.log(`\n${published} post(s) publicado(s).`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
