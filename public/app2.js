let token = localStorage.getItem("sapAdminToken") || "";

const $ = id => document.getElementById(id);


/* =========================================
   PAGE CONTROL
========================================= */

function showPage(id) {

  document
    .querySelectorAll(".page")
    .forEach(x => x.classList.remove("active"));

  const page = $(id);

  if (!page) return;

  page.classList.add("active");

  if (id === "admin") {
    loadHistory();
  }

  if (id === "userPanel") {
    updateUserDashboard();
  }
}


/* =========================================
   MESSAGE
========================================= */

function msg(el, text, ok = false) {

  if (!el) return;

  el.textContent = text;

  el.style.color =
    ok ? "#18723d" : "#b42318";
}


/* =========================================
   VISITOR PHOTO PREVIEW
========================================= */

$("photo").addEventListener("change", e => {

  const f = e.target.files[0];

  if (!f) {

    $("photoPreview").hidden = true;
    $("photoHint").hidden = false;

    return;
  }


  if (f.size > 5 * 1024 * 1024) {

    e.target.value = "";

    msg(
      $("formMsg"),
      "Photo must be below 5 MB."
    );

    return;
  }


  $("photoPreview").src =
    URL.createObjectURL(f);

  $("photoPreview").hidden = false;
  $("photoHint").hidden = true;

});


/* =========================================
   VISITOR CHECK-IN
========================================= */

$("visitorForm").addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    const f =
      $("photo").files[0];


    if (!f) {

      msg(
        $("formMsg"),
        "Visitor photo is mandatory."
      );

      return;
    }


    const fd =
      new FormData(e.target);


    try {

      const r =
        await fetch(
          "/api/visitors",
          {
            method: "POST",
            body: fd
          }
        );


      const d =
        await r.json();


      if (!r.ok) {

        throw new Error(
          d.error ||
          "Could not save visitor."
        );

      }


      msg(
        $("formMsg"),
        "Visitor checked in successfully.",
        true
      );


      e.target.reset();

      $("photoPreview").hidden = true;
      $("photoHint").hidden = false;


      loadDashboard();
      updateUserDashboard();


    } catch (err) {

      msg(
        $("formMsg"),
        err.message
      );

    }

  }
);


/* =========================================
   LIVE DASHBOARD
========================================= */

async function loadDashboard() {

  try {

    const r =
      await fetch(
        "/api/dashboard"
      );


    const d =
      await r.json();


    if (!d.counts) return;


    $("insideCount").textContent =
      d.counts.inside || 0;


    $("todayCount").textContent =
      d.counts.today || 0;


    $("outCount").textContent =
      d.counts.checked_out || 0;


    $("updated").textContent =
      "Updated " +
      new Date().toLocaleTimeString();


    $("insideList").innerHTML =
      d.inside && d.inside.length
      ?
      d.inside.map(v => `

        <div class="person">

          <img
            src="${v.photo_url}"
            alt=""
          >

          <div>

            <b>
              ${esc(v.name)}
            </b>

            <small>
              ${esc(v.company || "")}
              · Meeting:
              ${esc(v.person_to_meet)}
              · IN
              ${time(v.in_time)}
            </small>

          </div>

        </div>

      `).join("")
      :
      "<p style='color:#667085'>No visitors currently inside.</p>";


  } catch (e) {

    if ($("updated")) {

      $("updated").textContent =
        "Connection issue";

    }

  }

}


setInterval(
  loadDashboard,
  3000
);

loadDashboard();


/* =========================================
   LOGIN
========================================= */

$("loginForm").addEventListener(
  "submit",
  async e => {

    e.preventDefault();


    try {

      const r =
        await fetch(
          "/api/admin/login",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({

              username:
                $("username").value.trim(),

              password:
                $("password").value

            })

          }
        );


      const d =
        await r.json();


      if (!r.ok) {

        throw new Error(
          d.error ||
          "Invalid username or password."
        );

      }


      token =
        d.token;


      localStorage.setItem(
        "sapAdminToken",
        token
      );


      localStorage.setItem(
        "sapAdminRole",
        d.role || "admin"
      );


      localStorage.setItem(
        "sapAdminUsername",
        d.username || ""
      );


      /*
       * ROLE BASED REDIRECT
       */

      if (
        d.role ===
        "super_admin"
      ) {

        showPage("admin");

      }
      else if (
        d.role ===
        "admin"
      ) {

        showPage("admin");

      }
      else if (
        d.role ===
        "user"
      ) {

        showPage("userPanel");

      }
      else {

        showPage("admin");

      }


    } catch (err) {

      msg(
        $("loginMsg"),
        err.message
      );

    }

  }
);


/* =========================================
   ADMIN VISITOR HISTORY
========================================= */

