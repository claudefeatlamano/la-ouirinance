import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Badge({ children, color, className }) {
var c = color || "var(--lo-muted)";
var soft = c.indexOf("var(") === 0 ? "rgba(76,87,96,0.10)" : c + "18";
var border = c.indexOf("var(") === 0 ? "rgba(76,87,96,0.18)" : c + "25";
return (
<motion.span
  initial={{ scale: 0.85, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: "spring", stiffness: 400, damping: 20 }}
  className={className}
  style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: c, background: soft, border: "1px solid " + border, letterSpacing: 0 }}>
{children}
</motion.span>
);
}

function Card({ children, style, onClick, className }) {
return (
<motion.div
  onClick={onClick}
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.25, ease: "easeOut" }}
  whileHover={onClick ? { scale: 1.005, backgroundColor: "rgba(255,253,247,0.94)" } : undefined}
  className={className}
  style={{ background: "var(--lo-card)", borderRadius: 8, padding: 20, boxShadow: "var(--lo-shadow-soft)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid var(--lo-border)", cursor: onClick ? "pointer" : "default", transition: "background 0.18s, box-shadow 0.18s, transform 0.18s", color: "var(--lo-ink)", ...style }}>
{children}
</motion.div>
);
}

function Btn({ children, onClick, v, s, icon, style, disabled, className }) {
var variant = v || "primary";
var size = s || "md";
var sz = size === "sm" ? { padding: "5px 13px", fontSize: 12, borderRadius: 99 } : { padding: "8px 18px", fontSize: 13, borderRadius: 99 };
var vs = {
  primary: { background: "var(--lo-primary)", color: "#fffdf7", border: "1px solid rgba(76,87,96,0.5)" },
  secondary: { background: "rgba(255,253,247,0.70)", color: "var(--lo-text)", border: "1px solid var(--lo-border)" },
  danger: { background: "var(--lo-danger-soft)", color: "var(--lo-danger)", border: "1px solid rgba(102,99,91,0.24)" },
  ghost: { background: "transparent", color: "var(--lo-muted)", border: "1px solid transparent" }
};
return (
<motion.button
  disabled={disabled}
  onClick={onClick}
  whileTap={disabled ? undefined : { scale: 0.97 }}
  className={className}
  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.4 : 1, letterSpacing: 0, transition: "opacity 0.15s, background 0.15s", ...sz, ...(vs[variant] || vs.primary), ...style }}>
{children}
</motion.button>
);
}

function Sel({ value, onChange, options, placeholder, style, className }) {
return (
<select value={value} onChange={function(e) { onChange(e.target.value); }}
  className={className}
  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--lo-border)", fontSize: 13, fontFamily: "inherit", background: "rgba(255,253,247,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", outline: "none", cursor: "pointer", color: "var(--lo-ink)", ...style }}>
{placeholder && <option value="" style={{ background: "#fffdf7", color: "#2f363b" }}>{placeholder}</option>}
{options.map(function(o) {
var val = typeof o === "string" ? o : o.value;
var label = typeof o === "string" ? o : o.label;
return <option key={val} value={val} style={{ background: "#fffdf7", color: "#2f363b" }}>{label}</option>;
})}
</select>
);
}

function Inp({ value, onChange, placeholder, style, type, className }) {
return (
<input type={type || "text"} value={value} onChange={function(e) { onChange(e.target.value); }} placeholder={placeholder}
  onFocus={function(e) { e.target.style.borderColor = "#4C5760"; e.target.style.boxShadow = "0 0 0 3px rgba(147,168,172,0.24)"; }}
  onBlur={function(e) { e.target.style.borderColor = "rgba(76,87,96,0.16)"; e.target.style.boxShadow = "none"; }}
  className={className}
  style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--lo-border)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", transition: "border-color 0.15s, box-shadow 0.15s", background: "rgba(255,253,247,0.78)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "var(--lo-ink)", ...style }} />
);
}

function Modal({ open, onClose, title, children, className }) {
return (
<AnimatePresence>
{open && (
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2 }}
  className="modal-overlay"
  style={{ position: "fixed", inset: 0, background: "rgba(47,54,59,0.28)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
  onClick={onClose}>
<motion.div
  initial={{ opacity: 0, scale: 0.96 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.96 }}
  transition={{ type: "spring", stiffness: 300, damping: 25 }}
  onClick={function(e) { e.stopPropagation(); }}
  className={"modal-content" + (className ? " " + className : "")}
  style={{ background: "rgba(255,253,247,0.96)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", borderRadius: 12, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(76,87,96,0.22), 0 0 0 1px rgba(76,87,96,0.12)", border: "1px solid rgba(76,87,96,0.12)" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
<h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0, color: "var(--lo-ink)" }}>{title}</h3>
<button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 99, background: "rgba(76,87,96,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--lo-muted)" }}>x</button>
</div>
{children}
</motion.div>
</motion.div>
)}
</AnimatePresence>
);
}

function AnimatedCounter({ value, color }) {
  var ref = useRef(null);
  var prevValue = useRef(value);
  useEffect(function() {
    if (prevValue.current !== value && ref.current) {
      ref.current.style.transform = "scale(1.08)";
      ref.current.style.transition = "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)";
      setTimeout(function() { if (ref.current) ref.current.style.transform = "scale(1)"; }, 250);
    }
    prevValue.current = value;
  }, [value]);
  return <span ref={ref} style={{ display: "inline-block", color: color }}>{value}</span>;
}

function StatCard({ label, value, sub, color, className }) {
var c = color || "var(--lo-primary)";
return (
<Card style={{ flex: 1, minWidth: 130, padding: "18px 20px" }} className={className}>
<div style={{ fontSize: 11, color: "var(--lo-faint)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0, marginBottom: 8 }}>{label}</div>
<div style={{ fontSize: 31, fontWeight: 900, lineHeight: 1, letterSpacing: 0 }}><AnimatedCounter value={value} color={c} /></div>
{sub && <div style={{ fontSize: 12, color: "var(--lo-muted)", marginTop: 7, fontWeight: 700 }}>{sub}</div>}
</Card>
);
}

export { Badge, Card, Btn, Sel, Inp, Modal, StatCard };
