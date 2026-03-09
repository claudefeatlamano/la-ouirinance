import React, { useState } from "react";
import { Badge, Card, Btn, Sel, Inp, Modal } from "./ui.jsx";
import { ROLES, ROLE_LABELS, ROLE_COLORS, OPERATORS, OP_COLORS } from "../constants/roles.js";
import { statusColor, isCaduque } from "../helpers/status.js";

function TeamTab({ team, saveTeam, contracts, saveContracts, groups, saveGroups }) {
const [mo, setMo] = useState(false);
const [em, setEm] = useState(null);
const [f, setF] = useState({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false, vstCodes: [], lentCodes: [] });
const [fl, setFl] = useState("");
const [vue, setVue] = useState("liste");
const [picker, setPicker] = useState(null);
const [vstInputs, setVstInputs] = useState({});
const [vstAddOpen, setVstAddOpen] = useState(null);
const [fVstInput, setFVstInput] = useState("");
const [fLentCode, setFLentCode] = useState("");
const [fLentBorrower, setFLentBorrower] = useState("");

function openAdd() { setEm(null); setF({ name: "", role: "Debutant", operators: ["Free"], permis: false, voiture: false, vstCodes: [], lentCodes: [] }); setFVstInput(""); setFLentCode(""); setFLentBorrower(""); setMo(true); }
function openEdit(m) { setEm(m); setF({ name: m.name, role: m.role, operators: Array.isArray(m.operators) ? m.operators : [m.operator || "Free"], permis: m.permis, voiture: m.voiture, vstCodes: m.vstCodes ? m.vstCodes.slice() : [], lentCodes: m.lentCodes ? m.lentCodes.slice() : [] }); setFVstInput(""); setFLentCode(""); setFLentBorrower(""); setMo(true); }
function save() {
if (!f.name.trim()) return;
if (em) { saveTeam(team.map(function(m) { return m.id === em.id ? Object.assign({}, m, f) : m; })); }
else { saveTeam([...team, { id: Date.now(), ...f, active: true }]); }
setMo(false);
}

function assignVstCode(login, memberId) {
  var newTeam = team.map(function(m) {
    if (m.id === memberId) {
      var codes = (m.vstCodes || []).filter(function(c) { return c !== login; });
      return Object.assign({}, m, { vstCodes: codes.concat(login) });
    }
    // Remove from any other member who had this code
    return Object.assign({}, m, { vstCodes: (m.vstCodes || []).filter(function(c) { return c !== login; }) });
  });
  saveTeam(newTeam);
  var member = newTeam.find(function(m) { return m.id === memberId; });
  if (member && saveContracts) {
    var updated = contracts.map(function(c) {
      if (c.commercial === login) return Object.assign({}, c, { commercial: member.name });
      return c;
    });
    saveContracts(updated);
  }
}

function addVstCodeToMember(code, memberId) {
  var trimmed = code.trim().toLowerCase();
  if (!trimmed) return;
  if (!trimmed.startsWith('vst-')) trimmed = 'vst-' + trimmed;
  saveTeam(team.map(function(m) {
    if (m.id === memberId) {
      var codes = (m.vstCodes || []);
      if (codes.indexOf(trimmed) >= 0) return m;
      return Object.assign({}, m, { vstCodes: codes.concat(trimmed) });
    }
    return m;
  }));
}

function removeVstCodeFromMember(code, memberId) {
  saveTeam(team.map(function(m) {
    if (m.id === memberId) return Object.assign({}, m, { vstCodes: (m.vstCodes || []).filter(function(c) { return c !== code; }) });
    return m;
  }));
}

var roleOrder = { "Manager": 0, "Assistant Manager": 1, "Formateur": 2, "Confirme": 3, "Debutant": 4 };

// Reverse map: borrowerId → [{code, lenderName}]
var borrowerMap = {};
team.forEach(function(m) {
  (m.lentCodes || []).forEach(function(lc) {
    if (!borrowerMap[lc.borrowerId]) borrowerMap[lc.borrowerId] = [];
    borrowerMap[lc.borrowerId].push({ code: lc.code, lenderName: m.name });
  });
});

function MemberCard({ m, onClick }) {
  var borrowed = borrowerMap[m.id] || [];
  return (
    <Card style={{ padding: 14, opacity: m.active ? 1 : 0.5, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: ROLE_COLORS[m.role] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: ROLE_COLORS[m.role] }}>{m.name[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.2 }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
            <Badge color={ROLE_COLORS[m.role]}>{ROLE_LABELS[m.role]}</Badge>
            {(Array.isArray(m.operators) ? m.operators : [m.operator]).filter(Boolean).map(function(op) { return <Badge key={op} color={OP_COLORS[op]}>{op}</Badge>; })}
            {m.permis && <Badge color="#34C759">Permis</Badge>}
            {m.voiture && <Badge color="#7C3AED">Voiture</Badge>}
            {!m.active && <Badge color="#FF3B30">Inactif</Badge>}
            {borrowed.map(function(bc) { return <Badge key={bc.code} color="#FF9F0A">Code de {bc.lenderName.split(' ')[0]}</Badge>; })}
          </div>
        </div>
      </div>
    </Card>
  );
}

return (
<div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
  <div style={{ display: "flex", gap: 6 }}>
    <Btn s="sm" v={vue === "liste" ? "primary" : "secondary"} onClick={function() { setVue("liste"); }}>Liste ({team.length})</Btn>
    <Btn s="sm" v={vue === "orga" ? "primary" : "secondary"} onClick={function() { setVue("orga"); }}>Organigramme</Btn>
    <Btn s="sm" v={vue === "vst" ? "primary" : "secondary"} onClick={function() { setVue("vst"); }}>Codes VST</Btn>
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    {vue === "liste" && ROLES.map(function(r) {
      var count = team.filter(function(m) { return m.role === r; }).length;
      if (!count) return null;
      return <Btn key={r} s="sm" v={fl === r ? "primary" : "secondary"} onClick={function() { setFl(fl === r ? "" : r); }}>{r} ({count})</Btn>;
    })}
    {vue !== "vst" && <Btn onClick={openAdd}>+ Ajouter</Btn>}
  </div>
</div>

{vue === "liste" && ROLES.map(function(role) {
  var members = team.filter(function(m) { return m.role === role && (!fl || m.role === fl); });
  if (!members.length) return null;
  return (
    <div key={role} style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: ROLE_COLORS[role] }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ROLE_COLORS[role] }}>{role}s ({members.length})</h3>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {members.map(function(m) { return <MemberCard key={m.id} m={m} onClick={function() { openEdit(m); }} />; })}
      </div>
    </div>
  );
})}

