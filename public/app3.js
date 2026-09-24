let token = localStorage.getItem("sapAdminToken") || "";
const $ = id => document.getElementById(id);

function esc(v){return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function time(v){return v ? new Date(v).toLocaleString("en-IN",{dateStyle:"short",timeStyle:"short"}) : "-";}
function msg(el,text,ok=false){if(!el)return;el.textContent=text;el.style.color=ok?"#18723d":"#b42318";}

function showPage(id){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  $(id)?.classList.add("active");
}

function authHeaders(extra={}){
  return Object.assign({"x-admin-token":token},extra);
}

function previewFiles(){
  const grid=$("photoPreviewGrid");
  if(!grid)return;
  grid.innerHTML="";
  const fields=[
    ["visitor_photo","Visitor"],["vehicle_photo","Vehicle"],["invoice_photo","Invoice"],
    ["id_photo","ID"],["material_photo","Material"],["document_photo","Document"],["other_photos","Other"]
  ];
  let total=0;
  for(const [id,label] of fields){
    const input=document.querySelector(`[name="${id}"]`);
    for(const f of (input?.files||[])){
      total++;
      if(f.size>5*1024*1024){ input.value=""; msg($("formMsg"),`${label} photo "${f.name}" is above 5 MB.`); return; }
      const img=document.createElement("img");
      img.src=URL.createObjectURL(f); img.alt=label;
      img.style.cssText="width:100%;height:100px;object-fit:cover;border-radius:10px;border:1px solid #d0d5dd;";
      grid.appendChild(img);
    }
  }
  if(total>10){
    document.querySelector('[name="other_photos"]').value="";
    msg($("formMsg"),"Maximum 10 photos are allowed.");
  }
}
document.addEventListener("change",e=>{
  if(e.target.matches('#visitorForm input[type="file"]')) previewFiles();
});

$("visitorForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!token()){showPage("adminLogin");return;}

  const fd=new FormData(e.target);
  let total=0;
  for(const [k,v] of fd.entries()) if(v instanceof File && v.size) total++;
  if(total<1){msg($("formMsg"),"Visitor photo is mandatory.");return;}
  if(total>10){msg($("formMsg"),"Maximum 10 photos are allowed.");return;}

  try{
    const r=await fetch("/api/visitors",{method:"POST",headers:authHeaders(),body:fd});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||"Could not save visitor.");
    msg($("formMsg"),`Visitor checked in successfully. ${d.photo_count} photo(s) saved.`,true);
    e.target.reset(); $("photoPreviewGrid").innerHTML="";
    loadDashboard(); updateUserDashboard();
  }catch(err){msg($("formMsg"),err.message);}
});

async function loadDashboard(){
  if(!token()) return;
  try{
    const r=await fetch("/api/dashboard",{headers:authHeaders()});
    if(!r.ok) return;
    const d=await r.json();
    $("insideCount").textContent=d.counts?.inside||0;
    $("todayCount").textContent=d.counts?.today||0;
    $("outCount").textContent=d.counts?.checked_out||0;
    $("updated").textContent="Updated "+new Date().toLocaleTimeString();
    $("insideList").innerHTML=d.inside?.length?d.inside.map(v=>`
      <div class="person"><img src="${v.photo_url}" alt=""><div><b>${esc(v.name)}</b>
      <small>${esc(v.company||"")} · Meeting: ${esc(v.person_to_meet)} · IN ${time(v.in_time)}<br>
      Entry by: ${esc(v.created_by_username||"-")} (${esc(v.created_by_role||"-")})</small></div></div>`).join("")
      : "<p style='color:#667085'>No visitors currently inside.</p>";
  }catch(e){}
}
setInterval(loadDashboard,5000);

$("loginForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:$("username").value.trim(),password:$("password").value})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Invalid username or password.");
    token=d.token;
    localStorage.setItem("sapAdminToken",token);
    localStorage.setItem("sapAdminRole",d.role||"admin");
    localStorage.setItem("sapAdminUsername",d.username||"");
    showPage(d.role==="user"?"userPanel":"admin");
  }catch(err){msg($("loginMsg"),err.message);}
});

async function loadHistory(){
  if(!token())return;
  const q=$("search")?.value.trim()||"", date=$("dateFilter")?.value||"";
  try{
    const r=await fetch(`/api/admin/visitors?q=${encodeURIComponent(q)}&date=${encodeURIComponent(date)}`,{headers:authHeaders()});
    if(r.status===401){logout();return;}
    const rows=await r.json();
    $("historyBody").innerHTML=rows.length?rows.map(v=>`
      <tr>
        <td><img src="${v.photo_url}" style="width:55px;height:55px;object-fit:cover;border-radius:8px"></td>
        <td><b>${esc(v.name)}</b><br><small>${esc(v.mobile)}</small></td>
        <td>${esc(v.company||"-")}</td>
        <td>${esc(v.person_to_meet)}</td>
        <td>${time(v.in_time)}</td>
        <td>${time(v.out_time)}</td>
        <td><b>${esc(v.created_by_username||"-")}</b><br><small>${esc(v.created_by_role||"")}</small><br><small>${time(v.created_at)}</small></td>
        <td>${esc(v.status)}</td>
        <td>${v.status==="IN"?`<button class="btn danger" onclick="checkoutVisitor(${v.id})">CHECK OUT</button>`:`<button class="btn secondary" onclick="viewPhotos(${v.id})">PHOTOS</button>`}</td>
      </tr>`).join("")
      : `<tr><td colspan="9" style="text-align:center;color:#667085">No records found.</td></tr>`;
  }catch(e){$("historyBody").innerHTML=`<tr><td colspan="9">Could not load history.</td></tr>`;}
}

