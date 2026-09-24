const express=require("express");
const path=require("path");
const crypto=require("crypto");
const bcrypt=require("bcryptjs");
const multer=require("multer");
const {Pool}=require("pg");

const app=express();
const PORT=process.env.PORT||10000;

if(!process.env.DATABASE_URL){console.error("DATABASE_URL is missing.");process.exit(1);}
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const sessions=new Map();

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024,files:10},
  fileFilter:(_,file,cb)=>{
    if(!file.mimetype||!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed."));
    cb(null,true);
  }
});

const q=(text,params=[])=>pool.query(text,params);
const token=()=>crypto.randomBytes(32).toString("hex");

function authRequired(req,res,next){
  const t=req.headers["x-admin-token"],u=t?sessions.get(t):null;
  if(!u)return res.status(401).json({error:"Please login first."});
  req.user=u;req.token=t;next();
}
function adminRequired(req,res,next){
  if(!["admin","super_admin"].includes(req.user.role))return res.status(403).json({error:"Admin access required."});
  next();
}
function superAdminRequired(req,res,next){
  if(req.user.role!=="super_admin")return res.status(403).json({error:"Super Admin access required."});
  next();
}

async function initDb(){
  await q(`CREATE TABLE IF NOT EXISTS admins(
    id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',created_at TIMESTAMPTZ DEFAULT NOW())`);
  await q(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'`);
  await q(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

  await q(`CREATE TABLE IF NOT EXISTS visitors(
    id SERIAL PRIMARY KEY,name TEXT NOT NULL,mobile TEXT,company TEXT,
    person_to_meet TEXT,purpose TEXT,vehicle_no TEXT,photo BYTEA,
    photo_type TEXT,in_time TIMESTAMPTZ DEFAULT NOW(),out_time TIMESTAMPTZ)`);
  await q(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS created_by INTEGER`);
  await q(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS created_by_username TEXT`);
  await q(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS created_by_role TEXT`);
  await q(`ALTER TABLE visitors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
  await q(`UPDATE visitors SET created_at=COALESCE(created_at,in_time,NOW()) WHERE created_at IS NULL`);

  await q(`CREATE TABLE IF NOT EXISTS visitor_photos(
    id SERIAL PRIMARY KEY,visitor_id INTEGER REFERENCES visitors(id) ON DELETE CASCADE,
    photo BYTEA NOT NULL,photo_type TEXT,photo_label TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`);

  const c=await q(`SELECT COUNT(*)::int AS count FROM admins`);
  if(c.rows[0].count===0){
    await q(`INSERT INTO admins(username,password,role) VALUES($1,$2,'super_admin')`,
      ["admin",await bcrypt.hash("admin123",10)]);
    console.log("Initial Super Admin created: admin / admin123");
  }
  await q(`UPDATE admins SET role='super_admin' WHERE username='admin'`);
}

app.get("/api/health",async(req,res)=>{
  try{await q("SELECT 1");res.json({ok:true});}
  catch(e){res.status(500).json({ok:false,error:"Database connection failed."});}
});

app.post("/api/admin/login",async(req,res)=>{
  try{
    const username=String(req.body.username||"").trim(),password=String(req.body.password||"");
    if(!username||!password)return res.status(400).json({error:"Username and password are required."});
    const r=await q(`SELECT id,username,password,role FROM admins WHERE username=$1`,[username]);
    if(!r.rows.length)return res.status(401).json({error:"Invalid username or password."});
    const u=r.rows[0];
    if(!(await bcrypt.compare(password,u.password)))return res.status(401).json({error:"Invalid username or password."});
    const t=token();
    sessions.set(t,{id:u.id,username:u.username,role:u.role||"admin",loginAt:new Date().toISOString()});
    res.json({success:true,token:t,id:u.id,username:u.username,role:u.role||"admin"});
  }catch(e){console.error(e);res.status(500).json({error:"Login failed."});}
});

app.post("/api/admin/logout",authRequired,(req,res)=>{sessions.delete(req.token);res.json({success:true});});
app.get("/api/my-role",authRequired,(req,res)=>res.json(req.user));

app.get("/api/admin/users",authRequired,superAdminRequired,async(req,res)=>{
  try{res.json((await q(`SELECT id,username,role,created_at FROM admins ORDER BY id`)).rows);}
  catch(e){res.status(500).json({error:"Could not load users."});}
});

app.post("/api/admin/users",authRequired,superAdminRequired,async(req,res)=>{
  try{
    const username=String(req.body.username||"").trim(),password=String(req.body.password||"");
    const role=["admin","user","super_admin"].includes(req.body.role)?req.body.role:"user";
    if(!username||!password)return res.status(400).json({error:"Username and password are required."});
    if(password.length<4)return res.status(400).json({error:"Password must be at least 4 characters."});
    if((await q(`SELECT id FROM admins WHERE username=$1`,[username])).rows.length)
      return res.status(409).json({error:"Username already exists."});
    const r=await q(`INSERT INTO admins(username,password,role) VALUES($1,$2,$3) RETURNING id,username,role,created_at`,
      [username,await bcrypt.hash(password,10),role]);
    res.json({success:true,user:r.rows[0]});
  }catch(e){console.error(e);res.status(500).json({error:"Could not create user."});}
});

app.delete("/api/admin/users/:id",authRequired,superAdminRequired,async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id))return res.status(400).json({error:"Invalid user ID."});
    if(id===req.user.id)return res.status(400).json({error:"You cannot delete your own account."});
    const r=await q(`DELETE FROM admins WHERE id=$1 RETURNING id`,[id]);
    if(!r.rows.length)return res.status(404).json({error:"User not found."});
    for(const [t,u] of sessions)if(u.id===id)sessions.delete(t);
    res.json({success:true});
  }catch(e){console.error(e);res.status(500).json({error:"Could not delete user."});}
});

