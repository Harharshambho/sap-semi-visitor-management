let token =
  localStorage.getItem("sapAdminToken") || "";

const $ = id =>
  document.getElementById(id);


/* =========================
   HELPERS
========================= */

function esc(v) {
  return String(v ?? "").replace(
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


function authHeaders(extra = {}) {
  return Object.assign(
    {
      "x-admin-token": token
    },
    extra
  );
}


/* =========================
   AUTHENTICATED IMAGE LOADING
========================= */

async function loadAuthenticatedImage(img) {
  const url = img?.dataset?.authSrc;

  if (!url || !token) return;

  try {
    const response = await fetch(url, {
      headers: authHeaders(),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Photo request failed (${response.status})`
      );
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      throw new Error(
        "Server did not return an image."
      );
    }

    const previousUrl = img.dataset.objectUrl;

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    const objectUrl = URL.createObjectURL(blob);

    img.dataset.objectUrl = objectUrl;
    img.src = objectUrl;

  } catch (error) {
    console.error("Photo preview error:", error);
    img.alt = "Photo unavailable";
  }
}


function loadAuthenticatedImages(container) {
  if (!container) return;

  container
    .querySelectorAll("img[data-auth-src]")
    .forEach(img => {
      loadAuthenticatedImage(img);
    });
}


/* =========================
   PAGE
========================= */

function showPage(id) {
  document
    .querySelectorAll(".page")
    .forEach(x =>
      x.classList.remove("active")
    );

  $(id)?.classList.add("active");
}


/* =========================
   PHOTO PREVIEW
========================= */

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
    const input = document.querySelector(
      `[name="${id}"]`
    );

    for (const f of (input?.files || [])) {
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
          `${label} must be an image.`
        );

        return;
      }

      const wrapper = document.createElement("div");
      const img = document.createElement("img");

      img.src = URL.createObjectURL(f);
      img.alt = label;
      img.title = "Click to preview";

      img.style.cssText = `
        width:100%;
        height:100px;
        object-fit:cover;
        border-radius:10px;
        border:1px solid #d0d5dd;
        cursor:pointer;
      `;

      img.onclick = () => {
        const url = URL.createObjectURL(f);

        openPhotoModal(
          url,
          `${label} - ${f.name}`
        );
      };

      wrapper.appendChild(img);
      grid.appendChild(wrapper);
    }
  }

  if (total > 10) {
    const input = document.querySelector(
      '[name="other_photos"]'
    );

    if (input) input.value = "";

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


/* =========================
   CHECK IN
========================= */

$("visitorForm")?.addEventListener(
  "submit",
  async e => {
    e.preventDefault();

    if (!token) {
      showPage("adminLogin");
      return;
    }

    const visitorPhoto = document.querySelector(
      '[name="visitor_photo"]'
    );

    if (
      !visitorPhoto ||
      !visitorPhoto.files.length
    ) {
      msg(
        $("formMsg"),
        "Visitor photo is mandatory."
      );

      return;
    }

    const fd = new FormData(e.target);

    let total = 0;

    for (const [k, v] of fd.entries()) {
      if (v instanceof File && v.size) {
        total++;
      }
    }

    if (total < 1) {
      msg(
        $("formMsg"),
        "Visitor photo is mandatory."
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
      const r = await fetch("/api/visitors", {
        method: "POST",
        headers: authHeaders(),
        body: fd
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error || "Could not save visitor."
        );
      }

      msg(
        $("formMsg"),
        `Visitor checked in successfully. ${d.photo_count} photo(s) saved.`,
        true
      );

      e.target.reset();

      $("photoPreviewGrid").innerHTML = "";

      loadDashboard();
      updateUserDashboard();

    } catch (err) {
      msg($("formMsg"), err.message);
    }
  }
);


/* =========================
   DASHBOARD
========================= */

async function loadDashboard() {
  if (!token) return;

  try {
    const r = await fetch("/api/dashboard", {
      headers: authHeaders()
    });

    if (!r.ok) return;

    const d = await r.json();

    $("insideCount").textContent =
      d.counts?.inside || 0;

    $("todayCount").textContent =
      d.counts?.today || 0;

    $("outCount").textContent =
      d.counts?.checked_out || 0;

    $("updated").textContent =
      "Updated " +
      new Date().toLocaleTimeString();

    $("insideList").innerHTML =
      d.inside?.length
        ? d.inside.map(v => `
          <div class="person">

            <img
              data-auth-src="${v.photo_url}"
              alt="${esc(v.name)}"
              onclick="openVisitorPhotos(${v.id})"
              title="Click to view photos"
              style="cursor:pointer"
            >

            <div>
              <b>${esc(v.name)}</b>

              <small>
                ${esc(v.company || "")}
                · Meeting:
                ${esc(v.person_to_meet)}
                · IN ${time(v.in_time)}

                <br>

                <strong>Registered By:</strong>
                ${esc(v.created_by_username || "-")}
                (${esc(v.created_by_role || "-")})

                <br>

                <button
                  class="btn danger"
                  style="margin-top:6px;"
                  onclick="checkoutVisitor(${v.id})"
                >
                  CHECK OUT
                </button>
              </small>
            </div>
          </div>
        `).join("")
        : `
          <p style="color:#667085">
            No visitors currently inside.
          </p>
        `;

    loadAuthenticatedImages($("insideList"));

  } catch (e) {}
}


setInterval(loadDashboard, 5000);


/* =========================
   LOGIN
========================= */

$("loginForm")?.addEventListener(
  "submit",
  async e => {
    e.preventDefault();

    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          username: $("username").value.trim(),
          password: $("password").value
        })
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.error || "Invalid username or password."
        );
      }

      token = d.token;

      localStorage.setItem("sapAdminToken", token);

      localStorage.setItem(
        "sapAdminRole",
        d.role || "admin"
      );

      localStorage.setItem(
        "sapAdminUsername",
        d.username || ""
      );

      localStorage.setItem(
        "sapCurrentUserId",
        d.user_id || ""
      );

      showPage(
        d.role === "user"
          ? "userPanel"
          : "admin"
      );

    } catch (err) {
      msg($("loginMsg"), err.message);
    }
  }
);


/* =========================
   HISTORY
========================= */

async function loadHistory() {
  if (!token) return;

  const q = $("search")?.value.trim() || "";
  const date = $("dateFilter")?.value || "";

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

    const rows = await r.json();

    $("historyBody").innerHTML =
      rows.length
        ? rows.map(v => `
          <tr>
            <td>
              <img
                data-auth-src="${v.photo_url}"
                style="
                  width:65px;
                  height:65px;
                  object-fit:cover;
                  border-radius:8px;
                  cursor:pointer;
                "
                onclick="openVisitorPhotos(${v.id})"
                title="Click to view photos"
              >
            </td>

            <td>
              <b>${esc(v.name)}</b>
              <br>
              <small>${esc(v.mobile)}</small>
            </td>

            <td>${esc(v.company || "-")}</td>

            <td>${esc(v.person_to_meet)}</td>

            <td>${time(v.in_time)}</td>

            <td>
              ${time(v.out_time)}

              ${
                v.checked_out_by_username
                  ? `
                    <br>
                    <small>
                      By:
                      <b>
                        ${esc(v.checked_out_by_username)}
                      </b>
                      (${esc(v.checked_out_by_role || "-")})
                    </small>
                  `
                  : ""
              }
            </td>

            <td>
              <b>
                ${esc(v.created_by_username || "-")}
              </b>

              <br>

              <small>
                Role:
                ${esc(v.created_by_role || "-")}
              </small>
            </td>
          </tr>
        `).join("")
        : `
          <tr>
            <td colspan="7">
              No visitor records found.
            </td>
          </tr>
        `;

    loadAuthenticatedImages($("historyBody"));

  } catch (e) {
    console.error("History error:", e);
  }
}
/* =========================
   CHECKOUT
========================= */

async function checkoutVisitor(id) {

  if (!confirm("Check out this visitor?")) {
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
        d.error || "Could not check out."
      );
    }

    loadHistory();
    loadDashboard();
    updateUserDashboard();

  } catch (e) {
    alert(e.message);
  }
}


/* =========================
   PHOTO MODAL
========================= */

async function openPhotoModal(
  url,
  title = "Photo"
) {

  const modal = $("photoModal");
  const image = $("modalPhoto");
  const titleEl = $("photoModalTitle");

  if (!modal || !image) return;

  if (image.dataset.objectUrl) {
    URL.revokeObjectURL(
      image.dataset.objectUrl
    );

    delete image.dataset.objectUrl;
  }

  image.removeAttribute("src");
  image.dataset.authSrc = url;
  image.alt = title;

  if (titleEl) {
    titleEl.textContent = title;
  }

  modal.style.display = "flex";

  await loadAuthenticatedImage(image);
}


function closePhotoModal() {

  const modal = $("photoModal");

  if (modal) {
    modal.style.display = "none";
  }

  const image = $("modalPhoto");

  if (image) {

    image.removeAttribute("src");

    delete image.dataset.authSrc;

    if (image.dataset.objectUrl) {

      URL.revokeObjectURL(
        image.dataset.objectUrl
      );

      delete image.dataset.objectUrl;
    }
  }
}


/* =========================
   VIEW VISITOR PHOTOS
========================= */

async function openVisitorPhotos(id) {

  try {

    const r = await fetch(
      `/api/visitors/${id}/photos`,
      {
        headers: authHeaders()
      }
    );

    const rows = await r.json();

    if (!r.ok || !rows.length) {

      alert("No photos found.");

      return;
    }

    const grid = $("modalPhotoGrid");

    if (!grid) {

      openPhotoModal(
        rows[0].photo_url,
        rows[0].photo_label
      );

      return;
    }

    grid.innerHTML = rows.map(
      (p, i) => `

        <div
          style="
            cursor:pointer;
            text-align:center;
          "
          onclick="openPhotoModal(
            '${p.photo_url}',
            '${esc(p.photo_label || "Photo")}'
          )"
        >

          <img
            data-auth-src="${p.photo_url}"
            alt="${esc(p.photo_label || "Photo")}"
            style="
              width:150px;
              height:120px;
              object-fit:cover;
              border-radius:10px;
              border:1px solid #ddd;
            "
          >

          <div
            style="
              font-size:13px;
              margin-top:5px;
            "
          >
            ${esc(
              p.photo_label ||
              `Photo ${i + 1}`
            )}
          </div>

        </div>

      `
    ).join("");

    loadAuthenticatedImages(grid);

    $("photoGalleryModal").style.display =
      "flex";

  } catch (e) {

    console.error(e);

    alert("Could not load photos.");
  }
}


function closePhotoGallery() {

  const modal = $("photoGalleryModal");

  if (modal) {
    modal.style.display = "none";
  }
}


/* =========================
   EXCEL DOWNLOAD
========================= */

async function downloadExcel() {

  try {

    const r = await fetch(
      "/api/admin/export.xlsx",
      {
        headers: authHeaders()
      }
    );

    if (!r.ok) {

      if (r.status === 401) {

        logout();

      } else {

        alert(
          "Could not download Excel report."
        );
      }

      return;
    }

    const blob = await r.blob();

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "sap-semi-visitors.xlsx";

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

  } catch (e) {

    alert("Could not download Excel report.");
  }
}


/* Compatibility with old button */

function downloadCsv() {
  downloadExcel();
}


/* =========================
   FILTER
========================= */

function clearFilters() {

  if ($("search")) {
    $("search").value = "";
  }

  if ($("dateFilter")) {
    $("dateFilter").value = "";
  }

  loadHistory();
}


/* =========================
   LOGOUT
========================= */

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
    "sapAdminUsername",
    "sapCurrentUserId"
  ].forEach(k => {
    localStorage.removeItem(k);
  });

  showPage("adminLogin");
}


/* =========================
   CREATE USER
========================= */

async function createSystemUser() {

  const username =
    $("newUsername").value.trim();

  const password =
    $("newPassword").value;

  const role =
    $("newRole").value;

  if (!username || password.length < 6) {

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
          "Content-Type": "application/json"
        }),

        body: JSON.stringify({
          username,
          password,
          role
        })
      }
    );

    const d = await r.json();

    if (!r.ok) {

      throw new Error(
        d.error || "Could not create user."
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


/* =========================
   SYSTEM USERS
========================= */

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

      $("systemUsersBody").innerHTML =
        "<tr><td colspan='5'>Access denied.</td></tr>";

      return;
    }

    const rows = await r.json();

    $("systemUsersBody").innerHTML =
      rows.map(u => `

        <tr>

          <td>${u.id}</td>

          <td>
            <b>${esc(u.username)}</b>
          </td>

          <td>${esc(u.role)}</td>

          <td>${time(u.created_at)}</td>

          <td>

            ${
              u.id === Number(
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

    console.error(e);
  }
}


async function deleteSystemUser(id) {

  if (!confirm("Delete this user?")) {
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

    const d = await r.json();

    if (!r.ok) {

      alert(
        d.error || "Could not delete user."
      );

      return;
    }

    loadSystemUsers();

  } catch (e) {

    alert("Could not delete user.");
  }
}


/* =========================
   USER DASHBOARD
========================= */

async function updateUserDashboard() {

  if (!token) return;

  try {

    const r = await fetch(
      "/api/dashboard",
      {
        headers: authHeaders()
      }
    );

    if (!r.ok) return;

    const d = await r.json();

    $("userInsideCount").textContent =
      d.counts?.inside || 0;

    $("userTodayCount").textContent =
      d.counts?.today || 0;

    $("userOutCount").textContent =
      d.counts?.checked_out || 0;

    $("userDashUpdated").textContent =
      "Updated " +
      new Date().toLocaleTimeString();

    $("userInsideList").innerHTML =
      d.inside?.length

        ? d.inside.map(v => `

          <div class="person">

            <img
              data-auth-src="${v.photo_url}"
              alt="${esc(v.name)}"
              onclick="openVisitorPhotos(${v.id})"
              title="Click to view photos"
              style="cursor:pointer"
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

                <br>

                <strong>
                  Registered By:
                </strong>

                ${esc(
                  v.created_by_username || "-"
                )}

                (${esc(
                  v.created_by_role || "-"
                )})

                <br>

                <button
                  class="btn danger"
                  style="margin-top:6px;"
                  onclick="checkoutVisitor(${v.id})"
                >
                  CHECK OUT
                </button>

              </small>

            </div>

          </div>

        `).join("")

        : `
          <p style="color:#667085">
            No visitors currently inside.
          </p>
        `;

    loadAuthenticatedImages(
      $("userInsideList")
    );

  } catch (e) {

    console.error(e);
  }
}


/* =========================
   INITIALIZATION
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    if ($("search")) {
      $("search").addEventListener(
        "input",
        loadHistory
      );
    }

    if ($("dateFilter")) {
      $("dateFilter").addEventListener(
        "change",
        loadHistory
      );
    }

    if ($("adminLogout")) {
      $("adminLogout").addEventListener(
        "click",
        logout
      );
    }

    if ($("userLogout")) {
      $("userLogout").addEventListener(
        "click",
        logout
      );
    }

    if (token) {

      const role =
        localStorage.getItem("sapAdminRole");

      showPage(
        role === "user"
          ? "userPanel"
          : "admin"
      );

      loadDashboard();
      loadHistory();
      updateUserDashboard();

      if (role === "superadmin") {
        loadSystemUsers();
      }
    }
  }
);
