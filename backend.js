// Replaces the Claude artifact runtime (claude.use) with Firebase Auth + Firestore.
(function () {
  const C = window.FIREBASE_CONFIG, H = (window.HEAD_EMAILS || []).map(s => s.toLowerCase());
  const D = (window.ALLOWED_DOMAIN || "").toLowerCase();
  firebase.initializeApp(C);
  const auth = firebase.auth(), fs = firebase.firestore(), names = {};
  const isHead = u => !!u && H.includes((u.email || "").toLowerCase());
  const provider = () => window.AUTH_PROVIDER === "microsoft" ? new firebase.auth.OAuthProvider("microsoft.com") : new firebase.auth.GoogleAuthProvider();

  let resolveUser; const ready = new Promise(r => resolveUser = r);
  let overlay;
  function login(msg) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:99;background:rgba(10,22,38,.78);display:grid;place-items:center;font-family:system-ui,sans-serif";
      overlay.innerHTML = '<div style="background:#fff;color:#172033;padding:28px;border-radius:16px;max-width:340px;text-align:center"><h2 style="margin:0 0 6px">TDA Project Tracker</h2><p id="lm" style="color:#6b778c;font-size:.9rem"></p><button id="lb" style="padding:10px 20px;border:0;border-radius:10px;background:#0284c7;color:#fff;font-size:1rem;cursor:pointer">Sign in</button></div>';
      document.body.appendChild(overlay);
      overlay.querySelector("#lb").onclick = () => auth.signInWithPopup(provider()).catch(e => overlay.querySelector("#lm").textContent = "Sign-in failed: " + e.code);
    }
    overlay.style.display = "grid";
    overlay.querySelector("#lm").textContent = msg || "Sign in with your company account.";
  }
  auth.onAuthStateChanged(u => {
    if (!u) return login();
    if (D && !(u.email || "").toLowerCase().endsWith("@" + D)) { auth.signOut().then(() => login("Please use your @" + D + " account.")); return; }
    if (overlay) overlay.style.display = "none";
    resolveUser(u);
  });

  const userApi = {
    me: async () => { const u = await ready; return { id: u.uid, name: u.displayName || u.email, canEdit: isHead(u) }; },
    isOwner: async () => isHead(await ready),
    profiles: async ids => Object.fromEntries(ids.map(i => [i, { name: names[i] || "" }]))
  };
  const dbApi = {
    collection: path => ({
      onSnapshot: (cb, err) => fs.collection(path).onSnapshot(s => { s.docs.forEach(d => { const n = d.data().name; if (n) names[d.id] = n; }); cb(s); }, err),
      doc: id => ({
        set: data => { const u = auth.currentUser; return fs.collection(path).doc(id).set({ ...data, name: u.displayName || u.email }); },
        onSnapshot: (cb, err) => fs.collection(path).doc(id).onSnapshot(cb, err)
      })
    })
  };
  const dlApi = {
    save: async ({ filename, data }) => {
      const type = filename.endsWith(".html") ? "text/html" : "text/csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: type + ";charset=utf-8" }));
      a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
  };
  window.claude = { use: async n => ({ user: userApi, db: dbApi, downloads: dlApi })[n] };
})();
