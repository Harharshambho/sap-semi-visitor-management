const $=id=>document.getElementById(id);
const getToken=()=>localStorage.getItem("sapAdminToken")||"";
const getRole=()=>localStorage.getItem("sapAdminRole")||"";
const getUsername=()=>localStorage.getItem("sapAdminUsername")||"";
const loggedIn=()=>!!getToken();
const authHeaders=extra=>({...extra,"x-admin-token":getToken()});

function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
function date(v){if(!v)return "-";try{return new Date(v).toLocaleString("en-IN")}catch{return v}}
function msg(el,text,type=""){if(el){el.textContent=text;el.className=("message "+type).trim()}}

function updateHeader(){
  const ok=loggedIn(),role=getRole(),user=getUsername();
  $("loginTopBtn").style.display=ok?"none":"inline-flex";
  $("logoutBtn").style.display=ok?"inline-flex":"none";
  $("newVisitorBtn").style.display=ok?"inline-flex":"none";
  $("currentUserInfo").textContent=ok?`${user} (${role})`:"";
  if($("entryUserBadge"))$("entryUserBadge").textContent=ok?`Entry by: ${user} • ${role}`:"";
  let sa=document.getElementById("superAdminNavBtn"),db=document.getElementById("adminNavBtn");
  if(sa)sa.style.display=role==="super_admin"?"inline-flex":"none";
  if(db)db.style.display=ok?"inline-flex":"none";
}

async function checkSession(){
  if(!loggedIn()){updateHeader();showPage("login");return}
  try{
    const r=await fetch("/api/my-role",{headers:authHeaders()});if(!r.ok)throw Error();
    const u=await r.json();
    localStorage.setItem("sapAdminUserId",u.id);
    localStorage.setItem("sapAdminUsername",u.username);
    localStorage.setItem("sapAdminRole",u.role);
    updateHeader();goHome();
  }catch{
    localStorage.clear();updateHeader();showPage("login");
  }
}

function goHome(){
  if(getRole()==="user"){showPage("userPanel");updateUserDashboard()}
  else{showPage("admin");loadDashboard()}
  if(getRole()==="super_admin")loadUsers();
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();msg($("loginMessage"),"Logging in...");
  try{
    const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:$("loginUsername").value.trim(),password:$("loginPassword").value})});
    const d=await r.json();if(!r.ok)throw Error(d.error||"Login failed.");
    localStorage.setItem("sapAdminToken",d.token);localStorage.setItem("sapAdminUserId",d.id);
    localStorage.setItem("sapAdminUsername",d.username);localStorage.setItem("sapAdminRole",d.role);
    $("loginPassword").value="";updateHeader();msg($("loginMessage"),"Login successful.","success");goHome();
  }catch(e){msg($("loginMessage"),e.message,"error")}
});

$("logoutBtn").addEventListener("click",async()=>{
  try{if(getToken())await fetch("/api/admin/logout",{method:"POST",headers:authHeaders()})}catch{}
  localStorage.clear();updateHeader();showPage("login");
});

function selectedFiles(){
  const names=["visitor_photo","vehicle_photo","invoice_photo","id_photo","material_photo","document_photo","other_photos"],out=[];
  for(const n of names){const i=document.querySelector(`input[name="${n}"]`);for(const f of(i?.files||[]))if(f.size)out.push(f)}
  return out;
}
function preview(){
  const p=$("photoPreview");p.innerHTML="";let count=0;
  document.querySelectorAll('#visitorForm input[type="file"]').forEach(i=>{
    [...(i.files||[])].forEach(f=>{
      if(!f.type.startsWith("image/"))return;count++;
      const rd=new FileReader();rd.onload=()=>{const d=document.createElement("div");d.className="preview-item";
        d.innerHTML=`<img src="${rd.result}"><small>${esc(f.name)}</small>`;p.appendChild(d)};rd.readAsDataURL(f);
    })
  });
  if(!count)p.innerHTML='<span class="muted">No photos selected.</span>';
}
document.querySelectorAll('#visitorForm input[type="file"]').forEach(i=>i.addEventListener("change",preview));

