import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBMwRpnw0zmOxkV661V5ByvWGf64GhjEsw",
  authDomain: "proof-app-97cb0.firebaseapp.com",
  projectId: "proof-app-97cb0",
  storageBucket: "proof-app-97cb0.firebasestorage.app",
  messagingSenderId: "582557455243",
  appId: "1:582557455243:web:2c11ea8d53a343a99ad58e",
  measurementId: "G-ZZS7LDWRRC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

export default app;
