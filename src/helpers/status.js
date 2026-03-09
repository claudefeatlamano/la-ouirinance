function statusColor(status) {
if (status === "Branché" || status === "Branché VRF" || status === "Branche") return "#32CD32";
if (status === "RDV pris" || status === "RDV pris J+7" || status === "Valide") return "#808000";
if (status === "Résilié" || status === "Annulé" || status === "Annule") return "#B22222";
if (status === "RIB MANQUANT") return "#8B0000";
if (status === "Nouveau") return "#6E6E73";
return "#D97706";
}

function isCaduque(c) { return c.status === "RIB MANQUANT"; }

export { statusColor, isCaduque };