$("visitorForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!loggedIn()){showPage("login");return}
  const files=selectedFiles();if(!files.length){msg($("visitorMessage"),"Please upload the Visitor Photo.","error");return}
  if(files.length>10){msg($("visitorMessage"),"Maximum 10 photos are allowed.","error");return}
  const b=$("submitVisitorBtn");b.disabled=true;b.textContent="Submitting...";msg($("visitorMessage"),"Saving visitor entry...");
  try{
    const r=await fetch("/api/visitors",{method:"POST",headers:authHeaders(),body:new FormData(e.target)});
    const d=await r.json();if(!r.ok)throw Error(d.error||"Submit failed.");
    msg($("visitorMessage"),`Visitor entry submitted successfully. Entry by ${d.createdBy}.`,"success");
    e.target.reset();preview();
    setTimeout(goHome,1000);
  }catch(e){msg($("visitorMessage"),e.message,"error")}
  finally{b.disabled=false;b.textContent="Submit Visitor Entry"}
});

async function rows(){
  const r=await fetch("/api/dashboard",{headers:authHeaders()}),d=await r.json();if(!r.ok)throw Error(d.error||"Could not load dashboard.");return d;
}
function stats(rs,id){
  $(id).innerHTML=`<div class="stat-card"><strong>${rs.length}</strong><span>Total</span></div>
  <div class="stat-card"><strong>${rs.filter(x=>!x.out_time).length}</strong><span>Currently IN</span></div>
  <div class="stat-card"><strong>${rs.filter(x=>x.out_time).length}</strong><span>Checked OUT</span></div>`;
}
function table(rs,id){
  const c=$(id);if(!rs.length){c.innerHTML='<p class="muted">No visitor records found.</p>';return}
  c.innerHTML=`<table><thead><tr><th>ID</th><th>Visitor</th><th>Company</th><th>Person</th><th>Purpose</th><th>Vehicle</th><th>IN</th><th>OUT</th><th>Created By</th><th>Photos</th><th>Status</th><th>Action</th></tr></thead><tbody>
  ${rs.map(x=>`<tr><td>${x.id}</td><td><b>${esc(x.name)}</b><br><small>${esc(x.mobile||"")}</small></td><td>${esc(x.company||"-")}</td><td>${esc(x.person_to_meet||"-")}</td><td>${esc(x.purpose||"-")}</td><td>${esc(x.vehicle_no||"-")}</td><td>${date(x.in_time)}</td><td>${date(x.out_time)}</td>
  <td>${esc(x.created_by_username||"-")}<br><small>${esc(x.created_by_role||"")}</small><br><small>${date(x.created_at)}</small></td>
  <td><button class="btn small secondary" onclick="viewPhotos(${x.id})">${x.photo_count||0} Photos</button></td>
  <td><span class="status ${x.out_time?"out":"in"}">${x.out_time?"OUT":"IN"}</span></td>
  <td>${x.out_time?"-":`<button class="btn small danger" onclick="checkoutVisitor(${x.id})">Check OUT</button>`}</td></tr>`).join("")}</tbody></table>`;
}
async function loadDashboard(){try{const r=await rows();stats(r,"dashboardStats");table(r,"dashboardTable")}catch(e){$("dashboardTable").innerHTML=`<p class="message error">${esc(e.message)}</p>`}}
async function updateUserDashboard(){try{const all=await rows(),t=new Date(),r=all.filter(x=>x.in_time&&new Date(x.in_time).toDateString()===t.toDateString());stats(r,"userStats");table(r,"userTable")}catch(e){$("userTable").innerHTML=`<p class="message error">${esc(e.message)}</p>`}}
$("refreshDashboardBtn").addEventListener("click",loadDashboard);
$("userRefreshBtn").addEventListener("click",updateUserDashboard);

async function checkoutVisitor(id){
  if(!confirm("Are you sure you want to mark this visitor OUT?"))return;
  try{const r=await fetch(`/api/visitors/${id}/checkout`,{method:"POST",headers:authHeaders()}),d=await r.json();if(!r.ok)throw Error(d.error);
    alert("Visitor checked OUT successfully.");getRole()==="user"?updateUserDashboard():loadDashboard();
  }catch(e){alert(e.message)}
}
window.checkoutVisitor=checkoutVisitor;

