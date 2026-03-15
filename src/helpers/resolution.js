import { VTA_GROUPS } from "../constants/vta.js";
import { isCaduque } from "./status.js";
import { localDateStr } from "./date.js";

function resolveVTA(vtaCode, date, dailyPlan, team) {
  if (!vtaCode || !vtaCode.startsWith("vta-")) return null;
  var group = VTA_GROUPS[vtaCode];
  if (!group) return vtaCode;
  if (dailyPlan) {
    var planDay = dailyPlan[date] || {};

    var manuallyAssigned = [];
    Object.values(planDay).forEach(function(car) {
      if (car && car.memberVtaCodes) {
        Object.keys(car.memberVtaCodes).forEach(function(mid) {
          if (car.memberVtaCodes[mid] === vtaCode) {
            var m = team.find(function(t) { return t.id === parseInt(mid); });
            if (m) manuallyAssigned.push(m.name);
          }
        });
      }
    });
    if (manuallyAssigned.length === 1) return manuallyAssigned[0];
    if (manuallyAssigned.length > 1) return { ambiguous: true, candidates: manuallyAssigned, vtaCode: vtaCode };

    var presentIds = [];
    Object.values(planDay).forEach(function(car) {
      if (car && car.members) presentIds = presentIds.concat(car.members);
    });
    var presentNames = presentIds.map(function(id) {
      var m = team.find(function(t) { return t.id === id; });
      return m ? m.name : null;
    }).filter(Boolean);
    var inGroup = group.filter(function(name) { return presentNames.indexOf(name) >= 0; });
    if (inGroup.length === 1) return inGroup[0];
    if (inGroup.length > 1) return { ambiguous: true, candidates: inGroup, vtaCode: vtaCode };
  }
  return group[0];
}