{vue === "orga" && (function() {
  var GROUP_PALETTE = ["#0071E3","#34C759","#FF9F0A","#AF52DE","#FF2D55","#5AC8FA","#FF6B35","#00B4D8","#06D6A0","#E63946"];

  function addGroup() { saveGroups([...groups, { id: Date.now(), name: "Nouvelle équipe", memberIds: [] }]); }
  function deleteGroup(gid) { saveGroups(groups.filter(function(g) { return g.id !== gid; })); }
  function renameGroup(gid, name) { saveGroups(groups.map(function(g) { return g.id === gid ? Object.assign({}, g, { name: name }) : g; })); }
  function removeMember(gid, mid) { saveGroups(groups.map(function(g) { return g.id === gid ? Object.assign({}, g, { memberIds: g.memberIds.filter(function(id) { return id !== mid; }) }) : g; })); }
  function addMember(gid, mid) {
    var member = team.find(function(m) { return m.id === mid; });
    saveGroups(groups.map(function(g) {
      if (g.id === gid) {
        var newIds = g.memberIds.indexOf(mid) >= 0 ? g.memberIds : g.memberIds.concat(mid);
        var updates = { memberIds: newIds };
        if (g.memberIds.length === 0 && member) {
          updates.name = "Équipe de " + member.name.split(' ')[0];
        }
        return Object.assign({}, g, updates);
      }
      return g;
    }));
  }

  function initials(name) { var p = name.split(' '); return (p[0][0] + (p[p.length-1][0] || '')).toUpperCase(); }

  function Avatar({ name, role, size }) {
    var sz = size || 48;
    return (
      <div style={{ width: sz, height: sz, borderRadius: sz, background: ROLE_COLORS[role] + "22", border: "2px solid " + ROLE_COLORS[role] + "44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: sz * 0.33, fontWeight: 700, color: ROLE_COLORS[role], flexShrink: 0 }}>
        {initials(name)}
      </div>
    );
  }

  function MemberTile({ m, onRemove, isLeader, accent }) {
    var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: isLeader ? "14px 16px" : "10px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12, position: "relative", borderLeft: isLeader ? "3px solid " + accent : "none", minWidth: isLeader ? 200 : 170 }}>
        <Avatar name={m.name} role={m.role} size={isLeader ? 46 : 38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isLeader ? 14 : 13, fontWeight: 600, color: "#1D1D1F", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role], background: ROLE_COLORS[m.role] + "15", padding: "1px 6px", borderRadius: 99 }}>{ROLE_LABELS[m.role]}</span>
            {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, fontWeight: 600, color: OP_COLORS[op], background: OP_COLORS[op] + "18", padding: "1px 6px", borderRadius: 99 }}>{op}</span>; })}
          </div>
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 16, lineHeight: 1, padding: 2, borderRadius: 99, display: "flex", alignItems: "center" }} title="Retirer">×</button>
        )}
      </div>
    );
  }

  function PickerModal({ gid, available, onClose }) {
    var [search, setSearch] = useState("");
    var filtered = available.filter(function(m) { return m.name.toLowerCase().indexOf(search.toLowerCase()) >= 0; });
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={function(e) { e.stopPropagation(); }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1D1D1F" }}>Ajouter un membre</div>
          <input autoFocus value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Rechercher..." style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E5E5EA", fontSize: 13, outline: "none" }} />
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && <div style={{ color: "#AEAEB2", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun membre disponible</div>}
            {filtered.map(function(m) {
              var ops = Array.isArray(m.operators) ? m.operators : [m.operator].filter(Boolean);
              return (
                <div key={m.id} onClick={function() { addMember(gid, m.id); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, cursor: "pointer", background: "#F5F5F7", transition: "background 0.1s" }}
                  onMouseEnter={function(e) { e.currentTarget.style.background = "#E8E8ED"; }}
                  onMouseLeave={function(e) { e.currentTarget.style.background = "#F5F5F7"; }}>
                  <Avatar name={m.name} role={m.role} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLORS[m.role] }}>{ROLE_LABELS[m.role]}</span>
                      {ops.map(function(op) { return <span key={op} style={{ fontSize: 10, color: OP_COLORS[op] }}>{op}</span>; })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Btn v="secondary" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    );
  }

  var assignedIds = new Set();
  groups.forEach(function(g) { g.memberIds.forEach(function(id) { assignedIds.add(id); }); });
  var unassigned = team.filter(function(m) { return !assignedIds.has(m.id); });

  return (
    <div>
      {picker && <PickerModal gid={picker} available={team.filter(function(m) { return groups.find(function(g) { return g.id === picker; }).memberIds.indexOf(m.id) < 0; })} onClose={function() { setPicker(null); }} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#6E6E73" }}>{team.length} membres · {groups.length} équipe{groups.length !== 1 ? "s" : ""}{unassigned.length > 0 ? " · " + unassigned.length + " sans équipe" : ""}</span>
        <Btn onClick={addGroup}>+ Nouvelle équipe</Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map(function(g, gi) {
          var accent = GROUP_PALETTE[gi % GROUP_PALETTE.length];
          var members = g.memberIds.map(function(id) { return team.find(function(m) { return m.id === id; }); }).filter(Boolean);
          var leader = members[0];
          var rest = members.slice(1);
          var available = team.filter(function(m) { return g.memberIds.indexOf(m.id) < 0; });

          return (
            <div key={g.id} style={{ background: "#FAFAFA", borderRadius: 18, border: "1px solid #E5E5EA", overflow: "hidden" }}>
              {/* Group header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: "1px solid #F0F0F0", background: accent + "08" }}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: accent, flexShrink: 0 }} />
                <input value={g.name} onChange={function(e) { renameGroup(g.id, e.target.value); }}
                  style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#1D1D1F", background: "transparent", border: "none", outline: "none", letterSpacing: -0.3 }} />
                <span style={{ fontSize: 12, color: "#AEAEB2", fontWeight: 500 }}>{members.length} membre{members.length !== 1 ? "s" : ""}</span>
                <button onClick={function() { deleteGroup(g.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C7CC", fontSize: 18, lineHeight: 1, padding: "0 2px" }} title="Supprimer">×</button>
              </div>

              {/* Group body */}
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                {/* Leader */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase" }}>Référent</span>
                  {leader
                    ? <MemberTile m={leader} onRemove={function() { removeMember(g.id, leader.id); }} isLeader={true} accent={accent} />
                    : <div style={{ width: 200, height: 68, border: "2px dashed " + accent + "44", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: accent + "88", fontSize: 12 }}>Aucun référent</div>
                  }
                </div>

                {/* Connector */}
                {rest.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", padding: "0 12px", marginTop: 22 }}>
                    <svg width="32" height="2"><line x1="0" y1="1" x2="32" y2="1" stroke={accent} strokeWidth="2" strokeDasharray="4 3" /></svg>
                  </div>
                )}

                {/* Members */}
                {rest.length > 0 && (
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#AEAEB2", letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Commerciaux</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {rest.map(function(m) { return <MemberTile key={m.id} m={m} onRemove={function() { removeMember(g.id, m.id); }} isLeader={false} accent={accent} />; })}
                    </div>
                  </div>
                )}

                {/* Add button */}
                {available.length > 0 && (
                  <div style={{ marginTop: 22, marginLeft: 12 }}>
                    <button onClick={function() { setPicker(g.id); }} style={{ width: 38, height: 38, borderRadius: 99, border: "2px dashed " + accent + "66", background: accent + "0A", cursor: "pointer", color: accent, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300 }}>+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div style={{ background: "#FAFAFA", borderRadius: 18, border: "1px dashed #D2D2D7", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ width: 10, height: 10, borderRadius: 99, background: "#AEAEB2", flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#AEAEB2", flex: 1 }}>Sans équipe</span>
              <span style={{ fontSize: 12, color: "#AEAEB2" }}>{unassigned.length} membre{unassigned.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {unassigned.map(function(m) { return <MemberTile key={m.id} m={m} onRemove={null} isLeader={false} accent="#AEAEB2" />; })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
})()}

{vue === "vst" && (function() {
  // Build a map of all VST codes to their assigned member name
  var codeToName = {};
  team.forEach(function(m) { (m.vstCodes || []).forEach(function(c) { codeToName[c] = m.name; }); });

  // Unresolved = contracts where commercial still starts with 'vst-'
  var unresGroups = {};
  contracts.forEach(function(c) {
    if (c.commercial && c.commercial.startsWith('vst-')) {
      if (!unresGroups[c.commercial]) unresGroups[c.commercial] = [];
      unresGroups[c.commercial].push(c);
    }
  });
  var unresList = Object.keys(unresGroups).sort();

  return (
    <div>
      {/* Unresolved codes */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: "#FF3B30" }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#FF3B30" }}>
            Codes non attribués {unresList.length > 0 ? "(" + unresList.length + ")" : "— tout est résolu ✓"}
          </h3>
        </div>
        {unresList.length === 0 && (
          <p style={{ fontSize: 13, color: "#AEAEB2", margin: 0 }}>Tous les codes sont attribués à un commercial.</p>
        )}
        {unresList.map(function(login) {
          var ctrs = unresGroups[login];
          return (
            <Card key={login} style={{ padding: "12px 16px", marginBottom: 8, borderLeft: "3px solid #FF3B30" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <code style={{ fontSize: 13, fontWeight: 700, color: "#FF3B30", background: "#FF3B3010", padding: "3px 8px", borderRadius: 6 }}>{login}</code>
                <span style={{ fontSize: 12, color: "#6E6E73" }}>{ctrs.length} contrat{ctrs.length > 1 ? "s" : ""}</span>
                <span style={{ fontSize: 11, color: "#AEAEB2" }}>dernier : {ctrs[ctrs.length - 1].date || "—"}</span>
                <div style={{ marginLeft: "auto" }}>
                  <Sel
                    value=""
                    placeholder="Attribuer à..."
                    onChange={function(v) { if (v) assignVstCode(login, parseInt(v)); }}
                    options={team.filter(function(m) { return m.active; }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) { return { value: String(m.id), label: m.name }; })}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* All team members with their codes */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: "#0071E3" }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1D1D1F" }}>Codes par commercial</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {team.filter(function(m) { return m.active; }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) {
            var codes = m.vstCodes || [];
            var inputVal = vstInputs[m.id] || "";
            return (
              <Card key={m.id} style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: ROLE_COLORS[m.role] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: ROLE_COLORS[m.role], flexShrink: 0 }}>{m.name[0]}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1D1D1F", minWidth: 150 }}>{m.name}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, alignItems: "center" }}>
                    {codes.map(function(code) {
                      return (
                        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0071E310", border: "1px solid #0071E330", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: "#0071E3" }}>
                          {code}
                          <button onClick={function() { removeVstCodeFromMember(code, m.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#0071E380", fontSize: 14, lineHeight: 1, padding: 0, display: "flex", alignItems: "center" }}>×</button>
                        </span>
                      );
                    })}
                    {codes.length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun code attribué</span>}
                  </div>
                  <button onClick={function(e) { e.stopPropagation(); setVstAddOpen(vstAddOpen === m.id ? null : m.id); var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v)); }}
                    style={{ width: 28, height: 28, borderRadius: 8, border: "1px dashed #0071E360", background: vstAddOpen === m.id ? "#0071E310" : "transparent", cursor: "pointer", color: "#0071E3", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 300, flexShrink: 0 }}>
                    {vstAddOpen === m.id ? "×" : "+"}
                  </button>
                  {vstAddOpen === m.id && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      value={inputVal}
                      onChange={function(e) { var v = {}; v[m.id] = e.target.value; setVstInputs(Object.assign({}, vstInputs, v)); }}
                      onKeyDown={function(e) {
                        if (e.key === 'Escape') { setVstAddOpen(null); return; }
                        if (e.key === 'Enter' && inputVal.trim()) {
                          addVstCodeToMember(inputVal, m.id);
                          var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v));
                          setVstAddOpen(null);
                        }
                      }}
                      placeholder="vst-xxx + Entrée"
                      style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #0071E340", fontSize: 12, width: 140, fontFamily: "monospace", outline: "none", background: "#F5F9FF" }}
                    />
                    <Btn s="sm" v="secondary" onClick={function() {
                      if (inputVal.trim()) {
                        addVstCodeToMember(inputVal, m.id);
                        var v = {}; v[m.id] = ""; setVstInputs(Object.assign({}, vstInputs, v));
                        setVstAddOpen(null);
                      }
                    }}>✓</Btn>
                  </div>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
})()}

<Modal open={mo} onClose={function() { setMo(false); }} title={em ? "Modifier" : "Ajouter"}>
<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Nom</label><Inp value={f.name} onChange={function(v) { setF(Object.assign({}, f, { name: v })); }} placeholder="Nom" /></div>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Role</label><Sel value={f.role} onChange={function(v) { setF(Object.assign({}, f, { role: v })); }} options={ROLES} style={{ width: "100%" }} /></div>
<div><label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 4 }}>Opérateurs</label><div style={{ display: "flex", gap: 12, marginTop: 4 }}>{OPERATORS.map(function(op) { var checked = (f.operators || []).indexOf(op) >= 0; return <label key={op} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={checked} onChange={function(e) { var ops = (f.operators || []).filter(function(x) { return x !== op; }); if (e.target.checked) ops = ops.concat(op); setF(Object.assign({}, f, { operators: ops })); }} /><Badge color={OP_COLORS[op]}>{op}</Badge></label>; })}</div></div>
</div>
<div style={{ display: "flex", gap: 20 }}>
<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.permis} onChange={function(e) { setF(Object.assign({}, f, { permis: e.target.checked })); }} />Permis</label>
<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.voiture} onChange={function(e) { setF(Object.assign({}, f, { voiture: e.target.checked })); }} />Voiture</label>
</div>
<div>
  <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 6 }}>Codes VST</label>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
    {(f.vstCodes || []).map(function(code) {
      return (
        <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0071E310", border: "1px solid #0071E330", borderRadius: 8, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: "#0071E3" }}>
          {code}
          <button type="button" onClick={function() { setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).filter(function(c) { return c !== code; }) })); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#0071E380", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      );
    })}
    {(f.vstCodes || []).length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun code</span>}
  </div>
  <div style={{ display: "flex", gap: 6 }}>
    <input
      value={fVstInput}
      onChange={function(e) { setFVstInput(e.target.value); }}
      onKeyDown={function(e) {
        if (e.key === 'Enter' && fVstInput.trim()) {
          e.preventDefault();
          var code = fVstInput.trim().toLowerCase();
          if (!code.startsWith('vst-')) code = 'vst-' + code;
          if ((f.vstCodes || []).indexOf(code) < 0) setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).concat(code) }));
          setFVstInput("");
        }
      }}
      placeholder="vst-xxx + Entrée"
      style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", fontSize: 12, fontFamily: "monospace", outline: "none" }}
    />
    <Btn s="sm" v="secondary" onClick={function() {
      if (fVstInput.trim()) {
        var code = fVstInput.trim().toLowerCase();
        if (!code.startsWith('vst-')) code = 'vst-' + code;
        if ((f.vstCodes || []).indexOf(code) < 0) setF(Object.assign({}, f, { vstCodes: (f.vstCodes || []).concat(code) }));
        setFVstInput("");
      }
    }}>Ajouter</Btn>
  </div>
</div>
{(f.vstCodes || []).length > 0 && (
<div>
  <label style={{ fontSize: 12, fontWeight: 600, color: "#6E6E73", display: "block", marginBottom: 6 }}>Codes temporaires prêtés à</label>
  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
    {(f.lentCodes || []).map(function(lc) {
      var borrower = team.find(function(m) { return m.id === lc.borrowerId; });
      return (
        <div key={lc.code + lc.borrowerId} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FF9F0A0D", border: "1px solid #FF9F0A30", borderRadius: 8, padding: "5px 10px" }}>
          <code style={{ fontSize: 12, fontWeight: 700, color: "#FF9F0A" }}>{lc.code}</code>
          <span style={{ fontSize: 12, color: "#6E6E73" }}>→</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1D1D1F", flex: 1 }}>{borrower ? borrower.name : "?"}</span>
          <button type="button" onClick={function() { setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).filter(function(x) { return !(x.code === lc.code && x.borrowerId === lc.borrowerId); }) })); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#AEAEB2", fontSize: 14, padding: 0 }}>×</button>
        </div>
      );
    })}
    {(f.lentCodes || []).length === 0 && <span style={{ fontSize: 12, color: "#AEAEB2", fontStyle: "italic" }}>Aucun prêt actif</span>}
  </div>
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    <Sel
      value={fLentCode}
      placeholder="Code à prêter..."
      onChange={function(code) {
        setFLentCode(code);
        if (code && fLentBorrower) {
          var bid = parseInt(fLentBorrower);
          if (!(f.lentCodes || []).find(function(x) { return x.code === code && x.borrowerId === bid; }))
            setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).concat({ code: code, borrowerId: bid }) }));
          setFLentCode(""); setFLentBorrower("");
        }
      }}
      options={(f.vstCodes || []).map(function(c) { return { value: c, label: c }; })}
      style={{ flex: 1 }}
    />
    <span style={{ fontSize: 12, color: "#6E6E73" }}>→</span>
    <Sel
      value={fLentBorrower}
      placeholder="Prêter à..."
      onChange={function(bid) {
        setFLentBorrower(bid);
        if (bid && fLentCode) {
          var borrowerId = parseInt(bid);
          if (!(f.lentCodes || []).find(function(x) { return x.code === fLentCode && x.borrowerId === borrowerId; }))
            setF(Object.assign({}, f, { lentCodes: (f.lentCodes || []).concat({ code: fLentCode, borrowerId: borrowerId }) }));
          setFLentCode(""); setFLentBorrower("");
        }
      }}
      options={team.filter(function(m) { return m.active && (!em || m.id !== em.id); }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(m) { return { value: String(m.id), label: m.name }; })}
      style={{ flex: 1 }}
    />
  </div>
</div>
)}
<div style={{ display: "flex", gap: 10 }}>
<Btn onClick={save} style={{ flex: 1 }}>{em ? "Enregistrer" : "Ajouter"}</Btn>
{em && <Btn v="secondary" onClick={function() { saveTeam(team.map(function(m) { return m.id === em.id ? Object.assign({}, m, { active: !m.active }) : m; })); setMo(false); }}>{em.active ? "Desactiver" : "Reactiver"}</Btn>}
{em && <Btn v="danger" onClick={function() { saveTeam(team.filter(function(m) { return m.id !== em.id; })); setMo(false); }}>Suppr</Btn>}
</div>
</div>
</Modal>

</div>
);
}

// Secteur autocomplete — suggestions from all known sectors (JACHERE + JACHERE_TALC)
var ALL_SECTORS = Object.keys(JACHERE).map(function(n) { return { name: n, talc: false }; })
  .concat(Object.keys(JACHERE_TALC).map(function(n) { return { name: n, talc: true }; }));

export { TeamTab };
