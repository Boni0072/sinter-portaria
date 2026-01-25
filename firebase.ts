import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyBmqSn3ZzGS2Rc4MIaL4Blg4XJ4hgCplmE",
  authDomain: "nucleo-c2ecb.firebaseapp.com",
  databaseURL: "https://nucleo-c2ecb-default-rtdb.firebaseio.com",
  projectId: "nucleo-c2ecb",
  storageBucket: "nucleo-c2ecb.firebasestorage.app",
  messagingSenderId: "589108994631",
  appId: "1:589108994631:web:197e97a41737e5bc568762"
};

// DEBUG: Verificar qual configuração está sendo carregada
console.log("🔥 Firebase Config Carregada. ProjectId:", firebaseConfig.projectId);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

if (import.meta.env.DEV) {
  console.log("Rodando em ambiente local (Desenvolvimento)");
}

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