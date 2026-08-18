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
  { file: "privacidade/index.html", active: null },
  { file: "blog/index.html", active: "blog" },
  { file: "blog/como-escolhi-um-livro-por-pais-rota-1/index.html", active: "blog" },
  { file: "blog/desafio-livros-pelo-mundo/index.html", active: "blog" },
  { file: "blog/encontrando-escritores-e-montando-a-lista-por-pais-rota-2/index.html", active: "blog" },
  { file: "blog/os-paises-que-ja-li-e-minha-planilha-no-notion/index.html", active: "blog" },
  { file: "blog/resenha-a-guerra-nao-tem-rosto-de-mulher-svetlana-alexijevich/index.html", active: "blog" },
  { file: "blog/resenha-historias-cruzadas-entre-sobreviventes-svetlana-alexijevich/index.html", active: "blog" },
];

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

function main() {
  const navTemplate = fs.readFileSync(path.join(ROOT, "partials/nav.html"), "utf8").trim();
  const footerTemplate = fs.readFileSync(path.join(ROOT, "partials/footer.html"), "utf8").trim();
  const gtmHeadTemplate = fs.readFileSync(path.join(ROOT, "partials/gtm-head.html"), "utf8").trim();
  const gtmBodyTemplate = fs.readFileSync(path.join(ROOT, "partials/gtm-body.html"), "utf8").trim();

  let alterados = 0;
  let comErro = [];

  for (const page of PAGES) {
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

  if (comErro.length) {
    console.error("\nErros:");
    comErro.forEach((e) => console.error(`  ✗ ${e}`));
    process.exitCode = 1;
  }

  console.log(`\n${alterados} arquivo(s) atualizado(s) de ${PAGES.length} listado(s).`);
}

main();
