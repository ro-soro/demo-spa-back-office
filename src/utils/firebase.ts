import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { IS_DEMO_MODE } from "./demoMode";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// โหมด demo ต้องไม่เชื่อมต่อ Firebase เลยแม้จะมีคีย์อยู่ใน env (Why): กันไม่ให้คนที่ลองใช้เว็บ demo
// อ่านหรือเขียนฐานข้อมูลจริงได้ ทั้งระบบจะไปใช้ localStorage + ข้อมูลตัวอย่างใน db.ts แทน
const isFirebaseConfigured =
  !IS_DEMO_MODE &&
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// ป้องกันปัญหาการ Initialize App ซ้อนกันเมื่อทำ Hot-Reload ใน Next.js หรือรันในสภาพแวดล้อมเทส
const app = isFirebaseConfigured 
  ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())
  : null;

export const firestore = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export default app;