app.get("/api/dashboard",authRequired,async(req,res)=>{
  try{
    res.json((await q(`SELECT v.*,
      (SELECT COUNT(*) FROM visitor_photos vp WHERE vp.visitor_id=v.id)::int AS photo_count
      FROM visitors v ORDER BY v.id DESC`)).rows);
  }catch(e){console.error(e);res.status(500).json({error:"Could not load dashboard."});}
});

const uploadFields=[
  {name:"photo",maxCount:1},{name:"photos",maxCount:10},
  {name:"visitor_photo",maxCount:1},{name:"vehicle_photo",maxCount:1},
  {name:"invoice_photo",maxCount:1},{name:"id_photo",maxCount:1},
  {name:"material_photo",maxCount:1},{name:"document_photo",maxCount:1},
  {name:"other_photos",maxCount:5}
];
const labelled=[
  ["visitor_photo","Visitor Photo"],["vehicle_photo","Vehicle Photo"],
  ["invoice_photo","Invoice Photo"],["id_photo","ID Proof Photo"],
  ["material_photo","Material Photo"],["document_photo","Other Document Photo"],
  ["other_photos","Other Photo"]
];

app.post("/api/visitors",authRequired,upload.fields(uploadFields),async(req,res)=>{
  try{
    const b=req.body,files=req.files||{},uploaded=[];
    if(!String(b.name||"").trim())return res.status(400).json({error:"Visitor name is required."});

    for(const [field,label] of labelled)for(const f of(files[field]||[]))uploaded.push({file:f,label});
    if(files.photo?.length)uploaded.push({file:files.photo[0],label:"Visitor Photo"});
    (files.photos||[]).forEach((f,i)=>uploaded.push({file:f,label:`Photo ${i+1}`}));

    if(!uploaded.length)return res.status(400).json({error:"Please upload at least one visitor photo."});
    if(uploaded.length>10)return res.status(400).json({error:"Maximum 10 photos are allowed."});

    const primary=uploaded.find(x=>x.label==="Visitor Photo")||uploaded[0];
    const r=await q(`INSERT INTO visitors(
      name,mobile,company,person_to_meet,purpose,vehicle_no,photo,photo_type,
      in_time,created_by,created_by_username,created_by_role,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,NOW()) RETURNING id`,
      [String(b.name||"").trim(),String(b.mobile||"").trim(),String(b.company||"").trim(),
       String(b.person_to_meet||"").trim(),String(b.purpose||"").trim(),String(b.vehicle_no||"").trim(),
       primary.file.buffer,primary.file.mimetype,req.user.id,req.user.username,req.user.role]);
    const id=r.rows[0].id;
    for(const x of uploaded)await q(`INSERT INTO visitor_photos(visitor_id,photo,photo_type,photo_label,created_at)
      VALUES($1,$2,$3,$4,NOW())`,[id,x.file.buffer,x.file.mimetype,x.label]);
    res.json({success:true,message:"Visitor entry submitted successfully.",visitorId:id,
      createdBy:req.user.username,createdByRole:req.user.role,photoCount:uploaded.length});
  }catch(e){console.error("Visitor insert error:",e);res.status(500).json({error:"Could not save visitor entry."});}
});

