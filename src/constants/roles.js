var ROLES = ["Manager", "Assistant Manager", "Formateur", "Confirme", "Debutant"];
var ROLE_LABELS = { Manager: "Manager", "Assistant Manager": "Assist. Manager", Formateur: "Formateur", Confirme: "Confirme", Debutant: "Debutant" };
var ROLE_COLORS = { Manager: "#A59E8C", "Assistant Manager": "#8F8778", Formateur: "#4C5760", Confirme: "#93A8AC", Debutant: "#66635B" };
var OPERATORS = ["Bouygues", "Free"];
var OP_COLORS = { Bouygues: "#003DA5", Free: "#CD1E25" };

var DEPT_ZONES = {
"44": { b: true, f: "partial", l: "Loire-Atlantique" },
"35": { b: true, f: "partial", l: "Ille-et-Vilaine" },
"85": { b: true, f: true, l: "Vendee" },
"79": { b: true, f: true, l: "Deux-Sevres" },
"17": { b: false, f: true, l: "Charente-Maritime" },
"49": { b: true, f: false, l: "Maine-et-Loire" },
};

export { ROLES, ROLE_LABELS, ROLE_COLORS, OPERATORS, OP_COLORS, DEPT_ZONES };
