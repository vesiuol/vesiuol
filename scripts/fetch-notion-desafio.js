const DB_ID = 'dec695e0-12bd-4252-b328-0c7d4de3e911';
const TOKEN = process.env.NOTION_TOKEN;

// Normaliza texto para cruzar "Livro"+"Autor" do Notion com a Estante:
// remove espaço non-breaking (\u00a0) e afins, colapsa espaços, ignora
// maiúsculas/acentos/pontuação. Sem isso, diferenças de digitação entre
// as duas fontes (ex: espaço invisível no fim do título) quebram o match.
function norm(s) {
  if (!s) return '';
  return s.toString()
    .replace(/[\u00a0\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '');
}

// Carrega Estante + Leituras (2024/2025/2026, já commitadas pelos workflows
// existentes) e monta, para cada uma, dois índices: por Título+Autor (match
// forte) e por Título sozinho — usado como fallback só quando o título é
// único na fonte, útil quando o nome do autor vem escrito de forma muito
// diferente entre Notion e planilha (ex: ordem do nome invertida).
function montarIndices(linhas, campoTitulo, campoAutor) {
  const porTituloAutor = {};
  const porTitulo = {};
  const contagemTitulo = {};
  linhas.forEach(row => {
    const t = norm(row[campoTitulo]);
    const a = norm(row[campoAutor]);
    if (!t) return;
    porTituloAutor[t + '|' + a] = row;
    contagemTitulo[t] = (contagemTitulo[t] || 0) + 1;
    porTitulo[t] = row;
  });
  Object.keys(contagemTitulo).forEach(t => { if (contagemTitulo[t] > 1) delete porTitulo[t]; });
  return { porTituloAutor, porTitulo };
}

function carregarFontesComplementares() {
  const fs = require('fs');
  let estante = [];
  try {
    estante = JSON.parse(fs.readFileSync('data/estante.json', 'utf8'));
  } catch (e) {
    console.warn('Aviso: não consegui ler data/estante.json (', e.message, ')');
  }

  // A planilha Leituras cobre TODOS os livros já lidos, mesmo os que não
  // ficaram na Estante (ex: livro físico repassado depois, e-book/audiolivro
  // avulso) — por isso serve de segunda fonte quando a Estante não tem o livro.
  let leituras = [];
  ['2024', '2025', '2026'].forEach(ano => {
    try {
      const rows = JSON.parse(fs.readFileSync(`data/leituras-${ano}.json`, 'utf8'));
      leituras = leituras.concat(rows.map(r => ({ ...r, _ano: ano })));
    } catch (e) {
      console.warn(`Aviso: não consegui ler data/leituras-${ano}.json (`, e.message, ')');
    }
  });

  return {
    estante: montarIndices(estante, 'Livros', 'Nome'),
    leituras: montarIndices(leituras, 'Título', 'Nome')
  };
}

// Lê um campo tentando várias grafias possíveis — os nomes de coluna de
// diversidade mudam ligeiramente entre as abas 2024/2025/2026 da Leituras.
function campo(row, nomes) {
  for (const n of nomes) { if (row[n] !== undefined && row[n] !== '') return row[n]; }
  return '';
}

function buscarEnriquecimento(indices, titulo, autor) {
  const t = norm(titulo), a = norm(autor);
  return indices.porTituloAutor[t + '|' + a] || indices.porTitulo[t] || null;
}

function boolPtBr(v) {
  return /^(true|sim)$/i.test(String(v || '').trim()) ? 'Sim' : 'Não';
}

function getText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text).join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.select) return prop.select.name || '';
  if (prop.status) return prop.status.name || '';
  if (prop.checkbox !== undefined) return prop.checkbox ? 'Sim' : 'Não';
  if (prop.files && prop.files.length) {
    const f = prop.files[0];
    return f.file ? f.file.url : (f.external ? f.external.url : '');
  }
  return '';
}

async function run() {
  let results = [];
  let cursor = undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
    });
    const data = await res.json();
    if (!res.ok) { console.error(data); process.exit(1); }
    results = results.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const fontes = carregarFontesComplementares();
  const naoEncontrados = [];

  const out = results.map(page => {
    const p = page.properties;
    const base = {
      pais: getText(p['País']),
      livro: getText(p['Livro']),
      autor: getText(p['Autor']),
      ga: getText(p['Gênero autor']),
      status_notion: getText(p['Estatus']),
      tenho: getText(p['Tenho']),
      capa: getText(p['Capa do livro']),
      // Campos vindos da Estante/Leituras (planilhas), preenchidos abaixo quando há match:
      nota: '',
      cor: '',
      genero_livro: '',
      diversidade_etnica: '',
      lgbtq: '',
      ownvoices: ''
    };

    if (base.livro) {
      let fonte = buscarEnriquecimento(fontes.estante, base.livro, base.autor);
      if (!fonte) fonte = buscarEnriquecimento(fontes.leituras, base.livro, base.autor);

      if (fonte) {
        base.nota = campo(fonte, ['Estrelas', 'NOTA']);
        base.cor = campo(fonte, ['Cor']);
        base.genero_livro = campo(fonte, ['Gênero']);
        base.diversidade_etnica = boolPtBr(campo(fonte, ['Diversidade etnica/racial?', 'Diversidade etnica/racial']));
        base.lgbtq = boolPtBr(campo(fonte, ['Protagonista LGBTQIA+?', 'Protagonista LGBTQ+']));
        base.ownvoices = boolPtBr(campo(fonte, ['#OwnVoices?']));
      } else if (base.tenho === 'Sim' || base.status_notion === 'Concluído') {
        // Livro marcado como "já tenho" ou já lido, mas que não bateu com
        // nenhum título da Estante nem da Leituras — provável divergência
        // de digitação entre as fontes (conferir manualmente).
        naoEncontrados.push(`${base.pais}: "${base.livro}" — ${base.autor}`);
      }
    }

    return base;
  }).filter(r => r.pais);

  if (naoEncontrados.length) {
    console.warn(`Aviso: ${naoEncontrados.length} livro(s) "tenho" ou "lido" no Notion não bateram com Estante nem Leituras (conferir digitação):`);
    naoEncontrados.forEach(l => console.warn('  - ' + l));
  }

  const fs = require('fs');
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/desafio.json', JSON.stringify(out, null, 2));
  console.log(`Salvo ${out.length} países em data/desafio.json`);
}

run();