app.get("/api/visitors/:id/photo",authRequired,async(req,res)=>{
  try{
    const r=await q(`SELECT photo,photo_type FROM visitors WHERE id=$1`,[Number(req.params.id)]);
    if(!r.rows.length||!r.rows[0].photo)return res.status(404).send("Photo not found.");
    res.type(r.rows[0].photo_type||"image/jpeg").send(r.rows[0].photo);
  }catch(e){res.status(500).send("Could not load photo.");}
});

app.get("/api/visitors/:id/photos",authRequired,async(req,res)=>{
  try{res.json((await q(`SELECT id,photo_label,photo_type,created_at FROM visitor_photos WHERE visitor_id=$1 ORDER BY id`,[Number(req.params.id)])).rows);}
  catch(e){res.status(500).json({error:"Could not load photos."});}
});

app.get("/api/visitor-photos/:photoId",authRequired,async(req,res)=>{
  try{
    const r=await q(`SELECT photo,photo_type FROM visitor_photos WHERE id=$1`,[Number(req.params.photoId)]);
    if(!r.rows.length)return res.status(404).send("Photo not found.");
    res.type(r.rows[0].photo_type||"image/jpeg").send(r.rows[0].photo);
  }catch(e){res.status(500).send("Could not load photo.");}
});

app.post("/api/visitors/:id/checkout",authRequired,async(req,res)=>{
  try{
    const r=await q(`UPDATE visitors SET out_time=NOW() WHERE id=$1 AND out_time IS NULL RETURNING id,out_time`,
      [Number(req.params.id)]);
    if(!r.rows.length)return res.status(404).json({error:"Visitor not found or already checked out."});
    res.json({success:true,message:"Visitor checked out successfully.",visitor:r.rows[0]});
  }catch(e){res.status(500).json({error:"Could not check out visitor."});}
});

app.get("/api/history",authRequired,adminRequired,async(req,res)=>{
  try{res.json((await q(`SELECT v.*,(SELECT COUNT(*) FROM visitor_photos vp WHERE vp.visitor_id=v.id)::int AS photo_count
    FROM visitors v ORDER BY v.id DESC`)).rows);}
  catch(e){res.status(500).json({error:"Could not load history."});}
});

function csvEscape(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
app.get("/api/history.csv",authRequired,adminRequired,async(req,res)=>{
  try{
    const rows=(await q(`SELECT v.*,(SELECT COUNT(*) FROM visitor_photos vp WHERE vp.visitor_id=v.id)::int AS photo_count
      FROM visitors v ORDER BY v.id DESC`)).rows;
    const h=["ID","Visitor Name","Mobile","Company","Person To Meet","Purpose","Vehicle No","IN Time","OUT Time",
      "Created By Username","Created By Role","Entry Created At","Photo Count"];
    const out=[h.map(csvEscape).join(",")];
    for(const r of rows)out.push([r.id,r.name,r.mobile,r.company,r.person_to_meet,r.purpose,r.vehicle_no,
      r.in_time,r.out_time,r.created_by_username,r.created_by_role,r.created_at,r.photo_count].map(csvEscape).join(","));
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",'attachment; filename="visitor-history.csv"');
    res.send(out.join("\n"));
  }catch(e){res.status(500).send("Could not export CSV.");}
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==="LIMIT_FILE_SIZE"?"Each photo must be 5 MB or smaller.":err.code==="LIMIT_FILE_COUNT"?"Maximum 10 photos are allowed.":err.message});
  if(err)return res.status(400).json({error:err.message||"Request failed."});
  next();
});

app.use((req,res,next)=>{
  if(req.path.startsWith("/api/")) return res.status(404).json({error:"API route not found."});
  if(req.method === "GET") return res.sendFile(path.join(__dirname,"public","index.html"));
  next();
});

initDb().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log(`SAP Semi Visitor Management running on port ${PORT}`)))
.catch(e=>{console.error("Database initialization failed:",e);process.exit(1);});
