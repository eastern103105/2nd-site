import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCW4NbNdOkfs-lPSNFDyNqRTCPYimL7rks",
    authDomain: "eastern-wordtest.firebaseapp.com",
    projectId: "eastern-wordtest",
    storageBucket: "eastern-wordtest.firebasestorage.app",
    messagingSenderId: "908358368350",
    appId: "1:908358368350:web:18a2197cf035fb118088cf",
    measurementId: "G-WHCV2L49WK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("Client SDK Init");

try {
    const q = query(collection(db, "academies"), limit(1));
    const querySnapshot = await getDocs(q);
    console.log("Client SDK Read Success. Docs:", querySnapshot.size);
} catch (e) {
    console.error("Client SDK Error Code:", e.code);
    console.error("Client SDK Error Msg:", e.message);
}
