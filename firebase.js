import admin from "firebase-admin";
import FIREBASE_SERVICE_ACCOUNT from "./firebase.key.json";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT),
  });
}

export default admin;
