(function () {
  const app = document.getElementById("app");

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

  function markup(user) {
    return `
      <div class="page" style="max-width:980px;margin:0 auto;">
        <div class="card" style="margin-bottom:20px;">
          <div class="actions" style="justify-content:space-between;">
            <div>
              <h2 style="margin:0 0 6px;">Profile settings</h2>
              <div class="muted">${escapeHtml(user.email)} · ${escapeHtml(user.role)}</div>
            </div>
            <div class="actions">
              <a class="btn-secondary" href="/dashboard.html">Dashboard</a>
              <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
            </div>
          </div>
        </div>

        <div class="grid two">
          <div class="card">
            <div class="card-header"><h2>Personal details</h2></div>
            <form id="profile-form" class="stack">
              <div class="field"><label>Name</label><input name="name" value="${escapeHtml(user.name)}" required /></div>
              <div class="field"><label>Title</label><input name="title" value="${escapeHtml(user.profile.title)}" /></div>
              <div class="field"><label>Bio</label><textarea name="bio">${escapeHtml(user.profile.bio)}</textarea></div>
              <div class="row">
                <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(user.profile.phone)}" /></div>
                <div class="field"><label>Timezone</label><input name="timezone" value="${escapeHtml(user.profile.timezone)}" /></div>
              </div>
              <div class="field"><label>Avatar URL</label><input name="avatarUrl" value="${escapeHtml(user.profile.avatarUrl)}" /></div>
              <button class="btn" type="submit">Save profile</button>
              <div class="status" id="profile-status"></div>
            </form>
          </div>

          <div class="stack">
            <div class="card">
              <div class="card-header"><h2>Change password</h2></div>
              <form id="password-form" class="stack">
                <div class="field"><label>Current password</label><input name="currentPassword" type="password" required /></div>
                <div class="field"><label>New password</label><input name="newPassword" type="password" required /></div>
                <button class="btn" type="submit">Update password</button>
                <div class="status" id="password-status"></div>
              </form>
            </div>

            <div class="card">
              <div class="card-header"><h2>Need account recovery?</h2></div>
              <p class="muted">If you forget your password later, use the built-in recovery flow.</p>
              <a class="btn-secondary" href="/forgot-password.html">Open password recovery</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    try {
      const me = await window.Learnly.api("/api/profile");
      app.innerHTML = markup(me.user);
      document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());

      document.getElementById("profile-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("profile-status", "", "");
        try {
          await window.Learnly.api("/api/profile", {
            method: "PATCH",
            json: {
              name: form.name.value.trim(),
              title: form.title.value.trim(),
              bio: form.bio.value.trim(),
              phone: form.phone.value.trim(),
              timezone: form.timezone.value.trim(),
              avatarUrl: form.avatarUrl.value.trim(),
            },
          });
          setStatus("profile-status", "Profile saved.", "ok");
        } catch (error) {
          setStatus("profile-status", error.message || "Unable to save profile", "error");
        }
      });

      document.getElementById("password-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setStatus("password-status", "", "");
        try {
          await window.Learnly.api("/api/profile/password", {
            method: "POST",
            json: { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value },
          });
          form.reset();
          setStatus("password-status", "Password updated.", "ok");
        } catch (error) {
          setStatus("password-status", error.message || "Unable to update password", "error");
        }
      });
    } catch (error) {
      app.innerHTML = `<div class="page"><div class="card"><h2>Unable to load profile</h2><p class="muted">${escapeHtml(
        error.message || "Please sign in again."
      )}</p><a class="btn" href="/signin.html">Sign in</a></div></div>`;
    }
  }

  init();
})();
