function statusColor(status) {
if (status === "Branché") return "#32CD32";
if (status === "RDV pris" || status === "Valide") return "#808000";
if (status === "Résilié") return "#B22222";
if (status === "RIB MANQUANT") return "#8B0000";
if (status === "Nouveau") return "#6E6E73";
if (status === "Postprod") return "#AF52DE";
return "#D97706";
}

function isCaduque(c) { return c.status === "RIB MANQUANT"; }

export { statusColor, isCaduque };
