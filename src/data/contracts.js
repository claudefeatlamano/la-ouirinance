import carnetData from "../data.json";
import bouyguesData from "../data_bouygues.json";
import { VTA_GROUPS } from "../constants/vta.js";
import { DEMO_TEAM } from "./team.js";
import { makeDemoContracts, makeVTAContracts } from "./demo-contracts.js";

var PROXAD_MINUTES = [8*60+45, 10*60+45, 12*60+45, 14*60+45, 16*60+45, 18*60+45, 20*60+45, 22*60+45];

function proxadRunsBetween(fromMs, toMs) {
  var count = 0;
  var d = new Date(fromMs);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= toMs) {
    for (var i = 0; i < PROXAD_MINUTES.length; i++) {
      var runMs = d.getTime() + PROXAD_MINUTES[i] * 60000;
      if (runMs > fromMs && runMs <= toMs) count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function carnetToContracts(rows, scrapedAt) {
  var scrapedAtMs = scrapedAt ? new Date(scrapedAt).getTime() : Date.now();
  var vstMap = {};
  DEMO_TEAM.forEach(function(m) {
    var parts = m.name.split(' ');
    var code = 'vst-' + parts[0][0].toLowerCase() + parts[parts.length - 1].toLowerCase();
    vstMap[code] = m.name;
    // Also register explicitly assigned vstCodes
    (m.vstCodes || []).forEach(function(c) { vstMap[c] = m.name; });
  });
  // Manual overrides where system login doesn't match the naming pattern (kept as safety net)
  Object.assign(vstMap, {
    'vst-lmertz':              'Leo Merde',
    'vst-hnouar':              'Abdel Nouar',
    'vst-dbelkessa':           'Lyna Belkessa',
    'vst-adahmani':            'Hamid Atroune',
    'vst-bouchrif':            'Abdellah Cheikh',
    'vst-dclavereuil':         'Djany Legrand',
    'vst-dpouilly':            'Nora Wahid',
    'vst-droode':              'Paul Geriltault',
    'vst-eluc':                'William Goujon',
    'vst-kelahmadi':           'Ouissem Ouirini',
  });

  function cleanBox(box) {
    if (!box) return '';
    if (box.indexOf('ULTRA_LIGHT') === 0) return 'ULTRA_LIGHT';
    if (box.indexOf('ULTRA') === 0) return 'ULTRA';
    if (box.indexOf('POP') === 0) return 'POP';
    return box;
  }

  var statusMap = {
    'connexion ok': 'Branché',
    'connexion ok vrf': 'Branché',
    'résilié': 'Résilié',
    'vente validée j+7': 'RIB MANQUANT',
    'vente abandonnée': 'RIB MANQUANT',
    'inscription ok /postprod': 'Postprod',
  };

  return rows.map(function(r) {
    var login = (r.login || '').trim();
    var dt = (r.date_inscription || '').split(' ');
    var date = dt[0] || '';
    var heure = dt[1] ? dt[1].substring(0, 5) : '';
    var rawEtat = (r.etat_commande || '').trim().toLowerCase();
    var status = statusMap[rawEtat] || '';
    if (!status) {
      if (!rawEtat || rawEtat === 'vente validée') {
        var inscTime = new Date(r.date_inscription).getTime();
        status = (proxadRunsBetween(inscTime, scrapedAtMs) >= 2) ? 'RIB MANQUANT' : 'Nouveau';
      } else if (rawEtat === 'inscription ok') {
        var rdvInfo = (r.info_rdv_sync || '').trim();
        status = rdvInfo ? 'RDV pris' : 'En attente RDV';
      } else {
        status = r.etat_commande || '';
      }
    }
    var box = cleanBox(r.box || '');
    var ville = (r.ville || '').trim();

    if (login.startsWith('vta-')) {
      var group = VTA_GROUPS[login];
      var commercial = group ? group[0] : login;
      return {
        id: 'vta-' + r.id_abo,
        commercial: commercial,
        vtaCode: login,
        vtaResolved: false,
        date: date,
        heure: heure,
        ville: ville,
        rue: r.adresse || '',
        operator: 'Free',
        type: 'Fibre',
        box: box,
        status: status,
      };
    } else {
      return {
        id: 'f-' + r.id_abo,
        commercial: vstMap[login] || login,
        vstLogin: login,
        date: date,
        heure: heure,
        ville: ville,
        rue: r.adresse || '',
        operator: 'Free',
        type: 'Fibre',
        box: box,
        status: status,
      };
    }
  });
}

var BOUYGUES_VENDEUR_MAP = {
  'CHEIKH ABDELLAH':      'Abdellah Cheikh',
  'ATF ALI':              'Ali Atf',
  'KOCAK ILHAN':          'Ilhan Kocak',
  'OUIRINI INES':         'Ines Ouirini',
  'OUIRINI OUISSEM':      'Ouissem Ouirini',
  'NOUAR LAKHDAR':        'Abdel Nouar',
  'MERTZ LEO':            'Leo Merde',
  'GUERITAULT PAUL':      'Paul Geriltault',
  'BELKESSA DANIA NAHIDA':'Lyna Belkessa',
  'LEGRAND DJANY':        'Djany Legrand',
  'LARECH MOHAMED':       'Mohamed Mehdi Larech',
  'LEGRAND STEPHANE':     'Stephane Legrand',
  'ATROUNE HAMID':        'Hamid Atroune',
  'EL JAZOULI ADAM':      'Adam El Jazouli',
  'PEREIRA SANDRA':       'Sandra Pereira',
  'MOIZE VICTOR':         'Victor Moize',
  'MENDOUSSE MELODIE':    'Melodie Mendousse',
  'MBENGUE PAPE OMAR':    'Omar Mbengue',
  'WAHID NORA':           'Nora Wahid',
  'SHEHU PROSPER':        'Prosper',
};

function bouyguesCarnetToContracts(rows) {
  var bouyguesStatusMap = {
    'active': 'Branché',
    'vente validée': 'RDV pris',
    'saisie': 'Call manquant',
  };

  function mapBouyguesStatus(raw) {
    var lower = (raw || '').trim().toLowerCase();
    if (bouyguesStatusMap[lower]) return bouyguesStatusMap[lower];
    if (lower.indexOf('ko') === 0) return 'Annulé';
    if (lower.indexOf('standby') === 0) return 'Call manquant';
    return 'Annulé';
  }

  function extractBox(produit) {
    if (!produit) return '';
    var p = produit.toLowerCase();
    if (p.indexOf('ultym') !== -1) return 'ULTYM';
    if (p.indexOf('must') !== -1) return 'MUST';
    if (p.indexOf('fit') !== -1) return 'FIT';
    return produit;
  }

  function toTitleCase(str) {
    return (str || '').toLowerCase().replace(/(?:^|\s)\S/g, function(c) { return c.toUpperCase(); });
  }

  function convertDate(ddmmyyyy) {
    if (!ddmmyyyy) return { date: '', heure: '' };
    var parts = ddmmyyyy.split(' ');
    var datePart = parts[0] || '';
    var timePart = parts[1] || '';
    var d = datePart.split('/');
    if (d.length === 3) {
      return { date: d[2] + '-' + d[1] + '-' + d[0], heure: timePart.substring(0, 5) };
    }
    return { date: datePart, heure: timePart.substring(0, 5) };
  }

  return rows.map(function(r) {
    var dt = convertDate(r.date_inscription);
    return {
      id: 'byg-' + r.num_contrat,
      commercial: BOUYGUES_VENDEUR_MAP[(r.vendeur || '').trim().toUpperCase()] || toTitleCase(r.vendeur),
      date: dt.date,
      heure: dt.heure,
      ville: (r.ville || '').trim(),
      rue: (r.adresse || r.rue || '').trim(),
      cp: (r.cp || '').trim(),
      operator: 'Bouygues',
      type: 'Fibre',
      box: extractBox(r.produit),
      status: mapBouyguesStatus(r.etat_commande),
      byLogin: (r.login || '').trim(),
    };
  });
}

var carnetRows = carnetData.rows || carnetData;
var scrapedAt = carnetData.scraped_at || null;
var bouyguesRows = bouyguesData.rows || [];
var freeContracts = carnetRows.length > 0 ? carnetToContracts(carnetRows, scrapedAt) : makeDemoContracts().concat(makeVTAContracts());
var bouyguesContracts = bouyguesRows.length > 0 ? bouyguesCarnetToContracts(bouyguesRows) : [];
const DEMO_CONTRACTS = freeContracts.concat(bouyguesContracts);

export { DEMO_CONTRACTS, carnetToContracts, bouyguesCarnetToContracts };
