(function () {
  function loadToken() {
    return localStorage.getItem("learnly_token");
  }

  function clearToken() {
    localStorage.removeItem("learnly_token");
    sessionStorage.removeItem("learnly_session_hint");
  }

  function decodeJwt(token) {
    try {
      const [, payload] = token.split(".");
      if (!payload) return null;
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  async function api(path, { method = "GET", json, form, auth = true } = {}) {
    const headers = {};
    let body = undefined;

    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }

    if (auth) {
      const token = loadToken();
      if (token) headers.authorization = token;
    }

    const res = await fetch(path, { method, headers, body, credentials: "same-origin" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout API errors and still clear local state.
    }
    clearToken();
    window.location.href = "/signin.html";
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function formatDate(value, options) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", options || { month: "short", day: "numeric", year: "numeric" });
  }

  window.Learnly = { loadToken, clearToken, decodeJwt, api, logout, qs, formatDate };
})();
