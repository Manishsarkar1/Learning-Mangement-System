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
  localStorage.setItem("learnly_token", token);

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
}

window.LearnlyAuth = {
  $,
  setStatus,
  apiPostJson,
  saveToken,
  loadToken,
  clearToken,
};
