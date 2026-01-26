import React, { useEffect } from 'react';
import { database, ref, onValue, isFirebaseInitialized, testFirebaseConnection } from '../firebase';

const FirebaseDebug = () => {
  useEffect(() => {
    console.log("=== FIREBASE DEBUG ===");
    console.log("Firebase initialized:", isFirebaseInitialized);

    // Test the connection
    const isConnected = testFirebaseConnection();
    console.log("Connection test result:", isConnected);

    if (isConnected && database) {
      console.log("Testing database connection...");

      const rootRef = ref(database);
      const unsubscribe = onValue(
        rootRef,
        (snapshot) => {
          const data = snapshot.val();
          console.log("✅ Database connection successful!");
          console.log("Data received:", data);
          unsubscribe();
        },
        (error) => {
          console.error("❌ Database connection failed:", error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
        }
      );

      return () => unsubscribe();
    }
  }, []);

  return (
    <div style={{ padding: '20px', background: '#f0f0f0', margin: '20px', borderRadius: '10px' }}>
      <h3>Firebase Debug Info</h3>
      <p><strong>Status:</strong> {isFirebaseInitialized ? '✅ Connected' : '❌ Not Connected'}</p>
      <p><strong>Project ID:</strong> iot-airquality-9f42d</p>
      <p><strong>Database URL:</strong> https://iot-airquality-9f42d-default-rtdb.asia-southeast1.firebasedatabase.app</p>
      <p>Check browser console (F12) for detailed connection info</p>
    </div>
  );
};

export default FirebaseDebug;