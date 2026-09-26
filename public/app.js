let token = localStorage.getItem("sapAdminToken") || "";
const $ = id => document.getElementById(id);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function time(v) {
  return v
    ? new Date(v).toLocaleString("en-IN", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "-";
}

function msg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "#18723d" : "#b42318";
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));
  $(id)?.classList.add("active");
}

function authHeaders(extra = {}) {
  return Object.assign(
    {
      "x-admin-token": token
    },
    extra
  );
}


/* =========================================================
   PHOTO PREVIEW
========================================================= */

function previewFiles() {
  const grid = $("photoPreviewGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const fields = [
    ["visitor_photo", "Visitor"],
    ["vehicle_photo", "Vehicle"],
    ["invoice_photo", "Invoice"],
    ["id_photo", "ID"],
    ["material_photo", "Material"],
    ["document_photo", "Document"],
    ["other_photos", "Other"]
  ];

  let total = 0;

  for (const [id, label] of fields) {
    const input = document.querySelector(`[name="${id}"]`);

    for (const f of input?.files || []) {
      total++;

      if (f.size > 5 * 1024 * 1024) {
        input.value = "";
        msg(
          $("formMsg"),
          `${label} photo "${f.name}" is above 5 MB.`
        );
        return;
      }

      if (!f.type.startsWith("image/")) {
        input.value = "";
        msg(
          $("formMsg"),
          `${label} file "${f.name}" is not an image.`
        );
        return;
      }

      const img = document.createElement("img");

      img.src = URL.createObjectURL(f);
      img.alt = label;

      img.style.cssText =
        "width:100%;height:100px;object-fit:cover;border-radius:10px;border:1px solid #d0d5dd;";

      grid.appendChild(img);
    }
  }

  if (total > 10) {
    const other = document.querySelector('[name="other_photos"]');

    if (other) other.value = "";

    msg(
      $("formMsg"),
      "Maximum 10 photos are allowed."
    );
  }
}

document.addEventListener("change", e => {
  if (
    e.target.matches(
      '#visitorForm input[type="file"]'
    )
  ) {
    previewFiles();
  }
});


/* =========================================================
   VISITOR CHECK-IN FORM
========================================================= */

$("visitorForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  /*
    IMPORTANT FIX:
    token is a variable, not a function.
    Therefore use !token instead of !token()
  */

  if (!token) {
    showPage("adminLogin");
    return;
  }

  const fd = new FormData(e.target);

  let total = 0;

  for (const [k, v] of fd.entries()) {
    if (v instanceof File && v.size) {
      total++;
    }
  }

  /*
    Visitor photo is compulsory.
    Check specifically for visitor_photo.
  */

  const visitorPhotoInput =
    document.querySelector('[name="visitor_photo"]');

  if (
    !visitorPhotoInput ||
    !visitorPhotoInput.files ||
    visitorPhotoInput.files.length === 0
  ) {
    msg(
      $("formMsg"),
      "Visitor photo is mandatory."
    );
    return;
  }

  if (
    visitorPhotoInput.files[0].size >
    5 * 1024 * 1024
  ) {
    msg(
      $("formMsg"),
      "Visitor photo must be 5 MB or less."
    );
    return;
  }

  if (
    !visitorPhotoInput.files[0].type.startsWith("image/")
  ) {
    msg(
      $("formMsg"),
      "Visitor photo must be an image."
    );
    return;
  }

  if (total > 10) {
    msg(
      $("formMsg"),
      "Maximum 10 photos are allowed."
    );
    return;
  }

  try {
    msg(
      $("formMsg"),
      "Saving visitor details..."
    );

    const r = await fetch(
      "/api/visitors",
      {
        method: "POST",
        headers: authHeaders(),
        body: fd
      }
    );

    let d = {};

    try {
      d = await r.json();
    } catch {
      d = {};
    }

    if (!r.ok) {
      throw new Error(
        d.error ||
        `Could not save visitor. Server returned ${r.status}.`
      );
    }

    msg(
      $("formMsg"),
      `Visitor checked in successfully. ${d.photo_count ?? total} photo(s) saved.`,
      true
    );

    e.target.reset();

    if ($("photoPreviewGrid")) {
      $("photoPreviewGrid").innerHTML = "";
    }

    loadDashboard();
    updateUserDashboard();

  } catch (err) {

    console.error(
      "Visitor submit error:",
      err
    );

    msg(
      $("formMsg"),
      err.message ||
      "Could not save visitor."
    );
  }
});


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  if (!token) return;

  try {

    const r = await fetch(
      "/api/dashboard",
      {
        headers: authHeaders()
      }
    );

    if (r.status === 401) {
      logout();
      return;
    }

    if (!r.ok) return;

    const d = await r.json();

    if ($("insideCount")) {
      $("insideCount").textContent =
        d.counts?.inside || 0;
    }

    if ($("todayCount")) {
      $("todayCount").textContent =
        d.counts?.today || 0;
    }

    if ($("outCount")) {
      $("outCount").textContent =
        d.counts?.checked_out || 0;
    }

    if ($("updated")) {
      $("updated").textContent =
        "Updated " +
        new Date().toLocaleTimeString();
    }

    if ($("insideList")) {

      $("insideList").innerHTML =
        d.inside?.length
          ? d.inside.map(v => `
              <div class="person">
                <img src="${esc(v.photo_url || "")}" alt="">
                <div>
                  <b>${esc(v.name)}</b>

                  <small>
                    ${esc(v.company || "")}
                    · Meeting:
                    ${esc(v.person_to_meet)}
                    · IN ${time(v.in_time)}
                    <br>

                    Entry by:
                    ${esc(v.created_by_username || "-")}
                    (${esc(v.created_by_role || "-")})
                  </small>
                </div>
              </div>
            `).join("")

          : "<p style='color:#667085'>No visitors currently inside.</p>";
    }

  } catch (e) {
    console.error(
      "Dashboard error:",
      e
    );
  }
}

