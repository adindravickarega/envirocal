import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBXeQ0D_WAmQkFUfs-Lh2pV_JWeJr6Ep5o", // Your actual API key here
  authDomain: "iot-airquality-9f42d.firebaseapp.com",
  databaseURL: "https://iot-airquality-9f42d-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-airquality-9f42d",
  storageBucket: "iot-airquality-9f42d.firebasestorage.app",
  messagingSenderId: "646514051384",
  appId: "1:646514051384:web:3e2841c2f5d9a206c459cd"
};

// Initialize Firebase
let app;
let database;
let isFirebaseInitialized = false;

try {
  console.log("🔄 Initializing Firebase...");
  console.log("Project ID:", firebaseConfig.projectId);
  console.log("Database URL:", firebaseConfig.databaseURL);

  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
  isFirebaseInitialized = true;

  console.log("✅ Firebase initialized successfully!");
} catch (error) {
  console.error("❌ Firebase initialization error:", error);
}

// Export everything properly
export {
  database,
  ref,
  onValue,
  isFirebaseInitialized
};

// Export a test function
export const testFirebaseConnection = () => {
  return isFirebaseInitialized;
};

// Export the config for debugging
export const getFirebaseConfig = () => {
  return { ...firebaseConfig, apiKey: "***hidden***" };
};