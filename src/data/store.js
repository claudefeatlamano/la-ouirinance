import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

var firebaseConfig = {
  apiKey: "AIzaSyCv5Rtux-734LhoBW5H07duvYeMC5HQoBA",
  authDomain: "la-ouirinance.firebaseapp.com",
  projectId: "la-ouirinance",
  storageBucket: "la-ouirinance.firebasestorage.app",
  messagingSenderId: "372728638985",
  appId: "1:372728638985:web:b3b7be83f87679641292d8",
};
var fbApp = initializeApp(firebaseConfig);
var db = getFirestore(fbApp);

var STORAGE_KEYS = { team: "agency-team-v4", cars: "agency-cars-v4", contracts: "agency-contracts-v3", dailyPlan: "agency-daily-plan-v4", objectives: "agency-objectives-v3", groups: "agency-groups-v1", proxadCredentials: "agency-proxad-creds-v1" };

var store = {
get: async function(key) { try { var snap = await getDoc(doc(db, "agency", key)); return snap.exists() ? snap.data().data : null; } catch(e) { return null; } },
set: async function(key, val) { try { await setDoc(doc(db, "agency", key), { data: val }); } catch(e) { console.error(e); } },
delete: async function(key) { try { await deleteDoc(doc(db, "agency", key)); } catch(e) {} },
};

export { db, store, STORAGE_KEYS, doc, getDoc, onSnapshot };
