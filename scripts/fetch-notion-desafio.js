const DB_ID = 'dec695e0-12bd-4252-b328-0c7d4de3e911';
const TOKEN = process.env.NOTION_TOKEN;

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

  const out = results.map(page => {
    const p = page.properties;
    return {
      pais: getText(p['País']),
      livro: getText(p['Livro']),
      autor: getText(p['Autor']),
      ga: getText(p['Gênero autor']),
      status_notion: getText(p['Estatus']),
      tenho: getText(p['Tenho']),
      capa: getText(p['Capa do livro'])
    };
  }).filter(r => r.pais);

  const fs = require('fs');
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/desafio.json', JSON.stringify(out, null, 2));
  console.log(`Salvo ${out.length} países em data/desafio.json`);
}

run();
