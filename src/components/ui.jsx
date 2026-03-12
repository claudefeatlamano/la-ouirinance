import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Badge({ children, color, className }) {
var c = color || "#6E6E73";
return (
<motion.span
  initial={{ scale: 0.85, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: "spring", stiffness: 400, damping: 20 }}
  className={className}
  style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, color: c, background: c + "18", border: "1px solid " + c + "25", letterSpacing: 0.1 }}>
{children}
</motion.span>
);
}

function Card({ children, style, onClick, className }) {
return (
<motion.div
  onClick={onClick}
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
  whileHover={onClick ? { scale: 1.01, backgroundColor: "rgba(255,255,255,0.12)" } : undefined}
  className={className}
  style={{ background: "rgba(255,255,255,0.07)", borderRadius: 18, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.12)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", cursor: onClick ? "pointer" : "default", transition: "background 0.18s, box-shadow 0.18s", ...style }}>
{children}
</motion.div>
);
}

function Btn({ children, onClick, v, s, icon, style, disabled, className }) {
var variant = v || "primary";
var size = s || "md";
var sz = size === "sm" ? { padding: "5px 13px", fontSize: 12, borderRadius: 99 } : { padding: "8px 18px", fontSize: 13, borderRadius: 99 };
var vs = {
  primary: { background: "#0071E3", color: "#fff", border: "1px solid rgba(0,113,227,0.5)" },
  secondary: { background: "rgba(255,255,255,0.10)", color: "#f0f0f5", border: "1px solid rgba(255,255,255,0.15)" },
  danger: { background: "rgba(255,59,48,0.10)", color: "#FF3B30", border: "1px solid rgba(255,59,48,0.20)" },
  ghost: { background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid transparent" }
};
return (
<motion.button
  disabled={disabled}
  onClick={onClick}
  whileTap={disabled ? undefined : { scale: 0.97 }}
  whileHover={disabled ? undefined : { brightness: 1.1 }}
  className={className}
  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.4 : 1, letterSpacing: -0.1, transition: "opacity 0.15s, background 0.15s", ...sz, ...(vs[variant] || vs.primary), ...style }}>
{children}
</motion.button>
);
}

function Sel({ value, onChange, options, placeholder, style, className }) {
return (
<select value={value} onChange={function(e) { onChange(e.target.value); }}
  className={className}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, fontFamily: "inherit", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", outline: "none", cursor: "pointer", color: "#f0f0f5", ...style }}>
{placeholder && <option value="" style={{ background: "#1a1145", color: "#f0f0f5" }}>{placeholder}</option>}
{options.map(function(o) {
var val = typeof o === "string" ? o : o.value;
var label = typeof o === "string" ? o : o.label;
return <option key={val} value={val} style={{ background: "#1a1145", color: "#f0f0f5" }}>{label}</option>;
})}
</select>
);
}

function Inp({ value, onChange, placeholder, style, type, className }) {
return (
<input type={type || "text"} value={value} onChange={function(e) { onChange(e.target.value); }} placeholder={placeholder}
  onFocus={function(e) { e.target.style.borderColor = "#0071E3"; e.target.style.boxShadow = "0 0 0 3px rgba(0,113,227,0.25)"; }}
  onBlur={function(e) { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
  className={className}
  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", transition: "border-color 0.15s, box-shadow 0.15s", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "#f0f0f5", ...style }} />
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
  style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
  onClick={onClose}>
<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.9 }}
  transition={{ type: "spring", stiffness: 300, damping: 25 }}
  onClick={function(e) { e.stopPropagation(); }}
  className={className}
  style={{ background: "rgba(30,25,50,0.92)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", borderRadius: 22, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.10)" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
<h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.4, color: "#f0f0f5" }}>{title}</h3>
<button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 99, background: "rgba(255,255,255,0.10)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.55)" }}>✕</button>
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
      ref.current.style.transform = "scale(1.15)";
      ref.current.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
      setTimeout(function() { if (ref.current) ref.current.style.transform = "scale(1)"; }, 300);
    }
    prevValue.current = value;
  }, [value]);
  return <span ref={ref} style={{ display: "inline-block", color: color }}>{value}</span>;
}

function StatCard({ label, value, sub, color, className }) {
var c = color || "#f0f0f5";
return (
<Card style={{ flex: 1, minWidth: 130, padding: "18px 20px" }} className={className}>
<div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
<div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}><AnimatedCounter value={value} color={c} /></div>
{sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 5 }}>{sub}</div>}
</Card>
);
}

export { Badge, Card, Btn, Sel, Inp, Modal, StatCard };