async function loadHistory(){
  try{const r=await fetch("/api/history",{headers:authHeaders()}),d=await r.json();if(!r.ok)throw Error(d.error);table(d,"historyTable")}
  catch(e){$("historyTable").innerHTML=`<p class="message error">${esc(e.message)}</p>`}
}
$("historyBtn").addEventListener("click",()=>{showPage("history");loadHistory()});
$("historyRefreshBtn").addEventListener("click",loadHistory);

$("downloadCsvBtn").addEventListener("click",async()=>{
  try{const r=await fetch("/api/history.csv",{headers:authHeaders()});if(!r.ok)throw Error("Could not download CSV.");
    const u=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=u;a.download="visitor-history.csv";a.click();URL.revokeObjectURL(u)
  }catch(e){alert(e.message)}
});

async function loadUsers(){
  if(getRole()!=="super_admin")return;
  try{const r=await fetch("/api/admin/users",{headers:authHeaders()}),d=await r.json();if(!r.ok)throw Error(d.error);
    const me=Number(localStorage.getItem("sapAdminUserId"));
    $("usersTable").innerHTML=`<table><thead><tr><th>ID</th><th>Username</th><th>Role</th><th>Created</th><th>Action</th></tr></thead><tbody>
    ${d.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username)}${u.id===me?" (Current)":""}</td><td>${esc(u.role)}</td><td>${date(u.created_at)}</td><td>${u.id===me?"-":`<button class="btn small danger" onclick="deleteUser(${u.id})">Delete</button>`}</td></tr>`).join("")}</tbody></table>`;
  }catch(e){$("usersTable").innerHTML=`<p class="message error">${esc(e.message)}</p>`}
}
$("usersRefreshBtn").addEventListener("click",loadUsers);

$("createUserForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.target);
  try{const r=await fetch("/api/admin/users",{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json"},
    body:JSON.stringify({username:String(f.get("username")).trim(),password:String(f.get("password")),role:String(f.get("role"))})});
    const d=await r.json();if(!r.ok)throw Error(d.error);e.target.reset();msg($("userManageMessage"),`User ${d.user.username} created successfully.`,"success");loadUsers();
  }catch(e){msg($("userManageMessage"),e.message,"error")}
});
async function deleteUser(id){if(!confirm("Are you sure you want to delete this user?"))return;
  try{const r=await fetch(`/api/admin/users/${id}`,{method:"DELETE",headers:authHeaders()}),d=await r.json();if(!r.ok)throw Error(d.error);loadUsers()}catch(e){alert(e.message)}}
window.deleteUser=deleteUser;

async function viewPhotos(id){
  try{const r=await fetch(`/api/visitors/${id}/photos`,{headers:authHeaders()}),ps=await r.json();if(!r.ok)throw Error(ps.error);
    if(!ps.length)return alert("No photos found.");
    const w=window.open("","_blank","width=900,height=800");if(!w)return alert("Please allow pop-ups.");
    w.document.write(`<html><head><title>Visitor Photos</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;padding:20px;background:#f5f5f5}.p{background:#fff;padding:15px;margin-bottom:15px;border-radius:10px}img{max-width:100%;max-height:500px}</style></head><body><h2>Visitor #${id} Photos</h2>
    ${ps.map((p,i)=>`<div class="p"><b>${esc(p.photo_label||`Photo ${i+1}`)}</b><br><img src="/api/visitor-photos/${p.id}"></div>`).join("")}</body></html>`);w.document.close();
  }catch(e){alert(e.message)}
}
window.viewPhotos=viewPhotos;

document.addEventListener("DOMContentLoaded",()=>{
  const top=document.querySelector(".top-actions");
  const sa=document.createElement("button");sa.id="superAdminNavBtn";sa.className="btn secondary";sa.textContent="Super Admin";
  sa.onclick=()=>{if(getRole()==="super_admin"){showPage("superAdmin");loadUsers()}};top.insertBefore(sa,$("logoutBtn"));
  const db=document.createElement("button");db.id="adminNavBtn";db.className="btn secondary";db.textContent="Dashboard";
  db.onclick=goHome;top.insertBefore(db,$("logoutBtn"));
  updateHeader();checkSession();
});
