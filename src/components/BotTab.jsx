import React, { useState } from "react";
import { CampaignTab } from "./CampaignTab.jsx";
import { QuestionsTab } from "./QuestionsTab.jsx";
import { VendorCodesTab } from "./VendorCodesTab.jsx";

var SUBTABS = [
  { id: "campagne", label: "Campagne WhatsApp" },
  { id: "questions", label: "Questions" },
  { id: "codes", label: "Codes vendeurs" },
];

export function BotTab(props) {
  var [sub, setSub] = useState("campagne");

  return (
    <div style={{ padding: "12px 24px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {SUBTABS.map(function (t) {
          var active = sub === t.id;
          return (
            <button key={t.id} onClick={function () { setSub(t.id); }} style={{
              padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 14,
              border: active ? "1px solid #2e7d32" : "1px solid rgba(76,87,96,0.25)",
              background: active ? "rgba(46,125,50,0.10)" : "transparent",
              color: active ? "#2e7d32" : "inherit", fontWeight: active ? 700 : 500,
            }}>{t.label}</button>
          );
        })}
      </div>

      {sub === "campagne" ? <CampaignTab team={props.team} /> : null}
      {sub === "questions" ? (
        <QuestionsTab feedback={props.feedback} calibrated={props.calibrated} updateFeedbackEntry={props.updateFeedbackEntry} addCalibrated={props.addCalibrated} />
      ) : null}
      {sub === "codes" ? <VendorCodesTab profiles={props.profiles} submissions={props.submissions} /> : null}
    </div>
  );
}