setInterval(
  loadDashboard,
  5000
);


/* =========================================================
   LOGIN
========================================================= */

$("loginForm")?.addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    try {

      const r = await fetch(
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

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error ||
          "Invalid username or password."
        );
      }

      token = d.token;

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

      showPage(
        d.role === "user"
          ? "userPanel"
          : "admin"
      );

      loadDashboard();
      updateUserDashboard();

    } catch (err) {

      msg(
        $("loginMsg"),
        err.message
      );
    }
  }
);


/* =========================================================
   VISITOR HISTORY
========================================================= */

async function loadHistory() {

  if (!token) return;

  const q =
    $("search")?.value.trim() || "";

  const date =
    $("dateFilter")?.value || "";

  try {

    const r = await fetch(
      `/api/admin/visitors?q=${encodeURIComponent(q)}&date=${encodeURIComponent(date)}`,
      {
        headers: authHeaders()
      }
    );

    if (r.status === 401) {
      logout();
      return;
    }

    if (!r.ok) {
      throw new Error(
        "Could not load history."
      );
    }

    const rows = await r.json();

    if (!$("historyBody")) return;

    $("historyBody").innerHTML =
      rows.length

        ? rows.map(v => `
            <tr>

              <td>
                <img
                  src="${esc(v.photo_url || "")}"
                  style="width:55px;height:55px;object-fit:cover;border-radius:8px"
                >
              </td>

              <td>
                <b>${esc(v.name)}</b>
                <br>
                <small>${esc(v.mobile)}</small>
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
                ${time(v.out_time)}
              </td>

              <td>
                <b>
                  ${esc(v.created_by_username || "-")}
                </b>

                <br>

                <small>
                  ${esc(v.created_by_role || "")}
                </small>

                <br>

                <small>
                  ${time(v.created_at)}
                </small>
              </td>

              <td>
                ${esc(v.status)}
              </td>

              <td>

                ${
                  v.status === "IN"

                    ? `
                      <button
                        class="btn danger"
                        onclick="checkoutVisitor(${v.id})"
                      >
                        CHECK OUT
                      </button>
                    `

                    : `
                      <button
                        class="btn secondary"
                        onclick="viewPhotos(${v.id})"
                      >
                        PHOTOS
                      </button>
                    `
                }

              </td>

            </tr>
          `).join("")

        : `
          <tr>
            <td
              colspan="9"
              style="text-align:center;color:#667085"
            >
              No records found.
            </td>
          </tr>
        `;

  } catch (e) {

    console.error(
      "History error:",
      e
    );

    if ($("historyBody")) {
      $("historyBody").innerHTML =
        `
          <tr>
            <td colspan="9">
              Could not load history.
            </td>
          </tr>
        `;
    }
  }
}


/* =========================================================
   CHECK OUT VISITOR
========================================================= */

async function checkoutVisitor(id) {

  if (
    !confirm(
      "Check out this visitor?"
    )
  ) {
    return;
  }

  try {

    const r = await fetch(
      `/api/visitors/${id}/out`,
      {
        method: "POST",
        headers: authHeaders()
      }
    );

    const d = await r.json();

    if (!r.ok) {
      throw new Error(
        d.error ||
        "Could not check out."
      );
    }

    loadHistory();
    loadDashboard();
    updateUserDashboard();

  } catch (e) {

    alert(
      e.message ||
      "Could not check out visitor."
    );
  }
}


/* =========================================================
   VIEW PHOTOS
========================================================= */

async function viewPhotos(id) {

  try {

    const r = await fetch(
      `/api/visitors/${id}/photos`,
      {
        headers: authHeaders()
      }
    );

    if (r.status === 401) {
      logout();
      return;
    }

    const rows = await r.json();

    if (!rows.length) {
      alert(
        "No photos found."
      );
      return;
    }

    const text =
      rows
        .map(
          (p, i) =>
            `${i + 1}. ${p.photo_label}`
        )
        .join("\n");

    alert(
      "Saved photos:\n\n" +
      text +
      "\n\nClick OK to open the first photo."
    );

    window.open(
      rows[0].photo_url,
      "_blank"
    );

  } catch (e) {

    alert(
      "Could not load photos."
    );
  }
}


/* =========================================================
   CSV DOWNLOAD
========================================================= */

