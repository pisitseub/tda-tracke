// Firebase Auth + Firestore adapter for TDA Project Tracker.
(function () {
  const C = window.FIREBASE_CONFIG;
  const H = (window.HEAD_EMAILS || []).map(s => String(s).trim().toLowerCase());
  const D = String(window.ALLOWED_DOMAIN || "").trim().toLowerCase();

  if (!C || !C.projectId) {
    console.error("TDA Tracker: Firebase configuration is missing.");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(C);

  const auth = firebase.auth();
  const fs = firebase.firestore();
  const names = {};
  const isHead = u => !!u && H.includes(String(u.email || "").toLowerCase());

  const provider = () => {
    if (window.AUTH_PROVIDER === "microsoft") {
      return new firebase.auth.OAuthProvider("microsoft.com");
    }
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    return p;
  };

  let resolveUser;
  const ready = new Promise(resolve => { resolveUser = resolve; });
  let overlay;

  function login(msg) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:99;background:rgba(10,22,38,.78);display:grid;place-items:center;font-family:system-ui,sans-serif";
      overlay.innerHTML = '<div style="background:#fff;color:#172033;padding:28px;border-radius:16px;max-width:340px;width:calc(100% - 32px);text-align:center"><h2 style="margin:0 0 6px">TDA Project Tracker</h2><p id="lm" style="color:#6b778c;font-size:.9rem"></p><button id="lb" style="padding:10px 20px;border:0;border-radius:10px;background:#0284c7;color:#fff;font-size:1rem;cursor:pointer">Continue with Google</button></div>';
      document.body.appendChild(overlay);
      overlay.querySelector("#lb").onclick = async () => {
        const button = overlay.querySelector("#lb");
        button.disabled = true;
        try {
          await auth.signInWithPopup(provider());
        } catch (e) {
          overlay.querySelector("#lm").textContent = "Sign-in failed: " + (e.code || "unknown error");
        } finally {
          button.disabled = false;
        }
      };
    }
    overlay.style.display = "grid";
    overlay.querySelector("#lm").textContent = msg || "Sign in with any verified Google account.";
  }

  auth.onAuthStateChanged(async u => {
    if (!u) {
      login("Sign in with any verified Google account.");
      return;
    }

    const email = String(u.email || "").toLowerCase();
    if (!u.emailVerified) {
      await auth.signOut();
      login("Please use a Google account with a verified email address.");
      return;
    }
    if (D && !email.endsWith("@" + D)) {
      await auth.signOut();
      login("Please use an @" + D + " account.");
      return;
    }

    if (overlay) overlay.style.display = "none";
    resolveUser(u);
  });

  const userApi = {
    me: async () => {
      const u = await ready;
      return {
        id: u.uid,
        name: u.displayName || u.email,
        email: u.email,
        emailVerified: u.emailVerified,
        canEdit: isHead(u)
      };
    },
    isOwner: async () => isHead(await ready),
    profiles: async ids => Object.fromEntries(ids.map(id => [id, { name: names[id] || "" }]))
  };

  const dbApi = {
    collection: path => ({
      onSnapshot: (cb, err) => fs.collection(path).onSnapshot(snapshot => {
        snapshot.docs.forEach(doc => {
          const name = doc.data().name;
          if (name) names[doc.id] = name;
        });
        cb(snapshot);
      }, err),
      doc: id => ({
        set: data => {
          const u = auth.currentUser;
          if (!u) return Promise.reject(new Error("Authentication required"));
          return fs.collection(path).doc(id).set({
            ...data,
            name: u.displayName || u.email
          });
        },
        onSnapshot: (cb, err) => fs.collection(path).doc(id).onSnapshot(cb, err)
      })
    })
  };

  const dlApi = {
    save: async ({ filename, data }) => {
      const type = filename.endsWith(".html") ? "text/html" : "text/csv";
      const url = URL.createObjectURL(new Blob([data], { type: type + ";charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  window.claude = { use: async name => ({ user: userApi, db: dbApi, downloads: dlApi })[name] };
})();
