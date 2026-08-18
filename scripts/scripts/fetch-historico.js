const fs = require('fs');

// Planilha A — aba VISÃO GERAL LEITURAS (Governança: gid=700848757).
// Mesma fonte usada por index.html e historico/index.html.
const CSV_VIS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSr2QAOcSRlo1kTRVWZTyqeixEf0JMmT4m3T4sy4kZ_NQbYhtDPACquiTdb2bXQ76mVNnv1dBJQ2SNK/pub?gid=700848757&single=true&output=csv';

// Parser simples de CSV que respeita aspas e vírgulas dentro de campos (mesmo padrão de fetch-estante.js).
// Diferente de fetch-estante.js: cabeçalhos vazios são preservados como '' (não viram `_col{i}`),
// porque o código cliente (index.html / historico/index.html) usa r[''] para achar a coluna de rótulo —
// isso precisa bater exatamente com o comportamento do PapaParse (header:true) usado no fallback ao vivo.
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i], next = text[i+1];
    if(inQuotes){
      if(c === '"' && next === '"'){ field += '"'; i++; }
      else if(c === '"'){ inQuotes = false; }
      else { field += c; }
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c === '\r'){ /* ignora */ }
      else { field += c; }
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  const header = rows.shift();
  const usedNames = {};
  const uniqueHeader = header.map((h) => {
    const name = h.trim();
    if (usedNames[name] != null) { usedNames[name]++; return `${name}_${usedNames[name]}`; }
    usedNames[name] = 0;
    return name;
  });
  return rows.filter(r=>r.some(v=>v && v.trim())).map(r=>{
    const obj = {};
    uniqueHeader.forEach((h,i)=>{ obj[h] = (r[i]||'').trim(); });
    return obj;
  });
}

async function run(){
  fs.mkdirSync('data', { recursive: true });
  const res = await fetch(CSV_VIS);
  if(!res.ok){ console.error('Erro ao buscar histórico:', res.status); process.exit(1); }
  const csvText = await res.text();
  const json = parseCSV(csvText);
  fs.writeFileSync('data/historico-visao-geral.json', JSON.stringify(json, null, 2));
  console.log(`Salvo ${json.length} linhas em data/historico-visao-geral.json`);
}

run();
