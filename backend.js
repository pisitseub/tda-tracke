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
  const provider = type => {
    if (type === "microsoft") {
      const p = new firebase.auth.OAuthProvider("microsoft.com");
      p.setCustomParameters({
        prompt: "select_account",
        tenant: "496ffcda-486d-4466-8256-db4b2138f12c"
      });
      return p;
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
      overlay.innerHTML = '<div style="background:#fff;color:#172033;padding:28px;border-radius:16px;max-width:360px;width:calc(100% - 32px);text-align:left"><h2 style="margin:0 0 6px;text-align:center">TDA Project Tracker</h2><p id="lm" style="color:#6b778c;font-size:.9rem;text-align:center">Enter your name, then choose a sign-in method.</p><label for="loginName" style="display:block;font-size:.82rem;font-weight:600;margin:14px 0 5px">Your name</label><input id="loginName" type="text" autocomplete="name" maxlength="80" placeholder="Enter your first and last name" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d9e2ef;border-radius:9px;font:inherit;margin-bottom:12px"><button id="googleLogin" style="width:100%;padding:11px 20px;border:0;border-radius:10px;background:#0284c7;color:#fff;font-size:1rem;cursor:pointer;margin-bottom:9px">Continue with Google</button><button id="microsoftLogin" style="width:100%;padding:11px 20px;border:0;border-radius:10px;background:#263445;color:#fff;font-size:1rem;cursor:pointer">Continue with Microsoft</button></div>';
      document.body.appendChild(overlay);
      const signIn = async type => {
        const button = overlay.querySelector(type === "microsoft" ? "#microsoftLogin" : "#googleLogin");
        const enteredName = overlay.querySelector("#loginName").value.trim();
        if (!enteredName) {
          overlay.querySelector("#lm").textContent = "Please enter your name before continuing.";
          overlay.querySelector("#loginName").focus();
          return;
        }
        button.disabled = true;
        try {
          const credential = await auth.signInWithPopup(provider(type));
          await credential.user.updateProfile({ displayName: enteredName });
          location.reload();
        } catch (e) {
          console.error("TDA Tracker sign-in error:", {
            provider: type,
            code: e && e.code,
            message: e && e.message,
            email: e && e.email,
            tenantId: "496ffcda-486d-4466-8256-db4b2138f12c"
          }, e);
          overlay.querySelector("#lm").textContent =
            "Sign-in failed: " + (e.code || "unknown error") +
            (e.message ? " — " + e.message : "");
        } finally {
          button.disabled = false;
        }
      };
      overlay.querySelector("#googleLogin").onclick = () => signIn("google");
      overlay.querySelector("#microsoftLogin").onclick = () => signIn("microsoft");
    }
    overlay.style.display = "grid";
    overlay.querySelector("#lm").textContent = msg || "Sign in with a verified Google or Microsoft account.";
  }

  auth.onAuthStateChanged(async u => {
    if (!u) {
      login("Enter your name, then choose Google or Microsoft.");
      return;
    }
    const email = String(u.email || "").toLowerCase();
    // Microsoft work accounts may authenticate successfully without Firebase
    // setting emailVerified=true. Trust the Microsoft OAuth provider identity.
    const isMicrosoft = (u.providerData || []).some(p => p.providerId === "microsoft.com");
    if (!u.emailVerified && !isMicrosoft) {
      await auth.signOut();
      login("Please use an account with a verified email address.");
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
      let customPhotoURL = "";
      try {
        const profile = await fs.collection("pjt").doc(u.uid).get();
        customPhotoURL = (profile.data() || {}).profilePhoto || "";
      } catch (e) {
        console.warn("TDA Tracker: could not load custom profile photo", e);
      }
      return {
        id: u.uid,
        name: u.displayName || u.email,
        email: u.email,
        emailVerified: u.emailVerified,
        photoURL: customPhotoURL || u.photoURL || "",
        canEdit: isHead(u)
      };
    },
    updatePhoto: async dataUrl => {
      const u = await ready;
      if (!/^data:image\\/jpeg;base64,/.test(dataUrl)) {
        throw new Error("Please choose a valid image.");
      }
      if (dataUrl.length > 180000) {
        throw new Error("The compressed photo is too large. Please choose another image.");
      }
      await fs.collection("pjt").doc(u.uid).set({ profilePhoto: dataUrl }, { merge: true });
      return dataUrl;
    },
    isOwner: async () => isHead(await ready),
    signOut: async () => auth.signOut(),
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
          }, { merge: true });
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
