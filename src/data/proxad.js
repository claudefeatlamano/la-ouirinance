var PROXAD_BASE = "https://proxad-proxy.olaskurt.workers.dev/";

function proxadHeaders(credentials) {
  return {
    "Authorization": "Basic " + btoa(credentials.login + ":" + credentials.password),
    "Content-Type": "application/json"
  };
}

function proxadFetch(endpoint, method, body, credentials) {
  var opts = {
    method: method || "GET",
    headers: proxadHeaders(credentials)
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(PROXAD_BASE + endpoint, opts).then(function(r) {
    if (!r.ok) throw new Error("Proxad HTTP " + r.status);
    return r.json();
  });
}

function searchCommune(name, credentials) {
  return proxadFetch("v1/search/commune", "POST", { search: name.toUpperCase().trim() }, credentials);
}

function getProxadUsers(credentials) {
  return proxadFetch("v1/user", "GET", null, credentials);
}

function affectCommune(communeIds, userIds, credentials) {
  return proxadFetch("v1/commune/affectation/create", "POST", {
    commune_id: communeIds,
    user_id: userIds
  }, credentials);
}

function matchMemberToProxadUser(memberName, proxadUsers) {
  var parts = memberName.toLowerCase().split(" ");
  return proxadUsers.find(function(pu) {
    var pName = (pu.nom_complet || "").toLowerCase();
    return parts.every(function(part) {
      return pName.indexOf(part) >= 0;
    });
  }) || null;
}

export { searchCommune, getProxadUsers, affectCommune, matchMemberToProxadUser };
