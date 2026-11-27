// scripts/sync-partials.js
//
// Fonte única de cabeçalho (partials/nav.html) e rodapé (partials/footer.html).
// Este script lê os dois partials e injeta o conteúdo entre os marcadores
// <!-- NAV:START --> ... <!-- NAV:END --> e
// <!-- FOOTER:START --> ... <!-- FOOTER:END -->
// em cada página listada em PAGES abaixo. Roda via GitHub Action a cada push
// (mesmo padrão dos outros workflows do projeto) ou manualmente com:
//   node scripts/sync-partials.js
//
// NÃO edite o <nav> ou <footer> dentro das páginas finais — edite sempre
// partials/nav.html e partials/footer.html, e rode este script (ou dê push,
// que a Action roda sozinha).
//
// Também mantém o <lastmod> de cada página no sitemap.xml (desde 2026-11-26): a data vem do
// último commit do arquivo (igual à data do rodapé) e nunca volta para trás. Este script NÃO
// adiciona páginas novas ao sitemap — isso é do generate-blog-posts.js (posts) — mas avisa se
// alguma página do site estiver faltando lá.
//
// Atualizado em 13/08 para refletir a migração de URLs de 12/08: todas as
// páginas agora vivem em pastas com index.html (ex: estante/index.html) e o
// nav usa caminhos absolutos (/vesiuol/...) em vez de caminhos relativos com
// {{PREFIX}}. Por isso o campo "prefix" foi removido do PAGES e da lógica
// de buildNav.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Estados de menu ativo possíveis:
//   "inicio" | "estante" | "historico-overview" | "historico-2026" |
//   "desafio" | "blog" | "sobre" | null (nenhum ativo — ex: 404)
const PAGES = [
  { file: "index.html", active: "inicio" },
  { file: "404.html", active: null },
  { file: "estante/index.html", active: "estante" },
  { file: "historico/index.html", active: "historico-overview" },
  { file: "2026/index.html", active: "historico-2026" },
  { file: "desafio/index.html", active: "desafio" },
  { file: "sobre/index.html", active: "sobre" },
  { file: "blog/index.html", active: "blog" },
];

