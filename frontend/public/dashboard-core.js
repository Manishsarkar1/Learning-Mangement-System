(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusMarkup(id) {
    return `<div class="status" id="${id}"></div>`;
  }

  function setStatus(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  function chartMarkup(points) {
    if (!points || points.length === 0) return `<div class="empty">No recent activity yet.</div>`;
    const max = Math.max(...points.map((point) => Number(point.count) || 0), 1);
    return `
      <div class="chart">
        ${points
          .map((point) => {
            const height = Math.max(8, Math.round(((Number(point.count) || 0) / max) * 140));
            return `<div class="bar"><span style="height:${height}px"></span><small>${escapeHtml(point.label)}</small></div>`;
          })
          .join("")}
      </div>
    `;
  }

  function statCards(stats) {
    return `
      <div class="grid cards">
        ${stats
          .map(
            (stat) => `
            <div class="card">
              <div class="kicker">${escapeHtml(stat.label)}</div>
              <div class="stat-value">${escapeHtml(stat.value)}</div>
              <div class="muted">${escapeHtml(stat.help || "")}</div>
            </div>
          `
          )
          .join("")}
      </div>
    `;
  }

  function topbar(profile) {
    return `
      <div class="topbar">
        <div>
          <h1>${escapeHtml(profile.name)}</h1>
          <p>${escapeHtml(profile.title || profile.role)}${profile.timezone ? ` · ${escapeHtml(profile.timezone)}` : ""}</p>
        </div>
        <div class="topbar-actions">
          <a class="btn-secondary" href="/profile.html">Profile</a>
          <button class="btn-secondary" id="logout-btn" type="button">Sign out</button>
        </div>
      </div>
    `;
  }

  function sidebar(profile, links) {
    return `
      <aside class="sidebar">
        <div class="brand">Learnly <small>${escapeHtml(profile.role)}</small></div>
        <div class="profile-chip">
          <strong>${escapeHtml(profile.name)}</strong>
          <span>${escapeHtml(profile.email)}</span>
        </div>
        <div class="nav-title">Navigate</div>
        ${links.map((link) => `<a class="nav-link" href="#${link.id}">${escapeHtml(link.label)}</a>`).join("")}
        <div class="nav-title">Quick links</div>
        <a class="nav-link" href="/course.html">Open course page</a>
        <a class="nav-link" href="/profile.html">Profile settings</a>
      </aside>
    `;
  }

  function renderLayout(app, profile, links, contentMarkup) {
    app.innerHTML = `
      <div class="shell">
        ${sidebar(profile, links)}
        <main class="main">
          ${topbar(profile)}
          ${contentMarkup}
        </main>
      </div>
    `;
    document.getElementById("logout-btn")?.addEventListener("click", () => window.Learnly.logout());
  }

  function renderTable(items, columns) {
    if (!items.length) return `<div class="empty">No records found.</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
                <tr>
                  ${columns.map((column) => `<td>${column.render(item)}</td>`).join("")}
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function paginationControls(kind, pagination) {
    return `
      <div class="actions" style="margin-top:14px;">
        <button class="btn-secondary" type="button" data-page-kind="${kind}" data-page-dir="-1" ${pagination.page <= 1 ? "disabled" : ""}>Previous</button>
        <span class="muted">Page ${pagination.page} of ${pagination.totalPages}</span>
        <button class="btn-secondary" type="button" data-page-kind="${kind}" data-page-dir="1" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;
  }

  window.LearnlyDash = {
    escapeHtml,
    statusMarkup,
    setStatus,
    chartMarkup,
    statCards,
    renderLayout,
    renderTable,
    paginationControls,
  };
})();
