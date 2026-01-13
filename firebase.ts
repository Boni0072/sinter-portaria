import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyADCFbfdeU9y5Di1QfNdnAUtTa6ssNinoU",
  authDomain: "cc-contrutora.firebaseapp.com",
  databaseURL: "https://cc-contrutora-default-rtdb.firebaseio.com",
  projectId: "cc-contrutora",
  storageBucket: "cc-contrutora.firebasestorage.app",
  messagingSenderId: "147600323206",
  appId: "1:147600323206:web:92562d36d924f1c3341707"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Interfaces mantidas para compatibilidade
export interface Driver {
  id: string;
  name: string;
  document: string;
  phone?: string;
  signature_url?: string;
  created_by?: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  color?: string;
  driver_id?: string;
  created_at: string;
}

export interface Entry {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
  entry_time: string;
  exit_time?: string;
  vehicle_photo_url?: string;
  plate_photo_url?: string;
  notes?: string;
  registered_by?: string;
  exit_registered_by?: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: string;
}