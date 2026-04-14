function $(selector) {
  return document.querySelector(selector);
}

function setStatus(message, type) {
  const el = $("#status");
  if (!el) return;
  el.textContent = message || "";
  el.dataset.type = type || "";
}

async function apiPostJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch (error) {
    const err = new Error("Unable to reach the server. Make sure the app is running on http://localhost:5000.");
    err.cause = error;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function saveToken(token) {
  localStorage.removeItem("learnly_token");
  sessionStorage.setItem("learnly_session_hint", token ? "1" : "0");

  if (window.location.pathname === "/signin.html") {
    window.setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 300);
  }
}

function loadToken() {
  return localStorage.getItem("learnly_token");
}

function clearToken() {
  localStorage.removeItem("learnly_token");
  sessionStorage.removeItem("learnly_session_hint");
}

function bindSignInForm() {
  const form = $("#login-form");
  const submit = $("#submit");
  const logout = $("#logout");
  const email = $("#email");
  const password = $("#password");
  const tokenBox = $("#token-box");
  const tokenText = $("#token-text");

  if (!form || form.dataset.learnlyBound === "1") return;
  form.dataset.learnlyBound = "1";
  form.setAttribute("method", "post");
  form.setAttribute("action", "/signin.html");

  function renderToken() {
    if (!tokenBox || !tokenText) return;
    const token = loadToken();
    if (!token) {
      tokenBox.style.display = "none";
      tokenText.textContent = "";
      return;
    }
    tokenBox.style.display = "block";
    tokenText.textContent = token;
  }

  if (logout) {
    logout.addEventListener("click", () => {
      clearToken();
      setStatus("Saved token cleared.", "ok");
      renderToken();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", "");

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Signing in...";
    }

    try {
      const data = await apiPostJson("/api/auth/login", {
        email: email ? email.value.trim().toLowerCase() : "",
        password: password ? password.value : "",
      });
      saveToken(data.token);
      setStatus("Signed in. Redirecting...", "ok");
      renderToken();
    } catch (err) {
      setStatus(err.message || "Login failed", "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Sign in";
      }
    }
  });

  renderToken();
}

function bindSignUpForm() {
  const form = $("#signup-form");
  const submit = $("#submit");
  const name = $("#name");
  const email = $("#email");
  const password = $("#password");
  const role = $("#role");

  if (!form || form.dataset.learnlyBound === "1") return;
  form.dataset.learnlyBound = "1";
  form.setAttribute("method", "post");
  form.setAttribute("action", "/signup.html");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", "");

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Creating...";
    }

    try {
      await apiPostJson("/api/auth/register", {
        name: name ? name.value.trim() : "",
        email: email ? email.value.trim().toLowerCase() : "",
        password: password ? password.value : "",
        role: role ? role.value : "student",
      });
      setStatus("Account created. Redirecting to sign in...", "ok");
      window.setTimeout(() => {
        window.location.href = "/signin.html";
      }, 700);
    } catch (err) {
      setStatus(err.message || "Signup failed", "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Create account";
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindSignInForm();
    bindSignUpForm();
  });
} else {
  bindSignInForm();
  bindSignUpForm();
}

window.LearnlyAuth = {
  $,
  setStatus,
  apiPostJson,
  saveToken,
  loadToken,
  clearToken,
};
