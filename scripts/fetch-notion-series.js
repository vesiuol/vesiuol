// Lê o banco "Séries — Minha Coleção" do Notion e grava data/series.json.
// A página Estante (seção "Séries e livros únicos") lê esse arquivo local.
const fs = require('fs');

// ID do banco = o código da URL do banco no Notion (mesmo padrão do fetch-notion-desafio.js).
// O segundo ID é o da "fonte de dados" do mesmo banco: só é tentado se o primeiro não for encontrado.
const DB_IDS = ['c5c9064e-de05-409e-9725-046dc372a3d8', '9b27fa68-d6b3-441b-a553-627bdb672172'];
const TOKEN = process.env.NOTION_TOKEN;

function texto(prop) {
if (!prop) return '';
if (prop.title) return prop.title.map(t => t.plain_text).join('').trim();
if (prop.rich_text) return prop.rich_text.map(t => t.plain_text).join('').trim();
if (prop.select) return (prop.select && prop.select.name) || '';
return '';
}
function numero(prop) {
return prop && typeof prop.number === 'number' ? prop.number : null;
}

async function consultar(dbId) {
let results = [];
let cursor;
do {
const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
method: 'POST',
headers: {
'Authorization': `Bearer ${TOKEN}`,
'Notion-Version': '2022-06-28',
'Content-Type': 'application/json'
},
body: JSON.stringify(cursor ? { start_cursor: cursor } : {})
});
const data = await res.json();
if (!res.ok) return { erro: data, status: res.status };
results = results.concat(data.results);
cursor = data.has_more ? data.next_cursor : undefined;
} while (cursor);
return { results };
}

async function run() {
if (!TOKEN) { console.error('NOTION_TOKEN não definido (Settings > Secrets > Actions no GitHub).'); process.exit(1); }
let results = null;
for (const id of DB_IDS) {
const r = await consultar(id);
if (r.results) { console.log(`Banco lido com o ID ${id}`); results = r.results; break; }
console.error(`ID ${id} falhou (HTTP ${r.status}): ${r.erro && r.erro.code} — ${r.erro && r.erro.message}`);
}
if (!results) {
console.error('\nNão consegui ler o banco "Séries — Minha Coleção".');
console.error('Causa mais comum (erro object_not_found / 404): a integração do Notion não foi conectada a esse banco.');
console.error('No Notion: abrir o banco > ••• > Conexões > adicionar a mesma integração usada no Desafio.');
process.exit(1);
}

const out = results.map(page => {
const p = page.properties;
return {
nome: texto(p['Nome da Série']),
autor: texto(p['Autor(a)']),
status: texto(p['Status']),
total: numero(p['Total de livros']),
tenho: numero(p['Você tem (nº)']),
leu: numero(p['Você já leu (nº)'])
};
}).filter(x => x.nome);

// Resumo no log do GitHub Actions: serve para Louise conferir se todas as séries vieram
// e quais estão com número faltando (sem total, o site mostra "—" no lugar de "leu de total").
console.log(`Séries lidas do Notion: ${out.length}`);
out.forEach(x => console.log(` - ${x.nome} | total=${x.total} tenho=${x.tenho} leu=${x.leu} | ${x.status || 'sem status'}`));
const incompletas = out.filter(x => x.total === null || x.tenho === null || x.leu === null);
if (incompletas.length) {
console.warn(`Atenção: ${incompletas.length} série(s) com número em branco: ${incompletas.map(x => x.nome).join('; ')}`);
}
if (!out.length) { console.error('Nenhuma série encontrada — o banco está vazio ou a integração não tem acesso a ele. Não vou sobrescrever data/series.json.'); process.exit(1); }

fs.writeFileSync('data/series.json', JSON.stringify(out, null, 2) + '\n');
}
run();
