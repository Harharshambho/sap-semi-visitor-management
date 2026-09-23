<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAP Semi Pvt Ltd | Visitor Management</title>
<link rel="stylesheet" href="/styles.css">
</head>

<body>

<header class="topbar">
  <div class="brand">
    <img src="/logo.png" alt="SAP Semi logo">
    <div>
      <strong>SAP Semi Pvt Ltd</strong>
      <span>Visitor Management System</span>
    </div>
  </div>

  <div class="top-actions">
    <button class="btn secondary" onclick="showPage('entry')">
      + New Visitor
    </button>

    <button class="btn" onclick="showPage('adminLogin')">
      Login
    </button>
  </div>
</header>


<main>

<!-- =========================================
     VISITOR ENTRY / USER DASHBOARD
========================================= -->

<section id="entry" class="page active">

  <div class="hero">
    <div>
      <h1>Visitor Check-In</h1>
      <p>
        Register every visitor before entry.
        <b>Photo is mandatory.</b>
      </p>
    </div>

    <div class="live-dot">
      <i></i> Live Dashboard
    </div>
  </div>


  <div class="grid-2">

    <!-- VISITOR FORM -->

    <form id="visitorForm" class="card form-card">

      <h2>Visitor Details</h2>

      <div class="fields">

        <label>
          Visitor Name *
          <input
            name="name"
            required
            placeholder="Enter full name"
          >
        </label>

        <label>
          Mobile Number *
          <input
            name="mobile"
            required
            inputmode="tel"
            placeholder="10 digit mobile number"
          >
        </label>

        <label>
          Company / Firm
          <input
            name="company"
            placeholder="Company name"
          >
        </label>

        <label>
          Person to Meet *
          <input
            name="person_to_meet"
            required
            placeholder="Employee / department"
          >
        </label>

        <label>
          Purpose of Visit *
          <input
            name="purpose"
            required
            placeholder="Meeting, delivery, interview..."
          >
        </label>

        <label>
          Vehicle Number
          <input
            name="vehicle_no"
            placeholder="MH12AB1234"
          >
        </label>

      </div>


      <!-- PHOTO -->

      <div class="photo-box">

        <div class="photo-preview">
          <span id="photoHint">
            📷 Photo required
          </span>

          <img
            id="photoPreview"
            hidden
            alt="Visitor photo"
          >
        </div>

        <div class="photo-controls">

          <label class="btn secondary file-btn">
            Take / Select Photo

            <input
              id="photo"
              type="file"
              name="photo"
              accept="image/*"
              capture="user"
              required
            >
          </label>

          <small>
            Photo is compulsory. Max 5 MB.
          </small>

        </div>

      </div>


      <button
        class="btn primary wide"
        type="submit"
      >
        CHECK IN VISITOR
      </button>

      <div
        id="formMsg"
        class="message"
      ></div>

    </form>


    <!-- LIVE DASHBOARD -->

    <div class="card dashboard-card">

      <div class="card-head">

        <h2>Live Dashboard</h2>

        <span id="updated">
          Updating…
        </span>

      </div>


      <div class="stats">

        <div class="stat">
          <span>🟢</span>
          <b id="insideCount">0</b>
          <small>Currently Inside</small>
        </div>

        <div class="stat">
          <span>📅</span>
          <b id="todayCount">0</b>
          <small>Today's Visitors</small>
        </div>

        <div class="stat">
          <span>🔴</span>
          <b id="outCount">0</b>
          <small>Today's Check-outs</small>
        </div>

      </div>


      <h3>Currently Inside</h3>

      <div
        id="insideList"
        class="inside-list"
      ></div>

    </div>

  </div>

</section>


<!-- =========================================
     LOGIN
========================================= -->

<section id="adminLogin" class="page">

  <div class="center-wrap">

    <form
      id="loginForm"
      class="card login-card"
    >

      <img
        src="/logo.png"
        class="login-logo"
        alt="SAP Semi logo"
      >

      <h1>Login</h1>

      <p>
        Login according to your assigned role.
      </p>


      <label>
        Username

        <input
          id="username"
          required
          value="admin"
          autocomplete="username"
        >
      </label>


      <label>
        Password

        <input
          id="password"
          type="password"
          required
          autocomplete="current-password"
        >
      </label>


      <button
        class="btn primary wide"
        type="submit"
      >
        LOGIN
      </button>


      <div
        id="loginMsg"
        class="message"
      ></div>

    </form>

  </div>