async function checkoutVisitor(id){
  if(!confirm("Check out this visitor?"))return;
  try{
    const r=await fetch(`/api/visitors/${id}/out`,{method:"POST",headers:authHeaders()});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Could not check out.");
    loadHistory();loadDashboard();updateUserDashboard();
  }catch(e){alert(e.message);}
}

async function viewPhotos(id){
  try{
    const r=await fetch(`/api/visitors/${id}/photos`,{headers:authHeaders()});
    const rows=await r.json();
    if(!rows.length){alert("No photos found.");return;}
    const text=rows.map((p,i)=>`${i+1}. ${p.photo_label}`).join("\n");
    alert("Saved photos:\n\n"+text+"\n\nClick OK to open the first photo.");
    window.open(rows[0].photo_url,"_blank");
  }catch(e){alert("Could not load photos.");}
}

async function downloadCsv(){
  try{
    const r=await fetch("/api/admin/export.csv",{headers:authHeaders()});
    if(!r.ok){if(r.status===401)logout();else alert("Could not download report.");return;}
    const blob=await r.blob(), a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="sap-semi-visitors.csv";a.click();
    URL.revokeObjectURL(a.href);
  }catch(e){alert("Could not download report.");}
}

function clearFilters(){if($("search"))$("search").value="";if($("dateFilter"))$("dateFilter").value="";loadHistory();}

async function logout(){
  if(token)await fetch("/api/admin/logout",{method:"POST",headers:authHeaders()}).catch(()=>{});
  token="";
  ["sapAdminToken","sapAdminRole","sapAdminUsername"].forEach(k=>localStorage.removeItem(k));
  showPage("adminLogin");
}

async function createSystemUser(){
  const username=$("newUsername").value.trim(),password=$("newPassword").value,role=$("newRole").value;
  if(!username||password.length<6){msg($("userManagementMsg"),"Username and 6+ character password are required.");return;}
  try{
    const r=await fetch("/api/super-admin/users",{method:"POST",headers:authHeaders({"Content-Type":"application/json"}),
      body:JSON.stringify({username,password,role})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not create user.");
    msg($("userManagementMsg"),"User created successfully.",true);
    $("newUsername").value="";$("newPassword").value="";loadSystemUsers();
  }catch(e){msg($("userManagementMsg"),e.message);}
}

async function loadSystemUsers(){
  if(!token())return;
  try{
    const r=await fetch("/api/super-admin/users",{headers:authHeaders()});
    if(!r.ok){$("systemUsersBody").innerHTML="<tr><td colspan='5'>Access denied.</td></tr>";return;}
    const rows=await r.json();
    $("systemUsersBody").innerHTML=rows.map(u=>`
      <tr><td>${u.id}</td><td><b>${esc(u.username)}</b></td><td>${esc(u.role)}</td><td>${time(u.created_at)}</td>
      <td>${u.id===Number(localStorage.getItem("sapCurrentUserId"))?"Current":`<button class="btn danger" onclick="deleteSystemUser(${u.id})">Delete</button>`}</td></tr>`).join("");
  }catch(e){}
}

async function deleteSystemUser(id){
  if(!confirm("Delete this user?"))return;
  const r=await fetch(`/api/super-admin/users/${id}`,{method:"DELETE",headers:authHeaders()});
  const d=await r.json();if(!r.ok){alert(d.error||"Could not delete user.");return;}loadSystemUsers();
}

async function updateUserDashboard(){
  if(!token())return;
  try{
    const r=await fetch("/api/dashboard",{headers:authHeaders()});if(!r.ok)return;
    const d=await r.json();
    $("userInsideCount").textContent=d.counts?.inside||0;
    $("userTodayCount").textContent=d.counts?.today||0;
    $("userOutCount").textContent=d.counts?.checked_out||0;
    $("userDashUpdated").textContent="Updated "+new Date().toLocaleTimeString();
    $("userInsideList").innerHTML=d.inside?.length?d.inside.map(v=>`
      <div class="person"><img src="${v.photo_url}" alt=""><div><b>${esc(v.name)}</b>
      <small>${esc(v.company||"")} · ${esc(v.person_to_meet)} · IN ${time(v.in_time)}</small></div></div>`).join("")
      : "<p style='color:#667085'>No visitors currently inside.</p>";
  }catch(e){}
}

loadDashboard();
