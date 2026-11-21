// ============================================================
// PAISES.JS — Biblioteca Vesiuol
// Cadastro ÚNICO de países: nome oficial, variações de escrita,
// coordenada do ponto no mapa e nome no GeoJSON do polígono.
//
// Quem usa:
//   • páginas com mapa (Desafio, Estante, Histórico, 2026) — carregado sob demanda junto com o Leaflet
//   • scripts/check-paises.js (workflow check-paises.yml) — confere se algum país
//     novo das planilhas/Notion está escrito de um jeito que não conhecemos
//
// Como editar quando o workflow avisar "país desconhecido":
//   1. Se é só OUTRO JEITO de escrever um país que já existe → acrescente o nome
//      na lista `a` (aliases) daquele país. Maiúscula, acento, hífen e "&" não importam.
//   2. Se é um país/território que não existe aqui → copie uma linha, troque id (código
//      ISO de 3 letras), t, n, c e a. t: 'o' = membro da ONU, 'p' = observador, 'x' = fora da ONU.
//   3. `g` = nome do país dentro de data/world-countries.geo.json (só se existir polígono lá).
//   4. `r` = região do gráfico "Países por região" do Desafio (América do Sul, Europa, África...).
//
// O nome que APARECE no site continua sendo o que está escrito na planilha/Notion
// (decisão 2026-08-21: sem tradução no código). Este arquivo só serve pra ENTENDER o nome.
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PAISES = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Linhas da planilha que NÃO são país e nunca entram no mapa (regra da Louise):
  //   "(gráfico)"/"(resumo)" = linha de totais da planilha · "Diversos" = equivale a vazio
  const IGNORAR = ['(gráfico)', '(grafico)', '(resumo)', 'diversos', 'diversas'];

  const LISTA = [
  {id:'DZA',t:'o',n:'Argélia',r:'África do Norte',c:[28,2.6],g:'Algeria',a:['Algeria','Argelia','Algérie','República Argelina Democrática e Popular']},
  {id:'AGO',t:'o',n:'Angola',r:'África',c:[-8.8,13.2],g:'Angola',a:['República de Angola']},
  {id:'BEN',t:'o',n:'Benim',r:'África',c:[9.6,2.3],g:'Benin',a:['Benin','Bénin','Daomé','Dahomey','Benin']},
  {id:'BWA',t:'o',n:'Botsuana',r:'África',c:[-22.3,24.7],g:'Botswana',a:['Botswana','Botsuana']},
  {id:'BFA',t:'o',n:'Burkina Faso',r:'África',c:[12.2,-1.6],g:'Burkina Faso',a:['Burkina','Burquina Faso','Alto Volta','Upper Volta']},
  {id:'BDI',t:'o',n:'Burundi',r:'África',c:[-3.4,29.9],g:'Burundi',a:['República do Burundi']},
  {id:'CPV',t:'o',n:'Cabo Verde',r:'África',c:[16,-24],a:['Cape Verde','Cape Verde Islands']},
  {id:'CMR',t:'o',n:'Camarões',r:'África',c:[3.9,11.5],g:'Cameroon',a:['Cameroon','Cameroun','Camerún']},
  {id:'CAF',t:'o',n:'República Centro-Africana',r:'África',c:[6.6,20.9],g:'Central African Republic',a:['Centro-Africana','Central African Republic','Centrafrique','RCA','Rep. Centro-Africana']},
  {id:'TCD',t:'o',n:'Chade',r:'África',c:[15.5,18.7],g:'Chad',a:['Chad','Tchad']},
  {id:'COM',t:'o',n:'Comores',r:'África',c:[-11.9,43.9],a:['Comoros','Comoras','União das Comores']},
  {id:'COG',t:'o',n:'República do Congo',r:'África',c:[-4.3,15.3],g:'Republic of the Congo',a:['Congo','Congo-Brazzaville','Congo (Brazzaville)','Republic of the Congo','Rep. do Congo','Congo Brazzaville']},
  {id:'COD',t:'o',n:'República Democrática do Congo',r:'África',c:[-4.3,15.3],g:'Democratic Republic of the Congo',a:['RDC','RD Congo','R.D. Congo','Congo-Kinshasa','Congo (Kinshasa)','Zaire','Democratic Republic of the Congo','DR Congo','DRC','Congo Democrático','Rep. Dem. do Congo','Congo Kinshasa']},
  {id:'CIV',t:'o',n:'Costa do Marfim',r:'África',c:[7.5,-5.5],g:'Ivory Coast',a:['Côte d\'Ivoire','Cote d\'Ivoire','Ivory Coast','Costa de Marfim']},
  {id:'DJI',t:'o',n:'Djibuti',r:'África',c:[11.8,42.6],g:'Djibouti',a:['Djibouti','Jibuti','Djibouti']},
  {id:'EGY',t:'o',n:'Egito',r:'África do Norte',c:[30.1,31.2],g:'Egypt',a:['Egypt','Egipto','Égypte','República Árabe do Egito']},
  {id:'GNQ',t:'o',n:'Guiné Equatorial',r:'África',c:[1.6,10.5],g:'Equatorial Guinea',a:['Equatorial Guinea','Guinea Ecuatorial','Guiné-Equatorial']},
  {id:'ERI',t:'o',n:'Eritreia',r:'África',c:[15.2,39.8],g:'Eritrea',a:['Eritrea','Eritréia']},
  {id:'SWZ',t:'o',n:'Eswatini',r:'África',c:[-26.5,31.5],g:'Swaziland',a:['Suazilândia','Suazilandia','Swaziland','Essuatíni','Esuatíni','Reino de Essuatíni','Reino de Eswatini']},
  {id:'ETH',t:'o',n:'Etiópia',r:'África',c:[9,38.7],g:'Ethiopia',a:['Ethiopia','Etiopía','Abissínia']},
  {id:'GAB',t:'o',n:'Gabão',r:'África',c:[-0.8,11.6],g:'Gabon',a:['Gabon','Gabón']},
  {id:'GMB',t:'o',n:'Gâmbia',r:'África',c:[13.5,-15.6],g:'Gambia',a:['Gambia','The Gambia']},
  {id:'GHA',t:'o',n:'Gana',r:'África',c:[5.6,-0.2],g:'Ghana',a:['Ghana']},
  {id:'GIN',t:'o',n:'Guiné',r:'África',c:[9.9,-9.7],g:'Guinea',a:['Guinea','Guinée','Guiné-Conacri','Guinea-Conakry']},
  {id:'GNB',t:'o',n:'Guiné-Bissau',r:'África',c:[12,-15.2],g:'Guinea Bissau',a:['Guinea-Bissau','Guinea Bissau','Guiné Bissau']},
  {id:'KEN',t:'o',n:'Quênia',r:'África',c:[-1.3,36.8],g:'Kenya',a:['Kenya','Quénia','Kenia']},
  {id:'LSO',t:'o',n:'Lesoto',r:'África',c:[-29.6,28.2],g:'Lesotho',a:['Lesotho']},
  {id:'LBR',t:'o',n:'Libéria',r:'África',c:[6.4,-9.4],g:'Liberia',a:['Liberia']},
  {id:'LBY',t:'o',n:'Líbia',r:'África do Norte',c:[27,17],g:'Libya',a:['Libya','Libia']},
  {id:'MDG',t:'o',n:'Madagascar',r:'África',c:[-19.4,46.7],g:'Madagascar',a:['Madagáscar','Madagasikara']},
  {id:'MWI',t:'o',n:'Malawi',r:'África',c:[-13.3,34.3],g:'Malawi',a:['Malaui','Malavi','Niassalândia']},
  {id:'MLI',t:'o',n:'Mali',r:'África',c:[17.6,-2],g:'Mali',a:['Máli']},
  {id:'MRT',t:'o',n:'Mauritânia',r:'África',c:[20.3,-10.3],g:'Mauritania',a:['Mauritania','Mauritanie']},
  {id:'MUS',t:'o',n:'Maurício',r:'África',c:[-20.3,57.6],a:['Mauritius','Maurícia','Maurice','Mauricio']},
  {id:'MAR',t:'o',n:'Marrocos',r:'África do Norte',c:[34,-6.8],g:'Morocco',a:['Morocco','Marruecos','Maroc']},
  {id:'MOZ',t:'o',n:'Moçambique',r:'África',c:[-18.7,35.5],g:'Mozambique',a:['Mozambique']},
  {id:'NAM',t:'o',n:'Namíbia',r:'África',c:[-22.6,17.1],g:'Namibia',a:['Namibia']},
  {id:'NER',t:'o',n:'Níger',r:'África',c:[17.6,8.1],g:'Niger',a:['Niger']},
  {id:'NGA',t:'o',n:'Nigéria',r:'África',c:[9.1,7.5],g:'Nigeria',a:['Nigeria']},
  {id:'RWA',t:'o',n:'Ruanda',r:'África',c:[-1.9,30.1],g:'Rwanda',a:['Rwanda']},
  {id:'STP',t:'o',n:'São Tomé e Príncipe',r:'África',c:[0.2,6.6],a:['Sao Tome and Principe','São Tomé','Sao Tome','São Tomé e Principe']},
  {id:'SEN',t:'o',n:'Senegal',r:'África',c:[14.7,-17.4],g:'Senegal',a:['Sénégal']},
  {id:'SYC',t:'o',n:'Seychelles',r:'África',c:[-4.7,55.5],a:['Seicheles']},
  {id:'SLE',t:'o',n:'Serra Leoa',r:'África',c:[8.5,-13.2],g:'Sierra Leone',a:['Sierra Leone','Sierra Leona']},
  {id:'SOM',t:'o',n:'Somália',r:'África',c:[2,45.3],g:'Somalia',a:['Somalia']},
  {id:'ZAF',t:'o',n:'África do Sul',r:'África',c:[-25.7,28.2],g:'South Africa',a:['South Africa','Sudáfrica','Afrique du Sud','RSA','Africa do Sul']},
  {id:'SSD',t:'o',n:'Sudão do Sul',r:'África',c:[7,30.2],g:'South Sudan',a:['South Sudan','Sudán del Sur']},
  {id:'SDN',t:'o',n:'Sudão',r:'África do Norte',c:[15.6,30.2],g:'Sudan',a:['Sudan','Sudán','Soudan']},
  {id:'TZA',t:'o',n:'Tanzânia',r:'África',c:[-6.4,34.9],g:'United Republic of Tanzania',a:['Tanzania','República Unida da Tanzânia','United Republic of Tanzania','Tanganica']},
  {id:'TGO',t:'o',n:'Togo',r:'África',c:[8.6,0.8],g:'Togo',a:['República Togolesa']},
  {id:'TUN',t:'o',n:'Tunísia',r:'África do Norte',c:[33.9,9.5],g:'Tunisia',a:['Tunisia','Túnez','Tunisie']},
  {id:'UGA',t:'o',n:'Uganda',r:'África',c:[0.3,32.6],g:'Uganda',a:[]},
  {id:'ZMB',t:'o',n:'Zâmbia',r:'África',c:[-15.4,28.3],g:'Zambia',a:['Zambia']},
  {id:'ZWE',t:'o',n:'Zimbábue',r:'África',c:[-17.8,31.1],g:'Zimbabwe',a:['Zimbabwe','Zimbabué']},
  {id:'ATG',t:'o',n:'Antígua e Barbuda',r:'Caribe',c:[17.1,-61.8],a:['Antigua and Barbuda','Antigua y Barbuda','Antígua','Antigua']},
  {id:'ARG',t:'o',n:'Argentina',r:'América do Sul',c:[-34.6,-58.4],g:'Argentina',a:['República Argentina']},
  {id:'BHS',t:'o',n:'Bahamas',r:'Caribe',c:[25,-77.4],g:'The Bahamas',a:['The Bahamas','Baamas','Commonwealth das Bahamas']},
  {id:'BRB',t:'o',n:'Barbados',r:'Caribe',c:[13.2,-59.5],a:[]},
  {id:'BLZ',t:'o',n:'Belize',r:'América Central',c:[17.2,-88.5],g:'Belize',a:['Belice','Belize']},
  {id:'BOL',t:'o',n:'Bolívia',r:'América do Sul',c:[-16.5,-68.1],g:'Bolivia',a:['Bolivia','Estado Plurinacional da Bolívia']},
  {id:'BRA',t:'o',n:'Brasil',r:'América do Sul',c:[-15.8,-47.9],g:'Brazil',a:['Brazil','República Federativa do Brasil','Brésil']},
  {id:'CAN',t:'o',n:'Canadá',r:'América do Norte',c:[56.1,-106.3],g:'Canada',a:['Canada']},
  {id:'CHL',t:'o',n:'Chile',r:'América do Sul',c:[-33.4,-70.6],g:'Chile',a:[]},
  {id:'COL',t:'o',n:'Colômbia',r:'América do Sul',c:[4.7,-74.1],g:'Colombia',a:['Colombia']},
  {id:'CRI',t:'o',n:'Costa Rica',r:'América Central',c:[9.7,-83.8],g:'Costa Rica',a:[]},
  {id:'CUB',t:'o',n:'Cuba',r:'Caribe',c:[23.1,-82.4],g:'Cuba',a:[]},
  {id:'DMA',t:'o',n:'Dominica',r:'Caribe',c:[15.4,-61.4],a:['Commonwealth da Dominica']},
  {id:'DOM',t:'o',n:'República Dominicana',r:'Caribe',c:[18.7,-70.2],g:'Dominican Republic',a:['Dominicana','Rep. Dominicana','Dominican Republic','Rep Dominicana']},
  {id:'ECU',t:'o',n:'Equador',r:'América do Sul',c:[-1.8,-78.2],g:'Ecuador',a:['Ecuador']},
  {id:'SLV',t:'o',n:'El Salvador',r:'América Central',c:[13.8,-88.9],g:'El Salvador',a:['Salvador']},
  {id:'GRD',t:'o',n:'Grenada',r:'Caribe',c:[12.1,-61.7],a:['Granada','Granada (Caribe)']},
  {id:'GTM',t:'o',n:'Guatemala',r:'América Central',c:[15.8,-90.2],g:'Guatemala',a:[]},
  {id:'GUY',t:'o',n:'Guiana',r:'América do Sul',c:[4.9,-58.9],g:'Guyana',a:['Guyana','República Cooperativa da Guiana']},
  {id:'HTI',t:'o',n:'Haiti',r:'Caribe',c:[18.9,-72.3],g:'Haiti',a:['Haïti','Haití']},
  {id:'HND',t:'o',n:'Honduras',r:'América Central',c:[15.2,-86.2],g:'Honduras',a:[]},
  {id:'JAM',t:'o',n:'Jamaica',r:'Caribe',c:[18.1,-77.3],g:'Jamaica',a:[]},
  {id:'MEX',t:'o',n:'México',r:'América Central',c:[19.4,-99.1],g:'Mexico',a:['Mexico','Estados Unidos Mexicanos','Méjico']},
  {id:'NIC',t:'o',n:'Nicarágua',r:'América Central',c:[12.9,-85.2],g:'Nicaragua',a:['Nicaragua']},
  {id:'PAN',t:'o',n:'Panamá',r:'América Central',c:[8.5,-80.8],g:'Panama',a:['Panama']},
  {id:'PRY',t:'o',n:'Paraguai',r:'América do Sul',c:[-23.4,-58.4],g:'Paraguay',a:['Paraguay']},
  {id:'PER',t:'o',n:'Peru',r:'América do Sul',c:[-12,-77],g:'Peru',a:['Perú']},
  {id:'KNA',t:'o',n:'São Cristóvão e Nevis',r:'Caribe',c:[17.3,-62.7],a:['Saint Kitts and Nevis','São Cristóvão e Neves','São Cristóvão e Névis','Saint Kitts e Nevis','São Kitts e Nevis','St. Kitts e Nevis']},
  {id:'LCA',t:'o',n:'Santa Lúcia',r:'Caribe',c:[13.9,-60.98],a:['Saint Lucia']},
  {id:'VCT',t:'o',n:'São Vicente e Granadinas',r:'Caribe',c:[13.25,-61.2],a:['Saint Vincent and the Grenadines','São Vicente e as Granadinas']},
  {id:'SUR',t:'o',n:'Suriname',r:'América do Sul',c:[3.9,-56],g:'Suriname',a:['Surinam']},
  {id:'TTO',t:'o',n:'Trindade e Tobago',r:'Caribe',c:[10.7,-61.5],g:'Trinidad and Tobago',a:['Trinidad e Tobago','Trinidad and Tobago','Trinidad y Tobago','Trinidad & Tobago']},
  {id:'USA',t:'o',n:'Estados Unidos',r:'América do Norte',c:[37.1,-95.7],g:'United States of America',a:['EUA','Estados Unidos da América','United States','United States of America','USA','US','E.U.A.','América','Estados Unidos (EUA)']},
  {id:'URY',t:'o',n:'Uruguai',r:'América do Sul',c:[-34.9,-56.2],g:'Uruguay',a:['Uruguay']},
  {id:'VEN',t:'o',n:'Venezuela',r:'América do Sul',c:[10.5,-66.9],g:'Venezuela',a:['República Bolivariana da Venezuela']},
  {id:'AFG',t:'o',n:'Afeganistão',r:'Oriente Médio',c:[34.5,69.2],g:'Afghanistan',a:['Afghanistan','Afganistán']},
  {id:'SAU',t:'o',n:'Arábia Saudita',r:'Oriente Médio',c:[23.9,45.1],g:'Saudi Arabia',a:['Saudi Arabia','Arabia Saudita','Arábia Saudí']},
  {id:'ARM',t:'o',n:'Armênia',r:'Ásia',c:[40.1,45],g:'Armenia',a:['Armenia','Armênia']},
  {id:'AZE',t:'o',n:'Azerbaijão',r:'Ásia',c:[40.1,47.6],g:'Azerbaijan',a:['Azerbaijan','Azerbaiyán','Azerbaidjão']},
  {id:'BHR',t:'o',n:'Bahrein',r:'Oriente Médio',c:[26,50.55],a:['Bahrain','Barein','Bahréin']},
  {id:'BGD',t:'o',n:'Bangladesh',r:'Ásia',c:[23.7,90.4],g:'Bangladesh',a:['Bangladexe']},
  {id:'BTN',t:'o',n:'Butão',r:'Ásia',c:[27.5,90.4],g:'Bhutan',a:['Bhutan','Bután']},
  {id:'BRN',t:'o',n:'Brunei',r:'Ásia',c:[4.5,114.7],g:'Brunei',a:['Brunei Darussalam','Brunéi']},
  {id:'KHM',t:'o',n:'Camboja',r:'Ásia',c:[12.6,104.99],g:'Cambodia',a:['Cambodia','Camboya','Cambodja','Kampuchea']},
  {id:'KAZ',t:'o',n:'Cazaquistão',r:'Ásia',c:[51.2,71.4],g:'Kazakhstan',a:['Kazakhstan','Kazajistán']},
  {id:'CHN',t:'o',n:'China',r:'Ásia',c:[39.9,116.4],g:'China',a:['República Popular da China','China Continental','PRC','Chine']},
  {id:'CYP',t:'o',n:'Chipre',r:'Europa',c:[35.1,33.4],g:'Cyprus',a:['Cyprus']},
  {id:'KOR',t:'o',n:'Coreia do Sul',r:'Ásia',c:[37.6,127],g:'South Korea',a:['South Korea','Corea del Sur','República da Coreia','Korea do Sul']},
  {id:'PRK',t:'o',n:'Coreia do Norte',r:'Ásia',c:[40.3,127.5],g:'North Korea',a:['North Korea','Corea del Norte','República Popular Democrática da Coreia','DPRK']},
  {id:'ARE',t:'o',n:'Emirados Árabes Unidos',r:'Oriente Médio',c:[23.4,53.8],g:'United Arab Emirates',a:['United Arab Emirates','UAE','EAU','Emiratos Árabes Unidos','Emirados']},
  {id:'PHL',t:'o',n:'Filipinas',r:'Ásia',c:[14.6,121],g:'Philippines',a:['Philippines']},
  {id:'GEO',t:'o',n:'Geórgia',r:'Ásia',c:[42.3,43.4],g:'Georgia',a:['Georgia','Sakartvelo']},
  {id:'YEM',t:'o',n:'Iêmen',r:'Oriente Médio',c:[15.6,48.5],g:'Yemen',a:['Yemen','Yémen','Iémen','Iemên']},
  {id:'IND',t:'o',n:'Índia',r:'Ásia',c:[28.6,77.2],g:'India',a:['India','Bharat','República da Índia','Índia Britânica','British India']},
  {id:'IDN',t:'o',n:'Indonésia',r:'Ásia',c:[-6.2,106.8],g:'Indonesia',a:['Indonesia']},
  {id:'IRN',t:'o',n:'Irã',r:'Oriente Médio',c:[35.7,51.4],g:'Iran',a:['Iran','Irão','Irán','República Islâmica do Irã','Pérsia','Persia']},
  {id:'IRQ',t:'o',n:'Iraque',r:'Oriente Médio',c:[33.3,44.4],g:'Iraq',a:['Iraq','Irak']},
  {id:'ISR',t:'o',n:'Israel',r:'Oriente Médio',c:[31.8,35.2],g:'Israel',a:[]},
  {id:'JPN',t:'o',n:'Japão',r:'Ásia',c:[35.7,139.7],g:'Japan',a:['Japan','Japón','Nippon']},
  {id:'JOR',t:'o',n:'Jordânia',r:'Oriente Médio',c:[31.2,36.5],g:'Jordan',a:['Jordan','Jordania']},
  {id:'KWT',t:'o',n:'Kuwait',r:'Oriente Médio',c:[29.3,47.5],g:'Kuwait',a:['Kuweit','Cuaite','Cuwait']},
  {id:'KGZ',t:'o',n:'Quirguistão',r:'Ásia',c:[41.2,74.8],g:'Kyrgyzstan',a:['Kyrgyzstan','Quirguizistão','Quirguízia','Kirguistán','Kirguizistão']},
  {id:'LAO',t:'o',n:'Laos',r:'Ásia',c:[19.9,102.5],g:'Laos',a:['Lao','República Democrática Popular do Laos']},
  {id:'LBN',t:'o',n:'Líbano',r:'Oriente Médio',c:[33.85,35.86],g:'Lebanon',a:['Lebanon','Liban']},
  {id:'MYS',t:'o',n:'Malásia',r:'Ásia',c:[3.1,101.7],g:'Malaysia',a:['Malaysia','Malasia']},
  {id:'MDV',t:'o',n:'Maldivas',r:'Ásia',c:[3.2,73.2],a:['Maldives']},
  {id:'MNG',t:'o',n:'Mongólia',r:'Ásia',c:[46.9,103.8],g:'Mongolia',a:['Mongolia']},
  {id:'MMR',t:'o',n:'Mianmar',r:'Ásia',c:[21.9,95.96],g:'Myanmar',a:['Myanmar','Birmânia','Burma','Mianmá','Myanma','Birmania']},
  {id:'NPL',t:'o',n:'Nepal',r:'Ásia',c:[28.4,84.1],g:'Nepal',a:[]},
  {id:'OMN',t:'o',n:'Omã',r:'Oriente Médio',c:[21.5,55.9],g:'Oman',a:['Oman','Omán']},
  {id:'PAK',t:'o',n:'Paquistão',r:'Ásia',c:[33.7,73.1],g:'Pakistan',a:['Pakistan','Pakistán']},
  {id:'QAT',t:'o',n:'Qatar',r:'Oriente Médio',c:[25.35,51.2],g:'Qatar',a:['Catar']},
  {id:'SGP',t:'o',n:'Singapura',r:'Ásia',c:[1.35,103.8],a:['Singapore','Singapur','Cingapura']},
  {id:'LKA',t:'o',n:'Sri Lanka',r:'Ásia',c:[7.9,80.8],g:'Sri Lanka',a:['Ceilão','Ceylon']},
  {id:'SYR',t:'o',n:'Síria',r:'Oriente Médio',c:[33.5,36.3],g:'Syria',a:['Syria','Siria','República Árabe Síria']},
  {id:'TJK',t:'o',n:'Tajiquistão',r:'Ásia',c:[38.9,71.3],g:'Tajikistan',a:['Tajikistan','Tayikistán','Tadjiquistão']},
  {id:'THA',t:'o',n:'Tailândia',r:'Ásia',c:[15.9,100.99],g:'Thailand',a:['Thailand','Tailandia','Sião','Siam']},
  {id:'TLS',t:'o',n:'Timor-Leste',r:'Ásia',c:[-8.9,125.7],g:'East Timor',a:['East Timor','Timor Leste','Timor Oriental']},
  {id:'TKM',t:'o',n:'Turcomenistão',r:'Ásia',c:[38.97,59.6],g:'Turkmenistan',a:['Turkmenistan','Turquemenistão','Turkmenistán']},
  {id:'TUR',t:'o',n:'Turquia',r:'Europa/Ásia',c:[39.9,32.9],g:'Turkey',a:['Turkey','Türkiye','Turkiye','Turquía']},
  {id:'UZB',t:'o',n:'Uzbequistão',r:'Ásia',c:[41.4,64.6],g:'Uzbekistan',a:['Uzbekistan','Uzbekistán','Usbequistão']},
  {id:'VNM',t:'o',n:'Vietnã',r:'Ásia',c:[21,105.8],g:'Vietnam',a:['Vietnam','Vietname','Viet Nam']},
  {id:'PSE',t:'p',n:'Palestina',r:'Oriente Médio',c:[31.95,35.2],a:['Palestine','Estado da Palestina','Territórios Palestinos','Cisjordânia e Gaza']},
  {id:'ALB',t:'o',n:'Albânia',r:'Europa',c:[41.15,20.2],g:'Albania',a:['Albania']},
  {id:'DEU',t:'o',n:'Alemanha',r:'Europa',c:[52.5,13.4],g:'Germany',a:['Germany','Deutschland','Alemania','Allemagne','República Federal da Alemanha']},
  {id:'AND',t:'o',n:'Andorra',r:'Europa',c:[42.5,1.5],a:[]},
  {id:'AUT',t:'o',n:'Áustria',r:'Europa',c:[48.2,16.4],g:'Austria',a:['Austria','Österreich']},
  {id:'BLR',t:'o',n:'Bielorrússia',r:'Europa',c:[53.7,27.95],g:'Belarus',a:['Belarus','Belarús','Bielorrusia','Bielorussia','Bielo-Rússia']},
  {id:'BEL',t:'o',n:'Bélgica',r:'Europa',c:[50.8,4.4],g:'Belgium',a:['Belgium','Belgique']},
  {id:'BIH',t:'o',n:'Bósnia e Herzegovina',r:'Europa',c:[43.9,17.7],g:'Bosnia and Herzegovina',a:['Bosnia and Herzegovina','Bósnia-Herzegovina','Bosnia','Bósnia','Bosnia y Herzegovina']},
  {id:'BGR',t:'o',n:'Bulgária',r:'Europa',c:[42.7,23.3],g:'Bulgaria',a:['Bulgaria']},
  {id:'HRV',t:'o',n:'Croácia',r:'Europa',c:[45.1,15.2],g:'Croatia',a:['Croatia','Croacia']},
  {id:'CZE',t:'o',n:'República Tcheca',r:'Europa',c:[50.1,14.4],g:'Czech Republic',a:['Tchéquia','Chéquia','Czechia','Czech Republic','Rep. Tcheca','República Checa','Tcheca','Checa']},
  {id:'DNK',t:'o',n:'Dinamarca',r:'Europa',c:[56,10],g:'Denmark',a:['Denmark','Danmark']},
  {id:'SVK',t:'o',n:'Eslováquia',r:'Europa',c:[48.7,19.7],g:'Slovakia',a:['Slovakia','Eslovaquia']},
  {id:'SVN',t:'o',n:'Eslovênia',r:'Europa',c:[46.15,14.99],g:'Slovenia',a:['Slovenia','Eslovenia','Eslovénia']},
  {id:'ESP',t:'o',n:'Espanha',r:'Europa',c:[40.4,-3.7],g:'Spain',a:['Spain','España','Espagne']},
  {id:'EST',t:'o',n:'Estônia',r:'Europa',c:[58.6,25],g:'Estonia',a:['Estonia','Estónia']},
  {id:'FIN',t:'o',n:'Finlândia',r:'Europa',c:[61.9,25.7],g:'Finland',a:['Finland','Finlandia','Suomi']},
  {id:'FRA',t:'o',n:'França',r:'Europa',c:[46.2,2.2],g:'France',a:['France','Francia']},
  {id:'GRC',t:'o',n:'Grécia',r:'Europa',c:[37.9,23.7],g:'Greece',a:['Greece','Grecia','Hellas']},
  {id:'HUN',t:'o',n:'Hungria',r:'Europa',c:[47.2,19.5],g:'Hungary',a:['Hungary','Hungría']},
  {id:'ISL',t:'o',n:'Islândia',r:'Europa',c:[64.96,-19],g:'Iceland',a:['Iceland','Islandia']},
  {id:'IRL',t:'o',n:'Irlanda',r:'Europa',c:[53.3,-6.3],g:'Ireland',a:['Ireland','Éire','Eire','República da Irlanda']},
  {id:'ITA',t:'o',n:'Itália',r:'Europa',c:[41.9,12.5],g:'Italy',a:['Italy','Italia']},
  {id:'LVA',t:'o',n:'Letônia',r:'Europa',c:[56.9,24.6],g:'Latvia',a:['Latvia','Letonia','Letónia']},
  {id:'LIE',t:'o',n:'Liechtenstein',r:'Europa',c:[47.2,9.55],a:['Listenstaine']},
  {id:'LTU',t:'o',n:'Lituânia',r:'Europa',c:[55.2,23.9],g:'Lithuania',a:['Lithuania','Lituania']},
  {id:'LUX',t:'o',n:'Luxemburgo',r:'Europa',c:[49.8,6.1],g:'Luxembourg',a:['Luxembourg']},
  {id:'MLT',t:'o',n:'Malta',r:'Europa',c:[35.9,14.4],g:'Malta',a:[]},
  {id:'MDA',t:'o',n:'Moldávia',r:'Europa',c:[47.4,28.4],g:'Moldova',a:['Moldova','Moldavia']},
  {id:'MCO',t:'o',n:'Mônaco',r:'Europa',c:[43.75,7.4],a:['Monaco','Mónaco']},
  {id:'MNE',t:'o',n:'Montenegro',r:'Europa',c:[42.7,19.4],g:'Montenegro',a:[]},
  {id:'NLD',t:'o',n:'Países Baixos',r:'Europa',c:[52.4,4.9],g:'Netherlands',a:['Holanda','Netherlands','The Netherlands','Nederland','Reino dos Países Baixos','Holland']},
  {id:'MKD',t:'o',n:'Macedônia do Norte',r:'Europa',c:[41.6,21.7],g:'Macedonia',a:['Norte da Macedônia','North Macedonia','Macedonia','Macedônia','Macedónia do Norte','Macedonia del Norte']},
  {id:'NOR',t:'o',n:'Noruega',r:'Europa',c:[59.9,10.7],g:'Norway',a:['Norway','Norge']},
  {id:'POL',t:'o',n:'Polônia',r:'Europa',c:[52.2,21],g:'Poland',a:['Poland','Polonia','Polska']},
  {id:'PRT',t:'o',n:'Portugal',r:'Europa',c:[38.7,-9.1],g:'Portugal',a:[]},
  {id:'GBR',t:'o',n:'Reino Unido',r:'Europa',c:[51.5,-0.1],g:'United Kingdom',a:['United Kingdom','UK','Grã-Bretanha','Great Britain','Reino Unido da Grã-Bretanha','GB']},
  {id:'ROU',t:'o',n:'Romênia',r:'Europa',c:[45.9,24.97],g:'Romania',a:['Romania','Rumanía','Roménia']},
  {id:'RUS',t:'o',n:'Rússia',r:'Europa/Ásia',c:[55.8,37.6],g:'Russia',a:['Russia','Rusia','Federação Russa','Russian Federation']},
  {id:'SMR',t:'o',n:'São Marino',r:'Europa',c:[43.9,12.46],a:['San Marino','São Marinho']},
  {id:'SRB',t:'o',n:'Sérvia',r:'Europa',c:[44,21],g:'Republic of Serbia',a:['Serbia','Servia','República da Sérvia']},
  {id:'SWE',t:'o',n:'Suécia',r:'Europa',c:[59.3,18.1],g:'Sweden',a:['Sweden','Suecia','Sverige']},
  {id:'CHE',t:'o',n:'Suíça',r:'Europa',c:[46.8,8.2],g:'Switzerland',a:['Switzerland','Suiza','Suisse','Schweiz']},
  {id:'UKR',t:'o',n:'Ucrânia',r:'Europa',c:[50.5,30.5],g:'Ukraine',a:['Ukraine','Ucrania']},
  {id:'VAT',t:'p',n:'Vaticano',r:'Europa',c:[41.9,12.45],a:['Vatican','Santa Sé','Cidade do Vaticano','Vatican City','Holy See','Estado da Cidade do Vaticano']},
  {id:'AUS',t:'o',n:'Austrália',r:'Oceania',c:[-35.3,149.1],g:'Australia',a:['Australia']},
  {id:'FJI',t:'o',n:'Fiji',r:'Oceania',c:[-17.7,178.1],g:'Fiji',a:['Fidji','Figi']},
  {id:'KIR',t:'o',n:'Kiribati',r:'Oceania',c:[1.87,-157.36],a:['Quiribati']},
  {id:'MHL',t:'o',n:'Ilhas Marshall',r:'Oceania',c:[7.1,171.2],a:['Marshall Islands']},
  {id:'FSM',t:'o',n:'Micronésia',r:'Oceania',c:[6.9,158.2],a:['Estados Federados da Micronésia','Federated States of Micronesia','Micronesia','FSM']},
  {id:'NRU',t:'o',n:'Nauru',r:'Oceania',c:[-0.5,166.9],a:[]},
  {id:'NZL',t:'o',n:'Nova Zelândia',r:'Oceania',c:[-41.3,174.8],g:'New Zealand',a:['New Zealand','Nueva Zelanda','Aotearoa']},
  {id:'PLW',t:'o',n:'Palau',r:'Oceania',c:[7.5,134.6],a:['Palaos']},
  {id:'PNG',t:'o',n:'Papua-Nova Guiné',r:'Oceania',c:[-6.3,143.96],g:'Papua New Guinea',a:['Papua Nova Guiné','Papua New Guinea','Papúa Nueva Guinea']},
  {id:'WSM',t:'o',n:'Samoa',r:'Oceania',c:[-13.76,-172.1],a:['Samoa Ocidental','Western Samoa']},
  {id:'SLB',t:'o',n:'Ilhas Salomão',r:'Oceania',c:[-9.6,160.2],g:'Solomon Islands',a:['Solomon Islands','Salomão']},
  {id:'TON',t:'o',n:'Tonga',r:'Oceania',c:[-21.2,-175.2],a:[]},
  {id:'TUV',t:'o',n:'Tuvalu',r:'Oceania',c:[-7.1,177.6],a:[]},
  {id:'VUT',t:'o',n:'Vanuatu',r:'Oceania',c:[-15.4,166.96],g:'Vanuatu',a:[]},
  {id:'ENG',t:'x',n:'Inglaterra',r:'Europa',c:[51.5,-0.1],a:['England']},
  {id:'SCT',t:'x',n:'Escócia',r:'Europa',c:[56.5,-4.2],a:['Scotland','Escocia']},
  {id:'WLS',t:'x',n:'País de Gales',r:'Europa',c:[52.1,-3.8],a:['Wales','Gales']},
  {id:'NIR',t:'x',n:'Irlanda do Norte',r:'Europa',c:[54.6,-6.7],a:['Northern Ireland']},
  {id:'XKX',t:'x',n:'Kosovo',r:'Europa',c:[42.6,20.9],a:['Kósovo']},
  {id:'TWN',t:'x',n:'Taiwan',r:'Ásia',c:[23.7,121],g:'Taiwan',a:['Formosa','República da China','Taipé Chinesa','Chinese Taipei','Taiwán']},
  {id:'GRL',t:'x',n:'Groenlândia',r:'América do Norte',c:[71.7,-42.6],g:'Greenland',a:['Greenland','Grønland','Groenlandia']},
  {id:'ABW',t:'x',n:'Aruba',r:'Caribe',c:[12.5,-69.97],a:[]},
  {id:'CUW',t:'x',n:'Curaçao',r:'Caribe',c:[12.17,-69],a:['Curacao','Curazao']},
  {id:'GLP',t:'x',n:'Guadalupe',r:'Caribe',c:[16.25,-61.55],a:['Guadeloupe']},
  {id:'PYF',t:'x',n:'Polinésia Francesa',r:'Oceania',c:[-17.7,-149.4],a:['French Polynesia','Polinésia','Tahiti','Polynésie française']},
  {id:'PRI',t:'x',n:'Porto Rico',r:'Caribe',c:[18.2,-66.5],g:'Puerto Rico',a:['Puerto Rico']},
  {id:'VIR',t:'x',n:'Ilhas Virgens Americanas',r:'Caribe',c:[18.3,-64.9],a:['Ilhas Virgens','Ilhas Virgens dos EUA','US Virgin Islands','Ilhas Virgens (EUA)','Virgin Islands']},
  {id:'VGB',t:'x',n:'Ilhas Virgens Britânicas',r:'Caribe',c:[18.4,-64.6],a:['British Virgin Islands','Ilhas Virgens do Reino Unido']},
  {id:'HKG',t:'x',n:'Hong Kong',r:'Ásia',c:[22.3,114.2],a:[]},
  {id:'MAC',t:'x',n:'Macau',r:'Ásia',c:[22.2,113.55],a:['Macao']},
  {id:'GUF',t:'x',n:'Guiana Francesa',r:'América do Sul',c:[3.9,-53.1],a:['French Guiana','Guyane']},
  {id:'MTQ',t:'x',n:'Martinica',r:'Caribe',c:[14.64,-61],a:['Martinique']},
  {id:'NCL',t:'x',n:'Nova Caledônia',r:'Oceania',c:[-21.3,165.5],a:['New Caledonia','Nouvelle-Calédonie']},
  {id:'CYM',t:'x',n:'Ilhas Cayman',r:'Caribe',c:[19.3,-81.25],a:['Cayman Islands','Ilhas Caimão']},
  {id:'BMU',t:'x',n:'Bermudas',r:'América do Norte',c:[32.3,-64.75],a:['Bermuda']},
  {id:'GIB',t:'x',n:'Gibraltar',r:'Europa',c:[36.14,-5.35],a:[]},
  {id:'FRO',t:'x',n:'Ilhas Faroé',r:'Europa',c:[61.9,-6.9],a:['Faroe Islands','Ilhas Féroe','Ilhas Faroe']},
  {id:'ESH',t:'x',n:'Saara Ocidental',r:'África do Norte',c:[24.2,-12.9],a:['Western Sahara','Sahara Ocidental']},
  {id:'FLK',t:'x',n:'Ilhas Malvinas',r:'América do Sul',c:[-51.8,-59.5],a:['Falkland Islands','Ilhas Falkland','Malvinas']},
  {id:'SOL',t:'x',n:'Somalilândia',r:'África',c:[9.6,46],a:['Somaliland']},
  {id:'REU',t:'x',n:'Reunião',r:'África',c:[-21.1,55.5],a:['Réunion','Reunion']},
  {id:'GUM',t:'x',n:'Guam',r:'Oceania',c:[13.4,144.8],a:[]},
  {id:'ASM',t:'x',n:'Samoa Americana',r:'Oceania',c:[-14.3,-170.7],a:['American Samoa']},
  {id:'IMN',t:'x',n:'Ilha de Man',r:'Europa',c:[54.2,-4.5],a:['Isle of Man']},
  {id:'JEY',t:'x',n:'Jersey',r:'Europa',c:[49.2,-2.1],a:[]},
  {id:'GGY',t:'x',n:'Guernsey',r:'Europa',c:[49.45,-2.58],a:[]},
  {id:'COK',t:'x',n:'Ilhas Cook',r:'Oceania',c:[-21.2,-159.8],a:['Cook Islands']},
  {id:'NIU',t:'x',n:'Niue',r:'Oceania',c:[-19.05,-169.9],a:[]},
  ];

  const SPECIAL = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ı': 'i' };
  // Mesma normalização do check-paises.js: minúscula, sem acento, só letras/números/espaço.
  function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    for (const k in SPECIAL) s = s.split(k).join(SPECIAL[k]);
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' e ');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // tira os asteriscos de nota do Notion ("Escócia**") e espaços
  function limpar(s) { return String(s == null ? '' : s).replace(/\*+\s*$/, '').trim(); }

  const INDICE = new Map();
  const IGN = new Set(IGNORAR.map(norm));
  LISTA.forEach(function (p) {
    [p.n].concat(p.a || []).forEach(function (nome) { INDICE.set(norm(nome), p); });
  });

  // Devolve o cadastro do país (ou null se for vazio/ignorado/desconhecido)
  function resolver(nome) {
    var k = norm(limpar(nome));
    if (!k || IGN.has(k)) return null;
    return INDICE.get(k) || null;
  }
  function ignorado(nome) { var k = norm(limpar(nome)); return !k || IGN.has(k); }
  function coord(nome) { var p = resolver(nome); return p ? p.c : null; }
  function geo(nome) { var p = resolver(nome); return p && p.g ? p.g : null; }
  function regiao(nome) { var p = resolver(nome); return p ? p.r : null; }

  return { lista: LISTA, ignorar: IGNORAR, norm: norm, limpar: limpar, resolver: resolver, ignorado: ignorado, coord: coord, geo: geo, regiao: regiao };
});