</section>


<!-- =========================================
     ADMIN / SUPER ADMIN PANEL
========================================= -->

<section id="admin" class="page">

  <div class="hero">

    <div>

      <h1 id="panelTitle">
        Admin Panel
      </h1>

      <p id="panelSubtitle">
        Visitor history and management
      </p>

      <div
        id="loggedUserInfo"
        style="margin-top:8px;font-size:13px;color:#667085;"
      ></div>

    </div>


    <div class="top-actions">

      <button
        id="exportBtn"
        class="btn secondary"
        onclick="downloadCsv()"
      >
        Export CSV
      </button>

      <button
        class="btn danger"
        onclick="logout()"
      >
        Logout
      </button>

    </div>

  </div>


  <!-- =====================================
       SUPER ADMIN USER MANAGEMENT
  ====================================== -->

  <div
    id="superAdminPanel"
    style="display:none;"
  >

    <div class="card">

      <h2>Super Admin Control</h2>

      <p style="color:#667085;margin-top:-8px;">
        Manage Admin and User accounts.
      </p>


      <div
        class="fields"
        style="margin-top:18px;"
      >

        <label>
          Username

          <input
            id="newUsername"
            placeholder="Enter username"
          >
        </label>


        <label>
          Password

          <input
            id="newPassword"
            type="password"
            placeholder="Enter password"
          >
        </label>


        <label>
          Role

          <select
            id="newRole"
            style="border:1px solid #d0d5dd;border-radius:9px;padding:12px;font:inherit;background:#fff;"
          >
            <option value="user">
              User
            </option>

            <option value="admin">
              Admin
            </option>
          </select>

        </label>

      </div>


      <button
        class="btn primary"
        style="margin-top:16px;"
        onclick="createSystemUser()"
      >
        + CREATE USER / ADMIN
      </button>


      <div
        id="userManagementMsg"
        class="message"
      ></div>

    </div>


    <div
      class="card"
      style="margin-top:20px;"
    >

      <div class="card-head">

        <h2>System Users</h2>

        <button
          class="btn secondary"
          onclick="loadSystemUsers()"
        >
          Refresh
        </button>

      </div>


      <div class="table-wrap">

        <table>

          <thead>

            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th>Action</th>
            </tr>

          </thead>

          <tbody id="systemUsersBody">

            <tr>
              <td
                colspan="5"
                style="text-align:center;color:#667085;"
              >
                Loading users...
              </td>
            </tr>

          </tbody>

        </table>

      </div>

    </div>

  </div>


  <!-- =====================================
       VISITOR HISTORY
  ====================================== -->

  <div
    id="visitorHistoryPanel"
    class="card"
  >

    <div class="filters">

      <input
        id="search"
        placeholder="Search name, mobile, company..."
      >

      <input
        id="dateFilter"
        type="date"
      >

      <button
        class="btn primary"
        onclick="loadHistory()"
      >
        Search
      </button>

      <button
        class="btn secondary"
        onclick="clearFilters()"
      >
        Clear
      </button>

    </div>


    <div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>Photo</th>
            <th>Visitor</th>
            <th>Company</th>
            <th>Meeting With</th>
            <th>IN Time</th>
            <th>OUT Time</th>
            <th>Status</th>
            <th>Action</th>
          </tr>

        </thead>


        <tbody id="historyBody"></tbody>

      </table>

    </div>

  </div>

</section>


<!-- =========================================
     USER INFORMATION PANEL
========================================= -->

<section
  id="userPanel"
  class="page"
