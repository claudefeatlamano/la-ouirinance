import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { AGENCY_CONFIG, STORAGE_KEYS } from "./agencyConfig.js";

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

var store = {
get: async function(key) { try { var snap = await getDoc(doc(db, AGENCY_CONFIG.firestoreCollection, key)); return snap.exists() ? snap.data().data : null; } catch(e) { return null; } },
set: async function(key, val) { try { await setDoc(doc(db, AGENCY_CONFIG.firestoreCollection, key), { data: val }); } catch(e) { console.error(e); } },
delete: async function(key) { try { await deleteDoc(doc(db, AGENCY_CONFIG.firestoreCollection, key)); } catch(e) {} },
};

export { db, store, AGENCY_CONFIG, STORAGE_KEYS, doc, getDoc, onSnapshot };
