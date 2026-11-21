// ============================================================
// scripts/check-paises.js — Biblioteca Vesiuol
// Confere TODOS os países que aparecem nos dados do site contra o cadastro
// único (assets/paises.js). Roda no workflow check-paises.yml.
//
// O que ele faz:
//   1. Valida o próprio cadastro (nomes repetidos, coordenada, polígono no GeoJSON).
//   2. Lê o país de cada fonte (Notion, planilha do Desafio, Estante, Leituras, Histórico)
//      e avisa de qualquer nome que não reconhece.
//   3. Cruza Notion × planilha do Desafio: país que está na planilha e não no Notion,
//      mesmo país escrito de jeitos diferentes, Concluído de um lado e ausente do outro.
//
// Não altera nenhum arquivo. Só lê e relata (resumo na aba do workflow).
//   ERRO  → o workflow fica vermelho (o site pode estar escondendo um país no mapa)
//   AVISO → só informa (ex.: o mesmo país escrito de 2 jeitos conta em dobro no KPI Países)
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const P = require(path.join(ROOT, 'assets', 'paises.js'));

const erros = [];
const avisos = [];
const infos = [];
const add = (lista, titulo, linhas) => { if (linhas.length) lista.push({ titulo, linhas }); };

// ---------- leitura ----------
function lerJson(arq) {
  const f = path.join(DATA, arq);
  if (!fs.existsSync(f)) { infos.push({ titulo: 'Fonte ausente (pulada)', linhas: [arq] }); return null; }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
// parser de CSV simples (aspas, vírgulas e quebras de linha dentro de aspas)
function lerCsv(arq) {
  const f = path.join(DATA, arq);
  if (!fs.existsSync(f)) { infos.push({ titulo: 'Fonte ausente (pulada)', linhas: [arq] }); return null; }
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ',') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = ''; linhas.push(linha); linha = [];
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = linhas.shift() || [];
  return linhas.filter(l => l.some(c => c.trim() !== '')).map(l => {
    const o = {}; cab.forEach((c, i) => { o[c] = l[i] != null ? l[i] : ''; }); return o;
  });
}

// ---------- 1. cadastro ----------
(function validarCadastro() {
  const ids = new Set(), vistos = new Map(), probs = [];
  let nomesGeo = null;
  try {
    nomesGeo = new Set(JSON.parse(fs.readFileSync(path.join(DATA, 'world-countries.geo.json'), 'utf8')).features.map(f => f.properties.name));
  } catch (e) { infos.push({ titulo: 'GeoJSON não lido — checagem de polígonos pulada', linhas: [String(e.message)] }); }
  P.lista.forEach(p => {
    if (ids.has(p.id)) probs.push('id repetido: ' + p.id);
    ids.add(p.id);
    if (!Array.isArray(p.c) || Math.abs(p.c[0]) > 90 || Math.abs(p.c[1]) > 180) probs.push(p.n + ': coordenada inválida');
    if (p.g && nomesGeo && !nomesGeo.has(p.g)) probs.push(p.n + ': polígono "' + p.g + '" não existe em world-countries.geo.json');
    [p.n].concat(p.a || []).forEach(nm => {
      const k = P.norm(nm);
      if (!k) { probs.push(p.n + ': nome vazio'); return; }
      if (vistos.has(k) && vistos.get(k) !== p.id) probs.push('"' + nm + '" aponta pra dois países: ' + vistos.get(k) + ' e ' + p.id);
      vistos.set(k, p.id);
    });
  });
  add(erros, 'Cadastro assets/paises.js com problema', probs);
  infos.push({ titulo: 'Cadastro', linhas: [P.lista.length + ' países/territórios · ' + P.lista.filter(p => p.t === 'o').length + ' membros da ONU · ' + P.lista.filter(p => p.t === 'p').length + ' observadores · ' + P.lista.filter(p => p.g).length + ' com polígono'] });
})();

// ---------- 2. fontes ----------
const FONTES = []; // {nome, nomes:[{pais, extra}]}
function fonte(nome, lista) { if (lista) FONTES.push({ nome, nomes: lista.map(P.limpar).filter(x => x !== '') }); }

const notion = lerJson('desafio.json');
const rowsNotion = notion ? notion.filter(n => P.limpar(n.pais)) : [];
fonte('Notion (desafio.json)', notion && rowsNotion.map(n => n.pais));

const excel = lerCsv('desafio-livros.csv');
const rowsExcel = excel ? excel.filter(r => (r['Título'] || '').trim() && P.limpar(r['País'])) : [];
fonte('Planilha do Desafio (desafio-livros.csv)', excel && rowsExcel.map(r => r['País']));

const estante = lerJson('estante.json');
fonte('Estante (estante.json)', estante && estante.map(r => r['País'] || ''));
[2024, 2025, 2026].forEach(a => {
  const d = lerJson('leituras-' + a + '.json');
  fonte('Leituras ' + a, d && d.map(r => r['País'] || ''));
});
const hist = lerJson('historico-visao-geral.json');
fonte('Histórico (visão geral)', hist && hist.map(r => r['Países'] || ''));
const csv26 = lerCsv('2026.csv');
fonte('2026.csv', csv26 && csv26.map(r => r['País'] || ''));