async function loadHistory() {

  if (!token) {

    showPage("adminLogin");

    return;
  }


  const p =
    new URLSearchParams();


  if (
    $("search") &&
    $("search").value
  ) {

    p.set(
      "q",
      $("search").value
    );

  }


  if (
    $("dateFilter") &&
    $("dateFilter").value
  ) {

    p.set(
      "date",
      $("dateFilter").value
    );

  }


  try {

    const r =
      await fetch(
        "/api/admin/visitors?" + p,
        {
          headers: {
            "x-admin-token":
              token
          }
        }
      );


    if (r.status === 401) {

      logout();

      return;
    }


    if (r.status === 403) {

      alert(
        "You do not have permission to view visitor history."
      );

      return;
    }


    const rows =
      await r.json();


    $("historyBody").innerHTML =
      rows.length
      ?
      rows.map(v => `

        <tr>

          <td>

            <img
              class="table-photo"
              src="${v.photo_url}"
              alt=""
            >

          </td>


          <td>

            <b>
              ${esc(v.name)}
            </b>

            <br>

            ${esc(v.mobile)}

          </td>


          <td>
            ${esc(v.company || "-")}
          </td>


          <td>
            ${esc(v.person_to_meet)}
          </td>


          <td>
            ${time(v.in_time)}
          </td>


          <td>
            ${
              v.out_time
              ? time(v.out_time)
              : "-"
            }
          </td>


          <td>

            <span
              class="badge ${v.status.toLowerCase()}"
            >
              ${v.status}
            </span>

          </td>


          <td>

            ${
              v.status === "IN"

              ?

              `<button
                class="out-btn"
                onclick="checkout(${v.id})"
              >
                CHECK OUT
              </button>`

              :

              "—"
            }

          </td>

        </tr>

      `).join("")

      :

      `
        <tr>

          <td
            colspan="8"
            style="text-align:center;color:#667085"
          >
            No visitors found.
          </td>

        </tr>
      `;


  } catch (err) {

    if ($("historyBody")) {

      $("historyBody").innerHTML = `

        <tr>

          <td
            colspan="8"
            style="text-align:center;color:#b42318"
          >
            Could not load visitor history.
          </td>

        </tr>

      `;

    }

  }

}


/* =========================================
   CHECK OUT VISITOR
========================================= */

async function checkout(id) {

  if (
    !confirm(
      "Check this visitor OUT?"
    )
  ) {

    return;
  }


  try {

    const r =
      await fetch(
        "/api/visitors/" +
        id +
        "/out",
        {
          method: "POST",

          headers: {
            "x-admin-token":
              token
          }
        }
      );


    const d =
      await r.json();


    if (!r.ok) {

      alert(
        d.error ||
        "Could not check out visitor."
      );

      return;
    }


    loadHistory();
    loadDashboard();
    updateUserDashboard();


  } catch (err) {

    alert(
      "Could not connect to server."
    );

  }

}


/* =========================================
   CSV DOWNLOAD
========================================= */

async function downloadCsv() {

  try {

    const r =
      await fetch(
        "/api/admin/export.csv",
        {
          headers: {
            "x-admin-token":
              token
          }
        }
      );


    if (r.status === 401) {

      alert(
        "Please login again."
      );

      logout();

      return;
    }


    if (r.status === 403) {

      alert(
        "You do not have permission to export data."
      );

      return;
    }


    if (!r.ok) {

      alert(
        "Could not download report."
      );

      return;
    }


    const blob =
      await r.blob();


    const a =
      document.createElement("a");


    a.href =
      URL.createObjectURL(blob);


    a.download =
      "sap-semi-visitors.csv";


    document.body.appendChild(a);

    a.click();

    a.remove();


    URL.revokeObjectURL(
      a.href
    );


  } catch (err) {

    alert(
      "Could not download report."
    );

  }

}


/* =========================================
   CLEAR FILTERS
========================================= */

function clearFilters() {

  if ($("search")) {
    $("search").value = "";
  }


  if ($("dateFilter")) {
    $("dateFilter").value = "";
  }


  loadHistory();

}


/* =========================================
   LOGOUT
========================================= */

async function logout() {

  if (token) {

    await fetch(
      "/api/admin/logout",
      {
        method: "POST",

        headers: {
          "x-admin-token":
            token
        }
      }
    ).catch(() => {});

  }


  token = "";


  localStorage.removeItem(
    "sapAdminToken"
  );


  localStorage.removeItem(
    "sapAdminRole"
  );


  localStorage.removeItem(
    "sapAdminUsername"
  );


  showPage(
    "adminLogin"
  );

}


/* =========================================
   SUPER ADMIN
   CREATE USER / ADMIN
========================================= */