function getPendingResolutions(contracts, team, dailyPlan, cars) {
  var today = new Date();
  var todayStr = localDateStr(today);
  var dayOfWeek = today.getDay();

  var dates = [todayStr];
  if (dayOfWeek === 1) {
    var fri = new Date(today); fri.setDate(today.getDate() - 3);
    var sat = new Date(today); sat.setDate(today.getDate() - 2);
    var sun = new Date(today); sun.setDate(today.getDate() - 1);
    dates.push(localDateStr(fri), localDateStr(sat), localDateStr(sun));
  } else if (dayOfWeek === 0) {
    var fri2 = new Date(today); fri2.setDate(today.getDate() - 2);
    var sat2 = new Date(today); sat2.setDate(today.getDate() - 1);
    dates.push(localDateStr(fri2), localDateStr(sat2));
  } else {
    var yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    dates.push(localDateStr(yesterday));
  }

  var lentMap = {};
  team.forEach(function(m) {
    (m.lentCodes || []).forEach(function(lc) {
      var borrower = team.find(function(t) { return t.id === lc.borrowerId; });
      if (borrower) lentMap[lc.code] = { lender: m, borrower: borrower };
    });
  });

  var pending = [];

  dates.forEach(function(dateStr) {
    var dayPlan = (dailyPlan && dailyPlan[dateStr]) || {};

    var memberCommunes = {};
    cars.forEach(function(car) {
      var plan = dayPlan[car.id];
      if (!plan) return;
      var mc = plan.memberCommunes || {};
      Object.keys(mc).forEach(function(mid) {
        var commune = (mc[mid] || '').trim().toLowerCase();
        if (!commune) return;
        var id = parseInt(mid);
        if (!memberCommunes[id]) memberCommunes[id] = new Set();
        memberCommunes[id].add(commune);
      });
    });
    var presentIds = new Set(Object.keys(memberCommunes).map(Number));

    function communeMatch(memberId, ville) {
      if (!ville) return false;
      var communes = memberCommunes[memberId] || new Set();
      var v = ville.trim().toLowerCase();
      for (var c of communes) { if (c === v || c.indexOf(v) >= 0 || v.indexOf(c) >= 0) return true; }
      return false;
    }

    var dayC = contracts.filter(function(c) { return c.date === dateStr; });

    dayC.forEach(function(contract) {
      if (isCaduque(contract) && !contract.vtaCode) return;
      var ville = (contract.ville || '').trim();

      if (contract.vstLogin && lentMap[contract.vstLogin]) {
        var lent = lentMap[contract.vstLogin];
        var lenderP = presentIds.has(lent.lender.id);
        var borrowerP = presentIds.has(lent.borrower.id);

        if (!lenderP && !borrowerP) return;

        if (lenderP && !borrowerP) {
          pending.push({ type: 'auto', contract: contract, autoTo: lent.lender, candidates: [lent.lender, lent.borrower], reason: lent.borrower.name + ' absent' });
          return;
        }
        if (!lenderP && borrowerP) {
          pending.push({ type: 'auto', contract: contract, autoTo: lent.borrower, candidates: [lent.lender, lent.borrower], reason: lent.lender.name + ' absent' });
          return;
        }
        var lenderMatch = communeMatch(lent.lender.id, ville);
        var borrowerMatch = communeMatch(lent.borrower.id, ville);
        if (lenderMatch && !borrowerMatch) return;
        if (borrowerMatch && !lenderMatch) {
          pending.push({ type: 'auto', contract: contract, autoTo: lent.borrower, candidates: [lent.lender, lent.borrower], reason: 'commune ' + ville });
          return;
        }
        pending.push({ type: 'manual', contract: contract, candidates: [lent.lender, lent.borrower], reason: 'même commune' });
      }

      if (contract.vtaCode && !contract.vtaResolved) {
        var manuallyAssigned = [];
        cars.forEach(function(car) {
          var carPlan = dayPlan[car.id];
          if (carPlan && carPlan.memberVtaCodes) {
            Object.keys(carPlan.memberVtaCodes).forEach(function(mid) {
              if (carPlan.memberVtaCodes[mid] === contract.vtaCode) {
                var m = team.find(function(t) { return t.id === parseInt(mid); });
                if (m) manuallyAssigned.push(m);
              }
            });
          }
        });
        if (manuallyAssigned.length === 1) {
          pending.push({ type: 'auto', contract: contract, autoTo: manuallyAssigned[0], candidates: manuallyAssigned, reason: 'code VTA assigné' });
          return;
        }
        if (manuallyAssigned.length > 1) {
          var maVille = ville ? manuallyAssigned.filter(function(m) { return communeMatch(m.id, ville); }) : [];
          if (maVille.length === 1) {
            pending.push({ type: 'auto', contract: contract, autoTo: maVille[0], candidates: manuallyAssigned, reason: 'commune ' + ville });
          } else {
            pending.push({ type: 'manual', contract: contract, candidates: maVille.length > 1 ? maVille : manuallyAssigned, reason: maVille.length > 1 ? 'même commune' : 'commune inconnue' });
          }
          return;
        }

        var group = VTA_GROUPS[contract.vtaCode];
        if (!group || group.length <= 1) return;

        var candidates = group.map(function(name) { return team.find(function(m) { return m.name === name; }); })
          .filter(Boolean).filter(function(m) { return presentIds.has(m.id); });
        if (candidates.length === 0) {
          candidates = group.map(function(name) { return team.find(function(m) { return m.name === name; }); }).filter(Boolean);
          if (candidates.length <= 1) return;
          pending.push({ type: 'manual', contract: contract, candidates: candidates, reason: 'plan absent' });
          return;
        }
        if (candidates.length === 1) {
          pending.push({ type: 'auto', contract: contract, autoTo: candidates[0], candidates: candidates, reason: 'seul présent' });
          return;
        }
        var inVille = ville ? candidates.filter(function(m) { return communeMatch(m.id, ville); }) : [];
        if (inVille.length === 1) {
          pending.push({ type: 'auto', contract: contract, autoTo: inVille[0], candidates: candidates, reason: 'commune ' + ville });
        } else {
          pending.push({ type: 'manual', contract: contract, candidates: inVille.length > 1 ? inVille : candidates, reason: inVille.length > 1 ? 'même commune' : 'commune inconnue' });
        }
      }
    });
  });

  return pending;
}

export { resolveVTA, getPendingResolutions };
