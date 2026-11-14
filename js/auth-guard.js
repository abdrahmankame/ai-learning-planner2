import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/pages/login.html";
  } else {
    document.body.dataset.ready = "true";
  }
});