>

  <div class="hero">

    <div>

      <h1>User Dashboard</h1>

      <p>
        Visitor entry and today's visitor status
      </p>

      <div
        id="userLoggedInfo"
        style="margin-top:8px;font-size:13px;color:#667085;"
      ></div>

    </div>


    <div class="top-actions">

      <button
        class="btn secondary"
        onclick="showPage('entry')"
      >
        + New Visitor
      </button>

      <button
        class="btn danger"
        onclick="logout()"
      >
        Logout
      </button>

    </div>

  </div>


  <div class="grid-2">

    <div class="card">

      <h2>Visitor Entry</h2>

      <p style="color:#667085;">
        Use the New Visitor button above to register a visitor.
      </p>

      <button
        class="btn primary"
        onclick="showPage('entry')"
      >
        + REGISTER VISITOR
      </button>

    </div>


    <div class="card dashboard-card">

      <div class="card-head">

        <h2>Today's Status</h2>

        <span id="userUpdated">
          Live
        </span>

      </div>


      <div class="stats">

        <div class="stat">
          <span>🟢</span>
          <b id="userInsideCount">0</b>
          <small>Currently Inside</small>
        </div>

        <div class="stat">
          <span>📅</span>
          <b id="userTodayCount">0</b>
          <small>Today's Visitors</small>
        </div>

        <div class="stat">
          <span>🔴</span>
          <b id="userOutCount">0</b>
          <small>Today's Check-outs</small>
        </div>

      </div>

    </div>

  </div>

</section>

</main>


<footer>
  © 2026 SAP Semi Pvt Ltd |
  Visitor Management System |
  <b>Developed by Nilesh Joshi</b>
</footer>


<script src="/app.js"></script>


<!-- =========================================
     ROLE CONTROL
========================================= -->

<script>

