import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyC5ae4urUVDbf_Cr5_l4PaCJFetOCXDpP8",
    authDomain: "fir-auth-learning2.firebaseapp.com",
    projectId: "fir-auth-learning2",
    storageBucket: "fir-auth-learning2.appspot.com",
    messagingSenderId: "359450158079",
    appId: "1:359450158079:web:d6381b7c014ed0ec887dca"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);