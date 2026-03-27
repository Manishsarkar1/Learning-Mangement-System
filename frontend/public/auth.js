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
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

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