// Posts do blog: descobertos automaticamente (blog/<slug>/index.html).
// Não é mais preciso listar cada post aqui — o gerador de posts (Notion) cria a
// pasta, e este script a encontra sozinho. Decisão: Registro de Decisões, 2026-11-26.
function descobrirPostsDoBlog() {
  const blogDir = path.join(ROOT, "blog");
  if (!fs.existsSync(blogDir)) return [];
  return fs
    .readdirSync(blogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(blogDir, d.name, "index.html")))
    .map((d) => ({ file: `blog/${d.name}/index.html`, active: "blog" }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function ativo(padrao, comAriaCurrent = true) {
  return padrao ? ` class="active"${comAriaCurrent ? ' aria-current="page"' : ""}` : "";
}

function buildNav(navTemplate, page) {
  const a = page.active;
  let html = navTemplate;
  html = html.replace("{{ACTIVE_INICIO}}", ativo(a === "inicio"));
  html = html.replace("{{ACTIVE_ESTANTE}}", ativo(a === "estante"));
  html = html.replace(
    "{{ACTIVE_HISTORICO}}",
    a === "historico-overview" ? ativo(true) : a === "historico-2026" ? ativo(true, false) : ativo(false)
  );
  html = html.replace("{{ACTIVE_SUBMENU_VISAO_GERAL}}", ativo(a === "historico-overview", false));
  html = html.replace("{{ACTIVE_SUBMENU_2026}}", ativo(a === "historico-2026"));
  html = html.replace("{{ACTIVE_DESAFIO}}", ativo(a === "desafio"));
  html = html.replace("{{ACTIVE_BLOG}}", ativo(a === "blog"));
  html = html.replace("{{ACTIVE_SOBRE}}", ativo(a === "sobre"));
  return html;
}

function dataAtualizacaoDoArquivo(relFile) {
  // Pergunta ao Git a data do último commit que de fato alterou este arquivo.
  // Se o arquivo for novo (ainda sem commit) ou o comando falhar, cai para a
  // data de hoje, para nunca gerar uma página sem data.
  try {
    const iso = execSync(`git log -1 --format=%cd --date=short -- "${relFile}"`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    if (!iso) return dataDeHoje();
    const [ano, mes, dia] = iso.split("-").map(Number);
    return `${String(dia).padStart(2, "0")} de ${MESES[mes - 1]} de ${ano}`;
  } catch {
    return dataDeHoje();
  }
}

function dataDeHoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function buildFooter(footerTemplate, relFile) {
  const data = dataAtualizacaoDoArquivo(relFile);
  return footerTemplate.replace("{{DATA_ATUALIZACAO}}", data);
}

function injetar(conteudo, marcadorInicio, marcadorFim, novoTrecho) {
  const inicio = conteudo.indexOf(marcadorInicio);
  const fim = conteudo.indexOf(marcadorFim);
  if (inicio === -1 || fim === -1) {
    throw new Error(`Marcadores ${marcadorInicio}/${marcadorFim} não encontrados`);
  }
  const antes = conteudo.slice(0, inicio + marcadorInicio.length);
  const depois = conteudo.slice(fim);
  return `${antes}\n${novoTrecho}\n${depois}`;
}

const BASE_URL = "https://vesiuol.github.io/vesiuol/";

function urlDaPagina(file) {
  if (file === "404.html") return null; // o 404 não entra no sitemap
  if (file === "index.html") return BASE_URL;
  return BASE_URL + file.replace(/index\.html$/, "");
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Data (AAAA-MM-DD) da última alteração do arquivo: hoje se ele está modificado
// e ainda sem commit; senão, a data do último commit que o alterou.
function dataIsoDoArquivo(relFile) {
  try {
    const sujo = execSync(`git status --porcelain -- "${relFile}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    if (sujo) return hojeIso();
    const iso = execSync(`git log -1 --format=%cd --date=short -- "${relFile}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    return iso || hojeIso();
  } catch {
    return hojeIso();
  }
}

function atualizarSitemap(paginas) {
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) {
    console.warn("sitemap.xml não encontrado — pulei a atualização de lastmod.");
    return;
  }
  const original = fs.readFileSync(sitemapPath, "utf8");
  const dataPorUrl = {};
  for (const page of paginas) {
    const url = urlDaPagina(page.file);
    if (url) dataPorUrl[url] = dataIsoDoArquivo(page.file);
  }

  const vistas = new Set();
  let mudancas = 0;
  const novo = original.replace(/<url>[\s\S]*?<\/url>/g, (bloco) => {
    const loc = (bloco.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    if (!loc || !dataPorUrl[loc]) return bloco;
    vistas.add(loc);
    const atual = (bloco.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    if (atual === undefined) return bloco;
    const nova = dataPorUrl[loc] > atual ? dataPorUrl[loc] : atual; // nunca volta no tempo
    if (nova === atual) return bloco;
    mudancas++;
    return bloco.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${nova}</lastmod>`);
  });

  for (const url of Object.keys(dataPorUrl)) {
    if (!vistas.has(url)) console.warn(`⚠ ${url} não está no sitemap.xml (posts novos entram pelo generate-blog-posts.js)`);
  }

  if (novo !== original) fs.writeFileSync(sitemapPath, novo, "utf8");
  console.log(`sitemap.xml: ${mudancas} lastmod atualizado(s).`);
}

function main() {
  const navTemplate = fs.readFileSync(path.join(ROOT, "partials/nav.html"), "utf8").trim();
  const footerTemplate = fs.readFileSync(path.join(ROOT, "partials/footer.html"), "utf8").trim();
  const gtmHeadTemplate = fs.readFileSync(path.join(ROOT, "partials/gtm-head.html"), "utf8").trim();
  const gtmBodyTemplate = fs.readFileSync(path.join(ROOT, "partials/gtm-body.html"), "utf8").trim();

  const todasAsPaginas = [...PAGES, ...descobrirPostsDoBlog()];

  let alterados = 0;
  let comErro = [];

  for (const page of todasAsPaginas) {
    const filePath = path.join(ROOT, page.file);
    if (!fs.existsSync(filePath)) {
      comErro.push(`${page.file}: arquivo não encontrado`);
      continue;
    }

    let conteudo = fs.readFileSync(filePath, "utf8");
    const original = conteudo;

    try {
      const nav = buildNav(navTemplate, page);
      conteudo = injetar(conteudo, "<!-- NAV:START -->", "<!-- NAV:END -->", nav);

      const footer = buildFooter(footerTemplate, page.file);
      conteudo = injetar(conteudo, "<!-- FOOTER:START -->", "<!-- FOOTER:END -->", footer);

      conteudo = injetar(conteudo, "<!-- GTM:HEAD:START -->", "<!-- GTM:HEAD:END -->", gtmHeadTemplate);
      conteudo = injetar(conteudo, "<!-- GTM:BODY:START -->", "<!-- GTM:BODY:END -->", gtmBodyTemplate);
    } catch (e) {
      comErro.push(`${page.file}: ${e.message}`);
      continue;
    }

    if (conteudo !== original) {
      fs.writeFileSync(filePath, conteudo, "utf8");
      alterados++;
      console.log(`✓ ${page.file}`);
    } else {
      console.log(`= ${page.file} (sem mudanças)`);
    }
  }

  atualizarSitemap(todasAsPaginas);

  if (comErro.length) {
    console.error("\nErros:");
    comErro.forEach((e) => console.error(`  ✗ ${e}`));
    process.exitCode = 1;
  }

  console.log(`\n${alterados} arquivo(s) atualizado(s) de ${todasAsPaginas.length} página(s) (${todasAsPaginas.length - PAGES.length} posts do blog descobertos automaticamente).`);
}

main();
