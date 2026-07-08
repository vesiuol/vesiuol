const fs = require('fs');

const SHEETS = {
  '2024': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSr2QAOcSRlo1kTRVWZTyqeixEf0JMmT4m3T4sy4kZ_NQbYhtDPACquiTdb2bXQ76mVNnv1dBJQ2SNK/pub?gid=963475305&single=true&output=csv',
  '2025': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSr2QAOcSRlo1kTRVWZTyqeixEf0JMmT4m3T4sy4kZ_NQbYhtDPACquiTdb2bXQ76mVNnv1dBJQ2SNK/pub?gid=0&single=true&output=csv',
  '2026': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSr2QAOcSRlo1kTRVWZTyqeixEf0JMmT4m3T4sy4kZ_NQbYhtDPACquiTdb2bXQ76mVNnv1dBJQ2SNK/pub?gid=537800862&single=true&output=csv'
};

// Parser simples de CSV que respeita aspas e vírgulas dentro de campos
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
  return rows.filter(r=>r.some(v=>v && v.trim())).map(r=>{
    const obj = {};
    header.forEach((h,i)=>{ obj[h.trim()] = (r[i]||'').trim(); });
    return obj;
  });
}

async function run(){
  fs.mkdirSync('data', { recursive: true });
  for(const [year, url] of Object.entries(SHEETS)){
    const res = await fetch(url);
    if(!res.ok){ console.error(`Erro ao buscar ${year}:`, res.status); continue; }
    const csvText = await res.text();
    const json = parseCSV(csvText);
    fs.writeFileSync(`data/leituras-${year}.json`, JSON.stringify(json, null, 2));
    console.log(`Salvo ${json.length} linhas em data/leituras-${year}.json`);
  }
}

run();
