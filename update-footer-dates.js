// Atualiza automaticamente o <span id="data-atualizacao"> das 6 páginas principais
// sempre que uma delas for alterada em um push na main.
// Não mexe em blog/ — o blog já tem seu próprio pipeline de geração via Notion
// (scripts/generate-blog-posts.js) e trata suas próprias datas separadamente.
//
// Decisão registrada em Governança > Registro de Decisões (auditoria de
// acessibilidade/manutenção, 2026-08-06): a data de "atualizado em" deixa de ser
// digitada manualmente por quem publica e passa a refletir a data real do commit
// que alterou aquela página específica.

const { execSync } = require('child_process');
const fs = require('fs');

const PAGINAS_PRINCIPAIS = [
  'index.html',
  'sobre.html',
  'estante.html',
  'historico.html',
  'desafio.html',
  '2026.html',
];

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function dataFormatadaBrasilia() {
  // Horário de Brasília (sem horário de verão) = UTC-3
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  const mes = MESES[agora.getUTCMonth()];
  const ano = agora.getUTCFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

function arquivosAlterados() {
  try {
    const saida = execSync('git diff --name-only HEAD^ HEAD', { encoding: 'utf8' });
    return saida.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    // HEAD^ pode não existir em pushes de commit único/primeiro commit do dia — não falha o job.
    console.log('Não foi possível comparar com HEAD^, nada será atualizado:', err.message);
    return [];
  }
}

function main() {
  const alterados = arquivosAlterados();
  const dataFormatada = dataFormatadaBrasilia();
  const tocados = [];

  for (const pagina of PAGINAS_PRINCIPAIS) {
    if (!alterados.includes(pagina)) continue;
    if (!fs.existsSync(pagina)) continue;

    const conteudo = fs.readFileSync(pagina, 'utf8');
    const regex = /(<span id="data-atualizacao">)([^<]*)(<\/span>)/;

    if (!regex.test(conteudo)) {
      console.log(`Aviso: ${pagina} mudou mas não tem <span id="data-atualizacao">.`);
      continue;
    }

    const atualizado = conteudo.replace(regex, `$1${dataFormatada}$3`);
    if (atualizado !== conteudo) {
      fs.writeFileSync(pagina, atualizado, 'utf8');
      tocados.push(pagina);
    }
  }

  if (tocados.length === 0) {
    console.log('Nenhuma das 6 páginas principais mudou neste push. Nada a fazer.');
    process.exit(0);
  }

  console.log(`Data do rodapé atualizada para "${dataFormatada}" em: ${tocados.join(', ')}`);
}

main();
