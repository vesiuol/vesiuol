const fs = require('fs');

const CSV_ESTANTE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQWGv70Tc2vz-YUKxwU_0_H8F7UuHom1tCJQlE2Tfi8AMNem2c5X3WSs6z4CPjoTb2AaFKmJ8bihlPV/pub?gid=0&single=true&output=csv';

// Parser simples de CSV que respeita aspas e vírgulas dentro de campos (mesmo padrão de fetch-leituras.js)
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
  const uniqueHeader = header.map((h, i) => {
    let name = h.trim();
    if (!name) name = `_col${i}`; // preserva colunas sem cabeçalho em vez de perder o dado
    if (usedNames[name] != null) { usedNames[name]++; name = `${name}_${usedNames[name]}`; }
    else { usedNames[name] = 0; }
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
  const res = await fetch(CSV_ESTANTE);
  if(!res.ok){ console.error('Erro ao buscar estante:', res.status); process.exit(1); }
  const csvText = await res.text();
  const json = parseCSV(csvText);
  fs.writeFileSync('data/estante.json', JSON.stringify(json, null, 2));
  console.log(`Salvo ${json.length} linhas em data/estante.json`);
}

run();
