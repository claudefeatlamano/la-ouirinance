import React, { useState, useMemo } from "react";
import { Card, Btn, Inp, Badge, StatCard } from "./ui.jsx";
import { statusColor, isCaduque } from "../helpers/status.js";
import { ROLE_COLORS } from "../constants/roles.js";

function ObjectifsTab({ team, contracts, objectives, saveObjectives }) {
  function getWeekKey(date) {
    var d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  }
  function getWeekLabel(weekKey) {
    var start = new Date(weekKey + "T12:00:00");
    var end = new Date(start); end.setDate(end.getDate() + 6);
    var fmt = function(d) { return d.toLocaleDateString("fr-FR", { day:"numeric", month:"short" }); };
    return fmt(start) + " – " + fmt(end);
  }
  function getWeekDates(weekKey) {
    var start = new Date(weekKey + "T12:00:00"), dates = [];
    for (var i = 0; i < 7; i++) { var d = new Date(start); d.setDate(d.getDate()+i); dates.push(d.toISOString().split("T")[0]); }
    return dates;
  }

  var today = new Date();
  var currentWeek = getWeekKey(today.toISOString().split("T")[0]);
  var weeksFromContracts = Array.from(new Set(contracts.map(function(c){ return getWeekKey(c.date); })));
  var futureWeeks = [];
  for (var i = 0; i <= 4; i++) { var d2 = new Date(today); d2.setDate(d2.getDate()+i*7); futureWeeks.push(getWeekKey(d2.toISOString().split("T")[0])); }
  var allWeeks = Array.from(new Set(weeksFromContracts.concat(futureWeeks))).sort(function(a,b){ return b.localeCompare(a); });

  var [selectedWeek, setSelectedWeek] = useState(currentWeek);
  var [editMode, setEditMode] = useState(false);
  var [draft, setDraft] = useState({});

  var weekIdx = allWeeks.indexOf(selectedWeek);
  var activeTeam = team.filter(function(m){ return m.active; });
  var weekDates = getWeekDates(selectedWeek);
  var weekContracts = contracts.filter(function(c){ return weekDates.indexOf(c.date) >= 0 && !isCaduque(c); });
  var weekObjectives = objectives[selectedWeek] || {};
  var isPast = selectedWeek < currentWeek;
  var isCurrent = selectedWeek === currentWeek;

  var realise = {};
  activeTeam.forEach(function(m){ realise[m.name] = 0; });
  weekContracts.forEach(function(c){ if (realise[c.commercial] !== undefined) realise[c.commercial]++; });

  var totalObjectif = activeTeam.reduce(function(s,m){ return s + (weekObjectives[m.name]||0); }, 0);
  var totalRealise  = activeTeam.reduce(function(s,m){ return s + (realise[m.name]||0); }, 0);
  var nbAtteints = activeTeam.filter(function(m){ var obj=weekObjectives[m.name]||0; return obj>0 && (realise[m.name]||0)>=obj; }).length;
  var nbAvecObj  = activeTeam.filter(function(m){ return (weekObjectives[m.name]||0)>0; }).length;

  var pct = totalObjectif > 0 ? Math.min(100, Math.round(totalRealise/totalObjectif*100)) : 0;
  var pctColor = pct>=100?"#34C759":pct>=70?"#FF9F0A":"#FF3B30";

  function startEdit() {
    var d = {}; activeTeam.forEach(function(m){ d[m.name]=weekObjectives[m.name]||0; });
    setDraft(d); setEditMode(true);
  }
  function saveWeek() {
    var updated = Object.assign({}, objectives); updated[selectedWeek] = Object.assign({}, draft);
    saveObjectives(updated); setEditMode(false);
  }
  function navWeek(dir) { // dir=-1 older, +1 newer
    var ni = weekIdx + dir;
    if (ni >= 0 && ni < allWeeks.length) { setSelectedWeek(allWeeks[ni]); setEditMode(false); }
  }

  var sortedTeam = activeTeam.slice().sort(function(a,b){ return (realise[b.name]||0)-(realise[a.name]||0); });

  var navBtnStyle = function(disabled) { return {
    width:34, height:34, borderRadius:99, border:"1px solid #E5E5EA",
    background: disabled?"#F5F5F7":"#fff", color: disabled?"#D1D1D6":"#1D1D1F",
    fontSize:16, cursor: disabled?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"inherit", flexShrink:0
  }; };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:800, letterSpacing:-0.6 }}>Objectifs</h2>

        {/* Week navigator */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"center" }}>
          <button style={navBtnStyle(weekIdx >= allWeeks.length-1)} onClick={function(){ navWeek(1); }}>←</button>
          <div style={{ textAlign:"center", minWidth:160 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F" }}>{getWeekLabel(selectedWeek)}</div>
            {isCurrent && <div style={{ fontSize:10, fontWeight:600, color:"#0071E3", textTransform:"uppercase", letterSpacing:0.5, marginTop:1 }}>En cours</div>}
            {isPast   && <div style={{ fontSize:10, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginTop:1 }}>Passée</div>}
          </div>
          <button style={navBtnStyle(weekIdx <= 0)} onClick={function(){ navWeek(-1); }}>→</button>
        </div>

        {/* Actions */}
        {!editMode ? (
          <Btn onClick={startEdit} v="primary" s="sm">{totalObjectif===0?"Fixer les objectifs":"Modifier"}</Btn>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={function(){ setEditMode(false); }} v="secondary" s="sm">Annuler</Btn>
            <Btn onClick={saveWeek} v="primary" s="sm">Enregistrer</Btn>
          </div>
        )}
      </div>

      {/* ── KPI global ── */}
      {totalObjectif > 0 && (
        <Card style={{ marginBottom:20, padding:20 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:20, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#AEAEB2", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Équipe — objectif semaine</div>
              <div style={{ fontSize:38, fontWeight:800, letterSpacing:-1.5, color:pctColor, lineHeight:1 }}>{pct}%</div>
              <div style={{ fontSize:13, color:"#6E6E73", marginTop:4 }}>{totalRealise} réalisés sur {totalObjectif} attendus</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
              <div style={{ textAlign:"center", background: nbAtteints>0?"#E8F8ED":"#F5F5F7", borderRadius:12, padding:"8px 14px" }}>
                <div style={{ fontSize:22, fontWeight:800, color: nbAtteints>0?"#1C7A3A":"#AEAEB2" }}>{nbAtteints}</div>
                <div style={{ fontSize:10, fontWeight:600, color: nbAtteints>0?"#1C7A3A":"#AEAEB2", textTransform:"uppercase", letterSpacing:0.4 }}>Atteints</div>
              </div>
              <div style={{ fontSize:11, color:"#AEAEB2" }}>sur {nbAvecObj} objectifs</div>
            </div>
          </div>
          <div style={{ background:"#F5F5F7", borderRadius:999, height:8, overflow:"hidden" }}>
            <div style={{ width:pct+"%", background:pctColor, height:"100%", borderRadius:999, transition:"width 0.5s" }} />
          </div>
        </Card>
      )}

      {/* ── Cards commerciaux ── */}
      {sortedTeam.length === 0 ? (
        <Card><div style={{ textAlign:"center", padding:40, color:"#AEAEB2" }}>Aucun commercial actif</div></Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
          {sortedTeam.map(function(m) {
            var obj  = editMode ? (draft[m.name]||0) : (weekObjectives[m.name]||0);
            var done = realise[m.name]||0;
            var p    = obj>0 ? Math.min(100, Math.round(done/obj*100)) : 0;
            var col  = obj===0?"#AEAEB2":p>=100?"#34C759":p>=70?"#FF9F0A":"#FF3B30";
            var atteint = obj>0 && done>=obj;
            var initials = m.name.split(" ").map(function(w){ return w[0]; }).slice(0,2).join("").toUpperCase();
            var mCol = ROLE_COLORS[m.role] || "#AEAEB2";

            return (
              <Card key={m.id} style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
                {/* Avatar + nom */}
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:99, background:mCol+"20", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:mCol }}>{initials}</span>
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1D1D1F", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{m.name.split(" ")[0]}</div>
                    <div style={{ fontSize:11, color:"#AEAEB2" }}>{m.role}</div>
                  </div>
                </div>

                {/* Réalisé / Objectif */}
                <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                  <div style={{ fontSize:28, fontWeight:800, letterSpacing:-1, color: done>0?col:"#D1D1D6" }}>{done}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, color:"#AEAEB2" }}>/ </span>
                    {editMode ? (
                      <input
                        type="number" min="0" value={draft[m.name]||0}
                        onChange={function(e){ var v=parseInt(e.target.value)||0; setDraft(function(prev){ return Object.assign({},prev,{[m.name]:v}); }); }}
                        onClick={function(e){ e.target.select(); }}
                        style={{ width:52, border:"1.5px solid #0071E3", borderRadius:8, padding:"3px 6px", textAlign:"center", fontWeight:700, fontSize:15, fontFamily:"inherit", color:"#1D1D1F" }}
                      />
                    ) : (
                      <span style={{ fontSize:15, fontWeight:700, color: obj===0?"#D1D1D6":"#1D1D1F" }}>{obj===0?"—":obj}</span>
                    )}
                  </div>
                </div>

                {/* Barre + % */}
                {obj>0 ? (
                  <div>
                    <div style={{ background:"#F5F5F7", borderRadius:999, height:5, overflow:"hidden", marginBottom:4 }}>
                      <div style={{ width:p+"%", background:col, height:"100%", borderRadius:999, transition:"width 0.3s" }} />
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:col }}>{p}%</div>
                  </div>
                ) : (
                  <div style={{ height:5, background:"#F5F5F7", borderRadius:999 }} />
                )}

                {/* Badge statut */}
                {!editMode && (
                  <div>
                    {obj===0 ? (
                      <span style={{ fontSize:11, color:"#D1D1D6" }}>Pas d'objectif</span>
                    ) : atteint ? (
                      <span style={{ background:"#E8F8ED", color:"#1C7A3A", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>✓ Atteint</span>
                    ) : isPast ? (
                      <span style={{ background:"#FFEDEC", color:"#FF3B30", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>✗ Non atteint</span>
                    ) : (
                      <span style={{ background:"#F5F5F7", color:"#6E6E73", borderRadius:99, padding:"3px 10px", fontSize:11, fontWeight:700 }}>En cours</span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {totalObjectif===0 && !editMode && (
        <div style={{ textAlign:"center", color:"#AEAEB2", marginTop:28, fontSize:13 }}>
          Aucun objectif fixé pour cette semaine.
          <div style={{ marginTop:8 }}><Btn onClick={startEdit} v="primary" s="sm">Fixer les objectifs</Btn></div>
        </div>
      )}
    </div>
  );
}

export { ObjectifsTab };
