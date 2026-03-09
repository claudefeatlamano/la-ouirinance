import React from "react";

function Badge({ children, color }) {
var c = color || "#6E6E73";
return (
<span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: c, background: c + "18", letterSpacing: 0.1 }}>
{children}
</span>
);
}

function Card({ children, style, onClick }) {
return (
<div onClick={onClick} style={{ background: "#FFFFFF", borderRadius: 18, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)", cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.18s", ...style }}
  onMouseEnter={onClick ? function(e) { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)"; } : undefined}
  onMouseLeave={onClick ? function(e) { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)"; } : undefined}
>
{children}
</div>
);
}

function Btn({ children, onClick, v, s, icon, style, disabled }) {
var variant = v || "primary";
var size = s || "md";
var sz = size === "sm" ? { padding: "5px 13px", fontSize: 12, borderRadius: 99 } : { padding: "8px 18px", fontSize: 13, borderRadius: 99 };
var vs = {
  primary: { background: "#0071E3", color: "#fff" },
  secondary: { background: "#F5F5F7", color: "#1D1D1F", border: "1px solid rgba(0,0,0,0.08)" },
  danger: { background: "#FF3B3010", color: "#FF3B30", border: "1px solid #FF3B3020" },
  ghost: { background: "transparent", color: "#6E6E73" }
};
return (
<button disabled={disabled} onClick={onClick}
  style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.4 : 1, letterSpacing: -0.1, transition: "opacity 0.15s, transform 0.1s", ...sz, ...(vs[variant] || vs.primary), ...style }}
  onMouseDown={function(e) { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
  onMouseUp={function(e) { e.currentTarget.style.transform = "scale(1)"; }}
  onMouseLeave={function(e) { e.currentTarget.style.transform = "scale(1)"; }}
>
{children}
</button>
);
}

function Sel({ value, onChange, options, placeholder, style }) {
return (
<select value={value} onChange={function(e) { onChange(e.target.value); }}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 13, fontFamily: "inherit", background: "#fff", outline: "none", cursor: "pointer", color: "#1D1D1F", ...style }}>
{placeholder && <option value="">{placeholder}</option>}
{options.map(function(o) {
var val = typeof o === "string" ? o : o.value;
var label = typeof o === "string" ? o : o.label;
return <option key={val} value={val}>{label}</option>;
})}
</select>
);
}

function Inp({ value, onChange, placeholder, style, type }) {
return (
<input type={type || "text"} value={value} onChange={function(e) { onChange(e.target.value); }} placeholder={placeholder}
  onFocus={function(e) { e.target.style.borderColor = "#0071E3"; e.target.style.boxShadow = "0 0 0 3px rgba(0,113,227,0.12)"; }}
  onBlur={function(e) { e.target.style.borderColor = "rgba(0,0,0,0.1)"; e.target.style.boxShadow = "none"; }}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", transition: "border-color 0.15s, box-shadow 0.15s", background: "#fff", color: "#1D1D1F", ...style }} />
);
}

function Modal({ open, onClose, title, children }) {
if (!open) return null;
return (
<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
<div onClick={function(e) { e.stopPropagation(); }} style={{ background: "#FFFFFF", borderRadius: 22, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
<h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#1D1D1F" }}>{title}</h3>
<button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 99, background: "#F5F5F7", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#6E6E73" }}>✕</button>
</div>
{children}
</div>
</div>
);
}

function StatCard({ label, value, sub, color }) {
var c = color || "#1D1D1F";
return (
<Card style={{ flex: 1, minWidth: 130, padding: "18px 20px" }}>
<div style={{ fontSize: 11, color: "#AEAEB2", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
<div style={{ fontSize: 30, fontWeight: 700, color: c, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
{sub && <div style={{ fontSize: 12, color: "#6E6E73", marginTop: 5 }}>{sub}</div>}
</Card>
);
}

export { Badge, Card, Btn, Sel, Inp, Modal, StatCard };
