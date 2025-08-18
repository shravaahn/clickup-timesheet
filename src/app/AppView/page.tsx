{/* APP VIEW */}
<div id="app" className="card" hidden>
  <header>
    <div className="brand">
      <div className="logo">TT</div>
      <div>
        <div style={{ fontWeight: 800 }}>Time Tracking</div>
        <div className="muted" id="weekLabel"></div>
      </div>
    </div>

    <div className="controls">
      <span id="userBadge" className="role-badge"></span>
      <span
        id="viewingBadge"
        className="role-badge"
        style={{ display: "none" }}
      ></span>

      <button id="prevWeek" className="ghost">◀ Prev</button>
      <button id="thisWeek" className="ghost" title="Jump to current week">
        This Week
      </button>
      <button id="nextWeek" className="ghost">Next ▶</button>
      <button id="addRow" className="">+ Add Project</button>
      <button id="saveAll" className="success">Save</button>
      <button id="exportCsv" className="">Export CSV</button>
      <button id="logout" className="warn">Log out</button>
    </div>
  </header>
</div>
