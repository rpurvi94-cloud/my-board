import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC29B6o50PpYzYQ8cAPJKa8icSwAIPPYnc",
  authDomain: "my-board-eda19.firebaseapp.com",
  projectId: "my-board-eda19",
  storageBucket: "my-board-eda19.firebasestorage.app",
  messagingSenderId: "1029851114948",
  appId: "1:1029851114948:web:a94018caf39e11343f4891",
  measurementId: "G-0JL5W5B9JQ"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