async function downloadCsv() {

  try {

    const r = await fetch(
      "/api/admin/export.csv",
      {
        headers: authHeaders()
      }
    );

    if (!r.ok) {

      if (r.status === 401) {
        logout();
      } else {
        alert(
          "Could not download report."
        );
      }

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

  } catch (e) {

    alert(
      "Could not download report."
    );
  }
}


/* =========================================================
   FILTERS
========================================================= */

function clearFilters() {

  if ($("search")) {
    $("search").value = "";
  }

  if ($("dateFilter")) {
    $("dateFilter").value = "";
  }

  loadHistory();
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

  if (token) {

    await fetch(
      "/api/admin/logout",
      {
        method: "POST",
        headers: authHeaders()
      }
    ).catch(() => {});
  }

  token = "";

  [
    "sapAdminToken",
    "sapAdminRole",
    "sapAdminUsername"
  ].forEach(
    k => localStorage.removeItem(k)
  );

  showPage(
    "adminLogin"
  );
}


/* =========================================================
   CREATE SYSTEM USER
========================================================= */

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

  if (
    !username ||
    password.length < 6
  ) {

    msg(
      $("userManagementMsg"),
      "Username and 6+ character password are required."
    );

    return;
  }

  try {

    const r = await fetch(
      "/api/super-admin/users",
      {
        method: "POST",

        headers: authHeaders({
          "Content-Type":
            "application/json"
        }),

        body: JSON.stringify({
          username,
          password,
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
      $("userManagementMsg"),
      "User created successfully.",
      true
    );

    $("newUsername").value = "";
    $("newPassword").value = "";

    loadSystemUsers();

  } catch (e) {

    msg(
      $("userManagementMsg"),
      e.message
    );
  }
}


/* =========================================================
   SYSTEM USERS
========================================================= */

async function loadSystemUsers() {

  if (!token) return;

  try {

    const r = await fetch(
      "/api/super-admin/users",
      {
        headers: authHeaders()
      }
    );

    if (!r.ok) {

      if ($("systemUsersBody")) {
        $("systemUsersBody").innerHTML =
          "<tr><td colspan='5'>Access denied.</td></tr>";
      }

      return;
    }

    const rows =
      await r.json();

    if (!$("systemUsersBody")) return;

    $("systemUsersBody").innerHTML =
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
            ${esc(u.role)}
          </td>

          <td>
            ${time(u.created_at)}
          </td>

          <td>

            ${
              u.id ===
              Number(
                localStorage.getItem(
                  "sapCurrentUserId"
                )
              )

                ? "Current"

                : `
                  <button
                    class="btn danger"
                    onclick="deleteSystemUser(${u.id})"
                  >
                    Delete
                  </button>
                `
            }

          </td>

        </tr>

      `).join("");

  } catch (e) {

    console.error(
      "System users error:",
      e
    );
  }
}


/* =========================================================
   DELETE SYSTEM USER
========================================================= */

async function deleteSystemUser(id) {

  if (
    !confirm(
      "Delete this user?"
    )
  ) {
    return;
  }

  try {

    const r = await fetch(
      `/api/super-admin/users/${id}`,
      {
        method: "DELETE",
        headers: authHeaders()
      }
    );

    const d =
      await r.json();

    if (!r.ok) {

      alert(
        d.error ||
        "Could not delete user."
      );

      return;
    }

    loadSystemUsers();

  } catch (e) {

    alert(
      "Could not delete user."
    );
  }
}


/* =========================================================
   USER DASHBOARD
========================================================= */

async function updateUserDashboard() {

  if (!token) return;

  try {

    const r = await fetch(
      "/api/dashboard",
      {
        headers: authHeaders()
      }
    );

    if (r.status === 401) {
      logout();
      return;
    }

    if (!r.ok) return;

    const d =
      await r.json();

    if ($("userInsideCount")) {
      $("userInsideCount").textContent =
        d.counts?.inside || 0;
    }

    if ($("userTodayCount")) {
      $("userTodayCount").textContent =
        d.counts?.today || 0;
    }

    if ($("userOutCount")) {
      $("userOutCount").textContent =
        d.counts?.checked_out || 0;
    }

    if ($("userDashUpdated")) {
      $("userDashUpdated").textContent =
        "Updated " +
        new Date().toLocaleTimeString();
    }

    if ($("userInsideList")) {

      $("userInsideList").innerHTML =
        d.inside?.length

          ? d.inside.map(v => `
              <div class="person">

                <img
                  src="${esc(v.photo_url || "")}"
                  alt=""
                >

                <div>

                  <b>
                    ${esc(v.name)}
                  </b>

                  <small>
                    ${esc(v.company || "")}
                    ·
                    ${esc(v.person_to_meet)}
                    · IN
                    ${time(v.in_time)}
                  </small>

                </div>

              </div>
            `).join("")

          : `
            <p style='color:#667085'>
              No visitors currently inside.
            </p>
          `;
    }

  } catch (e) {

    console.error(
      "User dashboard error:",
      e
    );
  }
}


/* =========================================================
   INITIAL LOAD
========================================================= */

loadDashboard();