async function createSystemUser() {

  const username =
    $("newUsername")
      .value
      .trim();


  const password =
    $("newPassword")
      .value;


  const role =
    $("newRole")
      .value;


  const result =
    $("userManagementMsg");


  if (!username || !password) {

    msg(
      result,
      "Username and password are required."
    );

    return;
  }


  if (
    password.length < 6
  ) {

    msg(
      result,
      "Password must be at least 6 characters."
    );

    return;
  }


  try {

    const r =
      await fetch(
        "/api/super-admin/users",
        {
          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "x-admin-token":
              token

          },

          body:
            JSON.stringify({

              username:
                username,

              password:
                password,

              role:
                role

            })

        }
      );


    const d =
      await r.json();


    if (!r.ok) {

      throw new Error(
        d.error ||
        "Could not create user."
      );

    }


    msg(
      result,
      "Account created successfully.",
      true
    );


    $("newUsername").value = "";
    $("newPassword").value = "";


    loadSystemUsers();


  } catch (err) {

    msg(
      result,
      err.message
    );

  }

}


/* =========================================
   SUPER ADMIN
   LOAD USERS
========================================= */

async function loadSystemUsers() {

  const body =
    $("systemUsersBody");


  if (!body) return;


  try {

    const r =
      await fetch(
        "/api/super-admin/users",
        {
          headers: {
            "x-admin-token":
              token
          }
        }
      );


    if (r.status === 401) {

      logout();

      return;
    }


    if (r.status === 403) {

      body.innerHTML = `

        <tr>

          <td
            colspan="5"
            style="text-align:center;color:#b42318"
          >
            Access denied.
          </td>

        </tr>

      `;

      return;
    }


    const rows =
      await r.json();


    body.innerHTML =
      rows.length

      ?

      rows.map(u => `

        <tr>

          <td>
            ${u.id}
          </td>


          <td>
            <b>
              ${esc(u.username)}
            </b>
          </td>


          <td>

            <span
              class="badge ${
                u.role === "super_admin"
                ? "in"
                : u.role === "admin"
                ? "out"
                : ""
              }"
            >

              ${
                u.role === "super_admin"
                ? "SUPER ADMIN"
                : u.role === "admin"
                ? "ADMIN"
                : "USER"
              }

            </span>

          </td>


          <td>

            ${
              u.created_at
              ?

              new Date(
                u.created_at
              ).toLocaleString(
                "en-IN",
                {
                  dateStyle:
                    "short",

                  timeStyle:
                    "short"
                }
              )

              :

              "-"
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
            style="text-align:center;color:#667085"
          >
            No users found.
          </td>

        </tr>

      `;


  } catch (err) {

    body.innerHTML = `

      <tr>

        <td
          colspan="5"
          style="text-align:center;color:#b42318"
        >
          Could not load users.
        </td>

      </tr>

    `;

  }

}


/* =========================================
   SUPER ADMIN
   DELETE USER / ADMIN
========================================= */

async function deleteSystemUser(id) {

  if (
    !confirm(
      "Are you sure you want to delete this account?"
    )
  ) {

    return;
  }


  try {

    const r =
      await fetch(
        "/api/super-admin/users/" +
        id,
        {
          method: "DELETE",

          headers: {
            "x-admin-token":
              token
          }
        }
      );


    const d =
      await r.json();


    if (!r.ok) {

      alert(
        d.error ||
        "Could not delete account."
      );

      return;
    }


    loadSystemUsers();


  } catch (err) {

    alert(
      "Could not delete account."
    );

  }

}


/* =========================================
   USER DASHBOARD
========================================= */

async function updateUserDashboard() {

  try {

    const r =
      await fetch(
        "/api/dashboard"
      );


    const d =
      await r.json();


    if (!d.counts) return;


    if ($("userInsideCount")) {

      $("userInsideCount").textContent =
        d.counts.inside || 0;

    }


    if ($("userTodayCount")) {

      $("userTodayCount").textContent =
        d.counts.today || 0;

    }


    if ($("userOutCount")) {

      $("userOutCount").textContent =
        d.counts.checked_out || 0;

    }


    if ($("userUpdated")) {

      $("userUpdated").textContent =
        "Updated " +
        new Date().toLocaleTimeString();

    }


  } catch (err) {

    if ($("userUpdated")) {

      $("userUpdated").textContent =
        "Connection issue";

    }

  }

}


/* =========================================
   TIME FORMAT
========================================= */

function time(x) {

  return x

    ?

    new Date(x).toLocaleString(
      "en-IN",
      {
        dateStyle: "short",
        timeStyle: "short"
      }
    )

    :

    "-";

}


/* =========================================
   HTML ESCAPE
========================================= */

function esc(x) {

  return String(
    x ?? ""
  ).replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

}


/* =========================================
   RESTORE LOGIN AFTER REFRESH
========================================= */

(function restoreLogin() {

  const savedToken =
    localStorage.getItem(
      "sapAdminToken"
    );


  const savedRole =
    localStorage.getItem(
      "sapAdminRole"
    );


  if (
    !savedToken ||
    !savedRole
  ) {

    return;

  }


  token =
    savedToken;


  if (
    savedRole ===
    "super_admin"
  ) {

    showPage(
      "admin"
    );

  }
  else if (
    savedRole ===
    "admin"
  ) {

    showPage(
      "admin"
    );

  }
  else if (
    savedRole ===
    "user"
  ) {

    showPage(
      "userPanel"
    );

  }

})();
