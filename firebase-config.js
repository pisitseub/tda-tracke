// 1) Paste your Firebase web app config here (Firebase console > Project settings > Your apps > Web).
//    This config is NOT secret; security comes from firestore.rules.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtYQdn2Y4BxqxFUCp8GHp3P_zgTdQ28Xg",
  authDomain: "tda-tracke.firebaseapp.com",
  projectId: "tda-tracke",
  appId: "1:138084165868:web:6594f3eff588b6e6809dc9"
};
// 2) Login provider: "google" or "microsoft"
window.AUTH_PROVIDER = "google";
// 3) Only accounts from this email domain may enter (also enforce it in firestore.rules)
window.ALLOWED_DOMAIN = "";
// 4) The department head (sees Team Overview + Annual Report). Must match firestore.rules.
window.HEAD_EMAILS = ["pisit.seub@gmail.com"];