const resumo = [];
FONTES.forEach(f => {
  const distintos = [...new Set(f.nomes)];
  const desconhecidos = distintos.filter(n => !P.ignorado(n) && !P.resolver(n));
  const ignorados = distintos.filter(n => P.ignorado(n));
  resumo.push('| ' + f.nome + ' | ' + distintos.length + ' | ' + ignorados.length + ' | ' + desconhecidos.length + ' |');
  add(erros, 'País desconhecido em ' + f.nome + ' — acrescente em assets/paises.js', desconhecidos.map(n => '"' + n + '"'));
});

// mesmo país escrito de jeitos diferentes DENTRO da mesma fonte (conta em dobro nos KPIs de países)
FONTES.forEach(f => {
  const porId = new Map();
  [...new Set(f.nomes)].forEach(n => { const p = P.resolver(n); if (p) { if (!porId.has(p.id)) porId.set(p.id, []); porId.get(p.id).push(n); } });
  const dup = [...porId.entries()].filter(([, v]) => v.length > 1).map(([id, v]) => P.lista.find(p => p.id === id).n + ': ' + v.map(x => '"' + x + '"').join(' / '));
  add(avisos, 'Mesmo país escrito de jeitos diferentes em ' + f.nome + ' (conta em dobro em contagens de países)', dup);
});

// ---------- 3. Notion × planilha do Desafio ----------
if (notion && excel) {
  const nPorId = new Map();
  rowsNotion.forEach(n => { const p = P.resolver(n.pais); if (!p) return; if (!nPorId.has(p.id)) nPorId.set(p.id, []); nPorId.get(p.id).push(n); });

  const ePorId = new Map();
  rowsExcel.forEach(r => { const p = P.resolver(r['País']); if (!p) return; if (!ePorId.has(p.id)) ePorId.set(p.id, []); ePorId.get(p.id).push(r); });

  const naoNoNotion = [], grafiaDiferente = [], concluidoSemPlanilha = [], planilhaSemConcluido = [];
  ePorId.forEach((rows, id) => {
    const cad = P.lista.find(p => p.id === id);
    const nomesExcel = [...new Set(rows.map(r => P.limpar(r['País'])))];
    const linhasN = nPorId.get(id);
    if (!linhasN) { naoNoNotion.push(nomesExcel.map(x => '"' + x + '"').join(' / ') + ' (' + cad.n + ') — ' + rows.length + ' livro(s) na planilha, nenhuma linha no Notion'); return; }
    const nomesNotion = linhasN.map(n => P.limpar(n.pais));
    const nk = new Set(nomesNotion.map(P.norm));
    nomesExcel.filter(x => !nk.has(P.norm(x))).forEach(x => grafiaDiferente.push('planilha: "' + x + '"  ↔  Notion: ' + nomesNotion.map(y => '"' + y + '"').join(' / ')));
    if (!linhasN.some(n => n.status_notion === 'Concluído')) planilhaSemConcluido.push(nomesExcel.join(' / ') + ' está na planilha do Desafio, mas no Notion não consta Concluído');
  });
  nPorId.forEach((rows, id) => {
    if (rows.some(n => n.status_notion === 'Concluído') && !ePorId.has(id)) concluidoSemPlanilha.push(rows.map(n => P.limpar(n.pais)).join(' / ') + ' está Concluído no Notion e não aparece na planilha do Desafio');
  });
  const dupNotion = [...nPorId.entries()].filter(([, v]) => v.length > 1).map(([id, v]) => P.lista.find(p => p.id === id).n + ': ' + v.map(n => '"' + P.limpar(n.pais) + '"' + (n.livro ? ' (livro: ' + n.livro + ')' : ' (sem livro)')).join(' / '));

  add(erros, 'País da planilha do Desafio que NÃO existe no Notion', naoNoNotion);
  add(avisos, 'Mesmo país escrito diferente no Notion e na planilha do Desafio', grafiaDiferente);
  add(avisos, 'Notion tem o MESMO país em mais de uma linha (o mapa usa a melhor delas: lido > lendo > mapeado)', dupNotion);
  add(avisos, 'Concluído no Notion, ausente na planilha do Desafio', concluidoSemPlanilha);
  add(avisos, 'Na planilha do Desafio, mas sem Concluído no Notion', planilhaSemConcluido);
  infos.push({ titulo: 'Cruzamento Notion × planilha do Desafio', linhas: [nPorId.size + ' países distintos no Notion · ' + ePorId.size + ' países distintos na planilha'] });
}

// ---------- relatório ----------
const out = [];
out.push('# Conferência de países');
out.push('');
out.push('| Fonte | Nomes distintos | Ignorados (gráfico/resumo/Diversos) | Desconhecidos |');
out.push('| --- | ---: | ---: | ---: |');
resumo.forEach(l => out.push(l));
out.push('');
const secao = (emoji, nome, lista) => {
  if (!lista.length) return;
  out.push('## ' + emoji + ' ' + nome);
  lista.forEach(s => { out.push('**' + s.titulo + '**'); s.linhas.forEach(l => out.push('- ' + l)); out.push(''); });
};
secao('❌', 'Erros (' + erros.reduce((a, s) => a + s.linhas.length, 0) + ')', erros);
secao('⚠️', 'Avisos', avisos);
secao('ℹ️', 'Informações', infos);
if (!erros.length) out.push('✅ Nenhum país desconhecido nas fontes.');
const texto = out.join('\n');
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
process.exit(erros.length ? 1 : 0);
