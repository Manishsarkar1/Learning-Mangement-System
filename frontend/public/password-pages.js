(function () {
  const app = document.getElementById("app");
  const page = document.body.dataset.page;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  async function postJson(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
    return data;
  }

  function forgotMarkup() {
    return `
      <div class="page" style="max-width:520px;margin:0 auto;">
        <div class="card">
          <h2 style="margin-top:0;">Forgot password</h2>
          <p class="muted">Enter your email and we’ll generate a reset link for this local demo.</p>
          <form id="forgot-form" class="stack">
            <div class="field"><label>Email</label><input name="email" type="email" required /></div>
            <button class="btn" type="submit">Generate reset link</button>
            <div class="status" id="forgot-status"></div>
          </form>
          <div id="forgot-debug" class="stack" style="margin-top:14px;"></div>
          <div class="actions" style="margin-top:14px;"><a class="btn-secondary" href="/signin.html">Back to sign in</a></div>
        </div>
      </div>
    `;
  }

  function resetMarkup(token) {
    return `
      <div class="page" style="max-width:520px;margin:0 auto;">
        <div class="card">
          <h2 style="margin-top:0;">Reset password</h2>
          <p class="muted">Paste the reset token or use the generated reset link from the forgot-password page.</p>
          <form id="reset-form" class="stack">
            <div class="field"><label>Reset token</label><input name="token" value="${escapeHtml(token || "")}" required /></div>
            <div class="field"><label>New password</label><input name="password" type="password" required /></div>
            <button class="btn" type="submit">Update password</button>
            <div class="status" id="reset-status"></div>
          </form>
          <div class="actions" style="margin-top:14px;"><a class="btn-secondary" href="/signin.html">Back to sign in</a></div>
        </div>
      </div>
    `;
  }

  function initForgot() {
    app.innerHTML = forgotMarkup();
    document.getElementById("forgot-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = event.currentTarget.email.value.trim();
      setStatus("forgot-status", "", "");
      document.getElementById("forgot-debug").innerHTML = "";
      try {
        const data = await postJson("/api/auth/forgot-password", { email });
        setStatus("forgot-status", data.message || "Reset link generated.", "ok");
        if (data.debugResetUrl) {
          document.getElementById("forgot-debug").innerHTML = `
            <div class="card">
              <div class="muted">Local demo reset link</div>
              <a href="${escapeHtml(data.debugResetUrl)}">${escapeHtml(data.debugResetUrl)}</a>
              <div class="muted" style="margin-top:8px;">Token: <code>${escapeHtml(data.debugResetToken || "")}</code></div>
            </div>
          `;
        }
      } catch (error) {
        setStatus("forgot-status", error.message || "Unable to generate reset link", "error");
      }
    });
  }

  function initReset() {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    app.innerHTML = resetMarkup(token);
    document.getElementById("reset-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setStatus("reset-status", "", "");
      try {
        const data = await postJson("/api/auth/reset-password", { token: form.token.value.trim(), password: form.password.value });
        setStatus("reset-status", data.message || "Password updated. Redirecting…", "ok");
        setTimeout(() => {
          window.location.href = "/signin.html";
        }, 900);
      } catch (error) {
        setStatus("reset-status", error.message || "Unable to reset password", "error");
      }
    });
  }

  if (page === "forgot-password") initForgot();
  if (page === "reset-password") initReset();
})();