(function(){

  const originalShowPage = window.showPage;

  window.showPage = function(id){

    const role =
      localStorage.getItem("sapAdminRole") || "";

    const username =
      localStorage.getItem("sapAdminUsername") || "";


    /*
     * If visitor entry is selected normally,
     * open entry page.
     */
    if(id === "entry"){

      document
        .querySelectorAll(".page")
        .forEach(x => x.classList.remove("active"));

      const entry =
        document.getElementById("entry");

      if(entry){
        entry.classList.add("active");
      }

      return;
    }


    /*
     * Login page
     */
    if(id === "adminLogin"){

      document
        .querySelectorAll(".page")
        .forEach(x => x.classList.remove("active"));

      document
        .getElementById("adminLogin")
        .classList.add("active");

      return;
    }


    /*
     * User role
     */
    if(
      role === "user" &&
      id === "admin"
    ){

      document
        .querySelectorAll(".page")
        .forEach(x => x.classList.remove("active"));

      document
        .getElementById("userPanel")
        .classList.add("active");

      document
        .getElementById("userLoggedInfo")
        .textContent =
        "Logged in as: " +
        username +
        " | Role: User";

      updateUserDashboard();

      return;
    }


    /*
     * Admin / Super Admin
     */
    if(id === "admin"){

      if(!localStorage.getItem("sapAdminToken")){

        document
          .querySelectorAll(".page")
          .forEach(x => x.classList.remove("active"));

        document
          .getElementById("adminLogin")
          .classList.add("active");

        return;
      }


      document
        .querySelectorAll(".page")
        .forEach(x => x.classList.remove("active"));

      document
        .getElementById("admin")
        .classList.add("active");


      const title =
        document.getElementById("panelTitle");

      const subtitle =
        document.getElementById("panelSubtitle");

      const info =
        document.getElementById("loggedUserInfo");

      const superPanel =
        document.getElementById("superAdminPanel");

      const exportBtn =
        document.getElementById("exportBtn");


      if(role === "super_admin"){

        title.textContent =
          "Super Admin Panel";

        subtitle.textContent =
          "Full system control and visitor management";

        info.textContent =
          "Logged in as: " +
          username +
          " | Role: Super Admin";

        superPanel.style.display =
          "block";

        exportBtn.style.display =
          "inline-block";

        loadSystemUsers();

      }
      else if(role === "admin"){

        title.textContent =
          "Admin Panel";

        subtitle.textContent =
          "Visitor history, reports and check-out";

        info.textContent =
          "Logged in as: " +
          username +
          " | Role: Admin";

        superPanel.style.display =
          "none";

        exportBtn.style.display =
          "inline-block";

      }
      else{

        /*
         * Unknown / missing role
         */
        document
          .getElementById("adminLogin")
          .classList.add("active");

        return;

      }


      if(typeof window.loadHistory === "function"){
        window.loadHistory();
      }

      return;
    }


    /*
     * For any other existing page,
     * use original function.
     */
    if(typeof originalShowPage === "function"){
      originalShowPage(id);
    }

  };


  /*
   * Create Admin / User
   */

  window.createSystemUser = async function(){

    const username =
      document
        .getElementById("newUsername")
        .value
        .trim();

    const password =
      document
        .getElementById("newPassword")
        .value;

    const role =
      document
        .getElementById("newRole")
        .value;

    const msg =
      document
        .getElementById("userManagementMsg");


    if(!username || !password){

      msg.textContent =
        "Username and password are required.";

      msg.style.color =
        "#b42318";

      return;
    }


    try{

      const r =
        await fetch(
          "/api/super-admin/users",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",

              "x-admin-token":
                localStorage.getItem(
                  "sapAdminToken"
                )
            },

            body:JSON.stringify({
              username,
              password,
              role
            })
          }
        );


      const d =
        await r.json();


      if(!r.ok){
        throw new Error(
          d.error ||
          "Could not create user."
        );
      }


      msg.textContent =
        "User created successfully.";

      msg.style.color =
        "#18723d";


      document
        .getElementById("newUsername")
        .value = "";

      document
        .getElementById("newPassword")
        .value = "";


      loadSystemUsers();

    }
    catch(err){

      msg.textContent =
        err.message;

      msg.style.color =
        "#b42318";

    }

  };


  /*
   * Load System Users
   */

  window.loadSystemUsers = async function(){

    const body =
      document
        .getElementById("systemUsersBody");


    try{

      const r =
        await fetch(
          "/api/super-admin/users",
          {
            headers:{
              "x-admin-token":
                localStorage.getItem(
                  "sapAdminToken"
                )
            }
          }
        );


      if(r.status === 401 ||
         r.status === 403){

        body.innerHTML =
          "<tr><td colspan='5' style='text-align:center;color:#b42318'>Access denied.</td></tr>";

        return;
      }


      const rows =
        await r.json();


      body.innerHTML =
        rows.length
        ?
        rows.map(u => `

          <tr>

            <td>${u.id}</td>

            <td>
              <b>${escapeHtml(u.username)}</b>
            </td>

            <td>
              <span class="badge ${
                u.role === "super_admin"
                ? "in"
                : u.role === "admin"
                ? "out"
                : ""
              }">
                ${escapeHtml(
                  u.role === "super_admin"
                  ? "SUPER ADMIN"
                  : u.role.toUpperCase()
                )}
              </span>
            </td>

            <td>
              ${
                u.created_at
                ? new Date(
                    u.created_at
                  ).toLocaleString(
                    "en-IN",
                    {
                      dateStyle:"short",
                      timeStyle:"short"
                    }
                  )
                : "-"
              }
            </td>

            <td>
              ${
                u.role === "super_admin"
                ?
                "—"
                :
                `<button
                  class="out-btn"
                  onclick="deleteSystemUser(${u.id})"
                >
                  DELETE
                </button>`
              }
            </td>

          </tr>

        `).join("")
        :
        `
          <tr>
            <td
              colspan="5"
              style="text-align:center;color:#667085;"
            >
              No users found.
            </td>
          </tr>
        `;

    }
    catch(err){

      body.innerHTML =
        `
        <tr>
          <td
            colspan="5"
            style="text-align:center;color:#b42318;"
          >
            Could not load users.
          </td>
        </tr>
        `;

    }

  };


  /*
   * Delete User / Admin
   */

  window.deleteSystemUser = async function(id){

    if(
      !confirm(
        "Are you sure you want to delete this account?"
      )
    ){
      return;
    }


    try{

      const r =
        await fetch(
          "/api/super-admin/users/" + id,
          {
            method:"DELETE",

            headers:{
              "x-admin-token":
                localStorage.getItem(
                  "sapAdminToken"
                )
            }
          }
        );


      const d =
        await r.json();


      if(!r.ok){

        alert(
          d.error ||
          "Could not delete user."
        );

        return;
      }


      loadSystemUsers();

    }
    catch(err){

      alert(
        "Could not delete user."
      );

    }

  };


  /*
   * User Dashboar
