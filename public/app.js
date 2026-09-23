let token = localStorage.getItem("sapAdminToken") || "";

const $ = id => document.getElementById(id);
function showPage(id){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  $(id).classList.add("active");
  if(id==="admin") loadHistory();
}
function msg(el, text, ok=false){ el.textContent=text; el.style.color=ok?"#18723d":"#b42318"; }

$("photo").addEventListener("change", e=>{
  const f=e.target.files[0];
  if(!f){$("photoPreview").hidden=true;$("photoHint").hidden=false;return}
  if(f.size>5*1024*1024){e.target.value="";msg($("formMsg"),"Photo must be below 5 MB.");return}
  $("photoPreview").src=URL.createObjectURL(f); $("photoPreview").hidden=false; $("photoHint").hidden=true;
});

$("visitorForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const f=$("photo").files[0];
  if(!f){msg($("formMsg"),"Visitor photo is mandatory.");return}
  const fd=new FormData(e.target);
  try{
    const r=await fetch("/api/visitors",{method:"POST",body:fd});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||"Could not save visitor.");
    msg($("formMsg"),"Visitor checked in successfully.",true);
    e.target.reset(); $("photoPreview").hidden=true;$("photoHint").hidden=false;
    loadDashboard();
  }catch(err){msg($("formMsg"),err.message)}
});

async function loadDashboard(){
  try{
    const r=await fetch("/api/dashboard"); const d=await r.json();
    $("insideCount").textContent=d.counts.inside;
    $("todayCount").textContent=d.counts.today;
    $("outCount").textContent=d.counts.checked_out;
    $("updated").textContent="Updated "+new Date().toLocaleTimeString();
    $("insideList").innerHTML=d.inside.length?d.inside.map(v=>`
      <div class="person">
        <img src="${v.photo_url}" alt="">
        <div><b>${esc(v.name)}</b><small>${esc(v.company||"")} · Meeting: ${esc(v.person_to_meet)} · IN ${time(v.in_time)}</small></div>
      </div>`).join(""):"<p style='color:#667085'>No visitors currently inside.</p>";
  }catch(e){$("updated").textContent="Connection issue"}
}
setInterval(loadDashboard,3000); loadDashboard();

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("username").value,password:$("password").value})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    token=d.token;localStorage.setItem("sapAdminToken",token);showPage("admin");
  }catch(err){msg($("loginMsg"),err.message)}
});

async function loadHistory(){
  if(!token){showPage("adminLogin");return}
  const p=new URLSearchParams(); if($("search").value)p.set("q",$("search").value); if($("dateFilter").value)p.set("date",$("dateFilter").value);
  const r=await fetch("/api/admin/visitors?"+p,{headers:{"x-admin-token":token}});
  if(r.status===401){logout();return}
  const rows=await r.json();
  $("historyBody").innerHTML=rows.length?rows.map(v=>`
    <tr>
      <td><img class="table-photo" src="${v.photo_url}"></td>
      <td><b>${esc(v.name)}</b><br>${esc(v.mobile)}</td>
      <td>${esc(v.company||"-")}</td><td>${esc(v.person_to_meet)}</td>
      <td>${time(v.in_time)}</td><td>${v.out_time?time(v.out_time):"-"}</td>
      <td><span class="badge ${v.status.toLowerCase()}">${v.status}</span></td>
      <td>${v.status==="IN"?`<button class="out-btn" onclick="checkout(${v.id})">CHECK OUT</button>`:"—"}</td>
    </tr>`).join(""):"<tr><td colspan='8' style='text-align:center;color:#667085'>No visitors found.</td></tr>";
}
async function checkout(id){
  if(!confirm("Check this visitor OUT?"))return;
  const r=await fetch("/api/visitors/"+id+"/out",{method:"POST",headers:{"x-admin-token":token}});
  const d=await r.json(); if(!r.ok){alert(d.error);return}
  loadHistory();loadDashboard();
}
async function downloadCsv(){
  const r=await fetch("/api/admin/export.csv",{headers:{"x-admin-token":token}});
  if(!r.ok){alert("Please login again.");return}
  const blob=await r.blob(),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sap-semi-visitors.csv";a.click();
}
function clearFilters(){$("search").value="";$("dateFilter").value="";loadHistory()}
async function logout(){if(token)await fetch("/api/admin/logout",{method:"POST",headers:{"x-admin-token":token}}).catch(()=>{});token="";localStorage.removeItem("sapAdminToken");showPage("adminLogin")}
function time(x){return x?new Date(x).toLocaleString("en-IN",{dateStyle:"short",timeStyle:"short"}):"-"}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
