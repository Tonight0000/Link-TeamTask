import { useState, useEffect, useRef } from "react";

const VERSION = "v1.34";
const USER_KEY = "link-user-v1";
const ALLOWED_DOMAIN = "cinemaleap.com"; // このドメインのGoogleアカウントのみ許可
const AUTH_KEY = "link-auth-v1";
const STORAGE_KEY = "link-team-v1";

const MEMBERS = ["待場", "内藤", "井上"];
const MEMBER_COLORS = { "待場": "#28cd41", "内藤": "#0a84ff", "井上": "#ff9f0a" };
const MEMBER_BG = { "待場": "rgba(40,205,65,.12)", "内藤": "rgba(10,132,255,.12)", "井上": "rgba(255,159,10,.12)" };
const DEFAULT_PROJECTS = ["BTFF", "IMMERSIVE JOURNEY", "HR", "その他"];
const PROJ_PALETTE = ["#bf5af2","#ff9f0a","#0a84ff","#30d158","#ff453a","#64d2ff","#ffd60a","#ff6961"];

const STATUS_CYCLE = { undecided:"inprogress", inprogress:"done", done:"undecided" };
const STATUS = {
  undecided:  { label:"未定",   color:"#98989d", bg:"rgba(152,152,157,.15)", dot:"#98989d" },
  inprogress: { label:"進行中", color:"#ff9f0a", bg:"rgba(255,159,10,.12)",  dot:"#ff9f0a" },
  done:       { label:"完了",   color:"#28cd41", bg:"rgba(40,205,65,.12)",   dot:"#28cd41" },
};

const API_URL = (() => {
  try { return import.meta.env.VITE_API_URL; } catch { return null; }
})();

async function loadShared() {
  // 1. Google Sheets APIから取得
  try {
    if (API_URL) {
      const res = await fetch(API_URL);
      const json = await res.json();
      if (json.ok && json.data && (json.data.tasks || json.data.projects)) {
        // localStorageにもキャッシュ
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data)); } catch {}
        return json.data;
      }
    }
  } catch {}
  // 2. フォールバック: localStorage
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {}
  // 3. Claude artifact
  try { if (window.storage) { const r = await window.storage.get(STORAGE_KEY, true); if (r?.value) return JSON.parse(r.value); } } catch {}
  return null;
}

async function saveShared(d) {
  // 1. Google Sheets APIに保存
  try {
    if (API_URL) {
      fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "save", data: d })
      });
    }
  } catch {}
  // 2. localStorageにも保存（オフライン用キャッシュ）
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
  // 3. Claude artifact
  try { if (window.storage) { await window.storage.set(STORAGE_KEY, JSON.stringify(d), true); } } catch {}
}

async function loadUser() {
  try { const s = localStorage.getItem(USER_KEY); if (s) return s; } catch {}
  try { if (window.storage) { const r = await window.storage.get(USER_KEY, false); if (r?.value) return r.value; } } catch {}
  return null;
}
async function saveUser(name) {
  try { if (name) localStorage.setItem(USER_KEY, name); else localStorage.removeItem(USER_KEY); } catch {}
  try { if (window.storage) { if (name) await window.storage.set(USER_KEY, name, false); } } catch {}
}

async function loadAuth() {
  try { const s = localStorage.getItem(AUTH_KEY); if (s) return JSON.parse(s); } catch {}
  return null;
}
async function saveAuth(info) {
  try { if (info) localStorage.setItem(AUTH_KEY, JSON.stringify(info)); else localStorage.removeItem(AUTH_KEY); } catch {}
}

function getToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }

function fmtDate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00"), now = getToday();
  const diff = Math.round((d - now) / 86400000);
  const mm = d.getMonth() + 1, dd = d.getDate();
  const day = ["日","月","火","水","木","金","土"][d.getDay()];
  return { display:`${mm}/${dd}(${day})`, diff, label:diff===0?"今日":diff===1?"明日":null };
}

function projColor(name, colorMap) {
  return colorMap?.[name] || "#8e8e93";
}

function assignColors(projects, existingMap) {
  const map = { ...(existingMap || {}) };
  let usedIdxs = Object.values(map).map(c => PROJ_PALETTE.indexOf(c)).filter(i => i >= 0);
  projects.forEach(p => {
    if (!map[p]) {
      // 未使用の色を探す
      const nextIdx = PROJ_PALETTE.findIndex((_, i) => !usedIdxs.includes(i));
      map[p] = PROJ_PALETTE[nextIdx >= 0 ? nextIdx : usedIdxs.length % PROJ_PALETTE.length];
      usedIdxs.push(PROJ_PALETTE.indexOf(map[p]));
    }
  });
  return map;
}

function StatusPill({status, onClick}) {
  const s = STATUS[status]||STATUS.undecided;
  return (
    <button onClick={onClick} style={{
      background:s.bg, border:"none", borderRadius:"20px",
      color:s.color, fontSize:"11px", fontWeight:600,
      padding:"2px 8px", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:"4px"
    }}
      onMouseEnter={e=>e.currentTarget.style.filter="brightness(.88)"}
      onMouseLeave={e=>e.currentTarget.style.filter=""}>
      <span style={{width:5,height:5,borderRadius:"50%",background:s.dot,display:"inline-block",flexShrink:0}}/>
      {s.label}
    </button>
  );
}

function MemberPill({member}) {
  const color = MEMBER_COLORS[member]||"#636366";
  const bg = MEMBER_BG[member]||"rgba(99,99,102,.1)";
  return <span style={{fontSize:"11px",fontWeight:600,color,background:bg,borderRadius:"20px",padding:"2px 8px"}}>{member}</span>;
}

function DeadlineChip({dateStr, taskId, onSetDate}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  if (editing) return (
    <input ref={ref} type="date" defaultValue={dateStr||""} autoFocus
      onChange={e=>{onSetDate(taskId,e.target.value);setEditing(false);}}
      onBlur={()=>setEditing(false)}
      style={{background:"#fff",border:"1px solid #0a84ff",borderRadius:"6px",
        fontSize:"11px",fontWeight:600,color:"#1c1c1e",padding:"2px 7px",outline:"none",
        boxShadow:"0 0 0 3px rgba(10,132,255,.15)"}}/>
  );
  if (!dateStr) return (
    <button onClick={()=>setEditing(true)} style={{background:"none",border:"1px dashed rgba(0,0,0,.15)",
      borderRadius:"20px",color:"#aeaeb2",fontSize:"11px",padding:"2px 8px",cursor:"pointer"}}>
      📅 締切
    </button>
  );
  const f = fmtDate(dateStr); if (!f) return null;
  const {display,label,diff} = f;
  const isUrgent=diff<0, isSoon=diff===0||diff===1;
  const color=isUrgent?"#ff453a":isSoon?"#ff9f0a":"#8e8e93";
  return (
    <button onClick={()=>setEditing(true)} style={{background:"none",border:"none",
      color,fontSize:"11px",fontWeight:500,padding:"2px 4px",cursor:"pointer"}}>
      {isUrgent?"⚠️":isSoon?"🔥":"📅"} {label||display}
    </button>
  );
}

function CommentPanel({task, onAdd, onDelete, currentUser}) {
  const comments = task.comments||[];
  const [open, setOpen] = useState(comments.length > 0);
  const [val, setVal] = useState("");
  const [who, setWho] = useState(currentUser || MEMBERS[0]);
  const ref = useRef();
  const handleAdd = () => {
    if (!val.trim()) return;
    const time = new Date().toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    onAdd(task.id,{id:Date.now().toString(),text:val.trim(),time,who}); setVal("");
  };
  return (
    <div style={{marginTop:8}}>
      <button onClick={()=>{setOpen(o=>!o);setTimeout(()=>ref.current?.focus(),60)}}
        style={{background:"none",border:"none",cursor:"pointer",fontSize:"11px",
          color:comments.length>0?"#0a84ff":"#c7c7cc",fontWeight:500,padding:0,
          display:"flex",alignItems:"center",gap:3}}>
        <span style={{fontSize:9,opacity:.6}}>{open?"▾":"▸"}</span>
        {comments.length>0?`メモ ${comments.length}件`:"メモ"}
      </button>
      {open&&(
        <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid rgba(0,0,0,.06)"}}>
          {comments.map(c=>(
            <div key={c.id} style={{display:"flex",gap:5,marginBottom:5,padding:"5px 8px",
              background:"rgba(0,0,0,.03)",borderRadius:7,alignItems:"flex-start",fontSize:11}}>
              <span style={{fontWeight:700,color:MEMBER_COLORS[c.who]||"#636366",whiteSpace:"nowrap"}}>{c.who}</span>
              <span style={{color:"#aeaeb2",whiteSpace:"nowrap"}}>{c.time}</span>
              <span style={{color:"#3a3a3c",flex:1,lineHeight:1.4}}>{c.text}</span>
              <button onClick={()=>onDelete(task.id,c.id)}
                style={{background:"none",border:"none",cursor:"pointer",color:"#c7c7cc",fontSize:12,padding:0}}>×</button>
            </div>
          ))}
          <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
            <select value={who} onChange={e=>setWho(e.target.value)} style={{
              background:"rgba(0,0,0,.05)",border:"none",borderRadius:6,
              color:MEMBER_COLORS[who]||"#636366",fontSize:11,fontWeight:600,padding:"4px 7px",outline:"none"}}>
              {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
              onKeyDown={e=>{
                if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();}
                if(e.key==="Enter"&&e.shiftKey){handleAdd();}
              }}
              placeholder="メモを入力... (Shift+Enterで追加)"
              style={{flex:1,minWidth:80,background:"rgba(0,0,0,.05)",border:"none",borderRadius:6,
                color:"#1c1c1e",fontSize:11,padding:"4px 8px",outline:"none"}}/>
            <button onClick={handleAdd} style={{background:"#0a84ff",border:"none",borderRadius:6,
              color:"#fff",fontSize:11,fontWeight:600,padding:"4px 10px",cursor:"pointer"}}>追加</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── タスクカード（ドラッグ対応）──
function TaskCard({task, onCycleStatus, onSetDate, onDelete, onEdit, onAddComment, onDeleteComment, onDragStart, onDragOver, onDropTask, onToggleUrgent, currentUser}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [dragging, setDragging] = useState(false);
  const df = task.date ? fmtDate(task.date) : null;
  const isDone = task.status==="done";
  const isDeadlineUrgent = !isDone&&df&&df.diff<0;
  const isSoon = !isDone&&df&&(df.diff===0||df.diff===1);
  const isUrgentFlag = !!task.urgent && !isDone;
  const borderLeft = isUrgentFlag?"3px solid #ff453a":isDeadlineUrgent?"3px solid #ff453a":isSoon?"3px solid #ff9f0a":"3px solid transparent";
  const cardBg = isUrgentFlag ? "rgba(255,69,58,.04)" : "#fff";
  const commitEdit = () => { if (editText.trim()) onEdit(task.id, editText.trim()); setEditing(false); };

  return (
    <div
      draggable={!editing}
      onDragStart={e=>{
        setDragging(true);
        onDragStart(task.id);
        e.dataTransfer.effectAllowed="move";
        e.stopPropagation();
      }}
      onDragEnd={()=>setDragging(false)}
      onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); if(onDragOver) onDragOver(task.id); }}
      onDrop={e=>{ e.preventDefault(); e.stopPropagation(); if(onDropTask) onDropTask(task.id); }}
      style={{
        background: cardBg, borderRadius:10, padding:"12px 14px",
        boxShadow: dragging
          ? "0 16px 40px rgba(0,0,0,.22), 0 0 0 2px #0a84ff"
          : isUrgentFlag
          ? "0 1px 4px rgba(255,69,58,.15), 0 0 0 1px rgba(255,69,58,.2)"
          : "0 1px 4px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.06)",
        borderLeft, opacity: dragging ? 0.55 : isDone ? 0.4 : 1,
        marginBottom:8, transition:"box-shadow .2s, opacity .2s, transform .2s",
        transform: dragging ? "scale(1.03) rotate(1deg)" : "scale(1) rotate(0deg)",
        cursor: editing ? "default" : "grab",
      }}
      onMouseEnter={e=>{ if(!dragging) e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.06)"; }}
      onMouseLeave={e=>{ if(!dragging) e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.06)"; }}>

      {editing ? (
        <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:8}}>
          <input autoFocus value={editText} onChange={e=>setEditText(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&e.shiftKey)commitEdit();if(e.key==="Escape")setEditing(false);if(e.key==="Enter"&&!e.shiftKey)e.preventDefault();}}
            style={{flex:1,background:"#f2f2f7",border:"1.5px solid #0a84ff",borderRadius:7,
              fontSize:13,fontWeight:500,color:"#1c1c1e",padding:"4px 8px",outline:"none"}}/>
          <button onClick={commitEdit} style={{background:"#0a84ff",border:"none",borderRadius:6,
            color:"#fff",fontSize:11,fontWeight:600,padding:"4px 10px",cursor:"pointer"}}>保存</button>
          <button onClick={()=>setEditing(false)} style={{background:"rgba(0,0,0,.06)",border:"none",borderRadius:6,
            color:"#636366",fontSize:11,fontWeight:600,padding:"4px 8px",cursor:"pointer"}}>取消</button>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:4,marginBottom:8}}>
          <span onClick={()=>setEditing(true)} style={{
            fontSize:13,fontWeight:500,color:isDone?"#aeaeb2":"#1c1c1e",
            lineHeight:1.4,cursor:"text",flex:1,
            textDecoration:isDone?"line-through":"none"}}>{task.text}</span>
          <button onClick={e=>{e.stopPropagation();onToggleUrgent(task.id);}} title={isUrgentFlag?"緊急解除":"緊急にする"} style={{
            background: isUrgentFlag?"rgba(255,69,58,.15)":"none",
            border: isUrgentFlag?"1px solid rgba(255,69,58,.4)":"1px solid transparent",
            borderRadius:5, cursor:"pointer",
            color: isUrgentFlag?"#ff453a":"#d1d1d6",
            fontSize:11, fontWeight:700, lineHeight:1, padding:"1px 4px", flexShrink:0, marginTop:1,
            transition:"all .15s"}}
            onMouseEnter={e=>{if(!isUrgentFlag){e.currentTarget.style.color="#ff453a";e.currentTarget.style.borderColor="rgba(255,69,58,.3)";}}}
            onMouseLeave={e=>{if(!isUrgentFlag){e.currentTarget.style.color="#d1d1d6";e.currentTarget.style.borderColor="transparent";}}}>!</button>
          <button onClick={e=>{e.stopPropagation();onDelete(task.id);}} style={{
            background:"none",border:"none",cursor:"pointer",color:"#d1d1d6",
            fontSize:14,lineHeight:1,padding:"0 2px",flexShrink:0,marginTop:1}}
            onMouseEnter={e=>e.currentTarget.style.color="#ff453a"}
            onMouseLeave={e=>e.currentTarget.style.color="#d1d1d6"}>×</button>
        </div>
      )}
      <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
        <StatusPill status={task.status} onClick={()=>onCycleStatus(task.id)}/>
        <MemberPill member={task.member||"その他"}/>
        <DeadlineChip dateStr={task.date} taskId={task.id} onSetDate={onSetDate}/>
      </div>
      <CommentPanel task={task} onAdd={onAddComment} onDelete={onDeleteComment} currentUser={currentUser}/>
    </div>
  );
}

// ── サイドバー プロジェクト行（名前変更＋ドラッグ並び替え対応）──
function SidebarProjectItem({name, color, count, isActive, onSelect, onRename, onDelete, onProjectDragStart, onProjectDrop}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  const startEdit = (e) => {
    e.stopPropagation();
    setVal(name);
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
  };
  const commit = () => {
    if (val.trim() && val.trim() !== name) onRename(val.trim());
    setEditing(false);
  };

  if (editing) return (
    <div style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:8,background:"rgba(255,255,255,.1)"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/>
      <input
        ref={inputRef}
        value={val}
        onChange={e=>setVal(e.target.value.slice(0,20))}
        onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") setEditing(false); }}
        onBlur={commit}
        maxLength={20}
        style={{flex:1,background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.2)",
          borderRadius:5,color:"#f0ede6",fontSize:12,fontWeight:500,
          padding:"2px 6px",outline:"none",minWidth:0}}/>
      <span style={{fontSize:10,color:val.length>=18?"#ff453a":"#636366",flexShrink:0}}>{val.length}/20</span>
    </div>
  );

  return (
    <div className={`sb-proj-row${dragOver?" sb-drag-over":""}`}
      draggable
      onDragStart={e=>{ e.stopPropagation(); onProjectDragStart(name); e.dataTransfer.effectAllowed="move"; }}
      onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{ e.preventDefault(); e.stopPropagation(); setDragOver(false); onProjectDrop(name); }}
      onMouseEnter={e=>{e.currentTarget.querySelectorAll('button:not(.sb-item)').forEach(b=>b.style.opacity=1);}}
      onMouseLeave={e=>{e.currentTarget.querySelectorAll('button:not(.sb-item)').forEach(b=>b.style.opacity=0);}}>
      <span style={{cursor:"grab",color:"#48484a",fontSize:11,padding:"0 2px 0 4px",userSelect:"none",flexShrink:0,lineHeight:1}} title="ドラッグして並び替え">⠿</span>
      <button className={`sb-item${isActive?" on":""}`} onClick={onSelect}>
        <span className="sb-dot" style={{background:color}}/>
        <span className="sb-label">{name}</span>
        <span className="sb-count">{count}</span>
      </button>
      <button onClick={startEdit} title="名前変更" style={{
        background:"rgba(255,255,255,.15)",border:"none",cursor:"pointer",
        color:"#fff",fontSize:"11px",fontWeight:700,padding:"2px 7px",
        borderRadius:5,opacity:0,transition:"opacity .15s, background .15s",lineHeight:"1.4",flexShrink:0
      }}
        onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.background="rgba(10,132,255,.6)";}}
        onMouseLeave={e=>{e.currentTarget.style.opacity=0;e.currentTarget.style.background="rgba(255,255,255,.15)";}}>✎</button>
      <button onClick={onDelete} title="削除" style={{
        background:"rgba(255,255,255,.15)",border:"none",cursor:"pointer",
        color:"#fff",fontSize:"11px",fontWeight:700,padding:"2px 7px",
        borderRadius:5,opacity:0,transition:"opacity .15s, background .15s",lineHeight:"1.4",flexShrink:0
      }}
        onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.background="rgba(255,69,58,.6)";}}
        onMouseLeave={e=>{e.currentTarget.style.opacity=0;e.currentTarget.style.background="rgba(255,255,255,.15)";}}>✕</button>
    </div>
  );
}

// ── プロジェクト列（ドロップゾーン）──
function ProjectColumn({project, tasks, color, currentUser, onCycleStatus, onSetDate, onDelete, onEdit, onAddTask, onAddComment, onDeleteComment, onSetConfirmDelete, onDragStart, onDrop, onProjectDragStart, onProjectDrop, setDragOverProject, isProjectDragOver, onReorderTask, onToggleUrgent}) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newMember, setNewMember] = useState(currentUser || MEMBERS[0]);
  // currentUserが変わったらnewMemberも更新
  useEffect(()=>{ if(currentUser) setNewMember(currentUser); }, [currentUser]);
  const [newDate, setNewDate] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dropTargetId, setDropTargetId] = useState(null);
  const inputRef = useRef();
  const pendingCount = tasks.filter(t=>t.status!=="done").length;

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAddTask({text:newText.trim(), member:newMember, project, date:newDate});
    setNewText(""); setNewDate(""); setAdding(false);
  };

  return (
    <div id={`col-${project}`} style={{
      width:280, flexShrink:0, display:"flex", flexDirection:"column",
      background: dragOver ? `${color}08` : "rgba(246,246,248,1)",
      borderRadius:12,
      border: isProjectDragOver ? `2px dashed ${color}` : dragOver ? `2px solid ${color}` : "1px solid rgba(0,0,0,.07)",
      overflow:"hidden", transition:"border .15s, background .15s",
      opacity: isProjectDragOver ? 0.7 : 1,
    }}
      onDragOver={e=>{ e.preventDefault(); setDragOver(true); if(setDragOverProject) setDragOverProject(project); }}
      onDragLeave={e=>{ if(!e.currentTarget.contains(e.relatedTarget)){ setDragOver(false); setDropTargetId(null); if(setDragOverProject) setDragOverProject(null); } }}
      onDrop={e=>{ e.preventDefault(); setDragOver(false); setDropTargetId(null); if(setDragOverProject) setDragOverProject(null); onDrop(project); onProjectDrop(project); }}>

      {/* ヘッダー */}
      <div style={{padding:"12px 14px 10px",borderBottom:`2px solid ${color}60`,background:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flex:1}}>
            <span
              draggable
              onDragStart={e=>{ e.stopPropagation(); onProjectDragStart(project); e.dataTransfer.effectAllowed="move"; }}
              onDragEnd={()=>{}}
              style={{cursor:"grab",color:"#c7c7cc",fontSize:16,userSelect:"none",padding:"0 2px",lineHeight:1}}
              title="ドラッグして並び替え">&#x2630;</span>
            <span style={{width:9,height:9,borderRadius:"50%",background:color,display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:700,color:"#1c1c1e"}}>{project}</span>
            <span style={{fontSize:11,fontWeight:600,color,background:color+"18",borderRadius:"20px",padding:"1px 7px"}}>{pendingCount}</span>
          </div>
          <button onClick={()=>onSetConfirmDelete(project)}
            style={{background:"none",border:"1px solid rgba(255,69,58,.25)",borderRadius:6,cursor:"pointer",
              color:"#ff453a",fontSize:11,fontWeight:600,padding:"2px 8px",lineHeight:1,transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,69,58,.1)"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}>削除</button>
        </div>
        <button onClick={()=>{setAdding(true);setTimeout(()=>inputRef.current?.focus(),60)}}
          style={{width:"100%",background:"rgba(0,0,0,.04)",border:"1px dashed rgba(0,0,0,.12)",
            borderRadius:8,color:"#8e8e93",fontSize:12,fontWeight:500,padding:"6px 0",cursor:"pointer",transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background=color+"12";e.currentTarget.style.borderColor=color;e.currentTarget.style.color=color;}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(0,0,0,.04)";e.currentTarget.style.borderColor="rgba(0,0,0,.12)";e.currentTarget.style.color="#8e8e93";}}>
          ＋ タスクを追加
        </button>
      </div>

      {/* タスクエリア */}
      <div style={{flex:1,overflowY:"auto",padding:"10px 10px 0"}}>
        {adding && (
          <div style={{background:"#fff",borderRadius:10,padding:"10px 12px",marginBottom:8,
            boxShadow:`0 0 0 2px ${color}, 0 4px 12px rgba(0,0,0,.1)`}}>
            <input ref={inputRef} value={newText} onChange={e=>setNewText(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&e.shiftKey)handleAdd();if(e.key==="Escape")setAdding(false);if(e.key==="Enter"&&!e.shiftKey)e.preventDefault();}}
              placeholder="タスク名... (Shift+Enterで追加)"
              style={{width:"100%",background:"none",border:"none",outline:"none",
                fontSize:13,color:"#1c1c1e",fontFamily:"inherit",marginBottom:8}}/>
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <select value={newMember} onChange={e=>setNewMember(e.target.value)} style={{
                background:"rgba(0,0,0,.06)",border:"none",borderRadius:6,
                color:MEMBER_COLORS[newMember],fontSize:11,fontWeight:600,padding:"4px 7px",outline:"none"}}>
                {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                style={{background:"rgba(0,0,0,.06)",border:"none",borderRadius:6,
                  fontSize:11,color:"#3a3a3c",padding:"4px 7px",outline:"none",cursor:"pointer"}}/>
              <div style={{marginLeft:"auto",display:"flex",gap:5}}>
                <button onClick={()=>setAdding(false)} style={{background:"rgba(0,0,0,.06)",border:"none",
                  borderRadius:6,color:"#636366",fontSize:11,fontWeight:600,padding:"4px 9px",cursor:"pointer"}}>取消</button>
                <button onClick={handleAdd} style={{background:color,border:"none",
                  borderRadius:6,color:"#fff",fontSize:11,fontWeight:600,padding:"4px 11px",cursor:"pointer"}}>追加</button>
              </div>
            </div>
          </div>
        )}

        {/* ドロップヒント */}
        {dragOver && (
          <div style={{border:`2px dashed ${color}`,borderRadius:10,padding:"16px 0",
            textAlign:"center",color,fontSize:12,fontWeight:600,marginBottom:8,
            background:color+"0a"}}>
            ここにドロップ
          </div>
        )}

        {tasks.length===0&&!adding&&!dragOver&&(
          <div style={{textAlign:"center",padding:"24px 0",color:"#c7c7cc",fontSize:12,fontStyle:"italic"}}>タスクなし</div>
        )}
        {tasks.map(t=>(
          <div key={t.id}>
            {dropTargetId===t.id && (
              <div style={{height:3,background:"#0a84ff",borderRadius:3,margin:"0 0 6px",
                boxShadow:"0 0 6px rgba(10,132,255,.5)",transition:"all .1s"}}/>
            )}
            <TaskCard task={t}
              onCycleStatus={onCycleStatus} onSetDate={onSetDate}
              onDelete={onDelete} onEdit={onEdit}
              onAddComment={onAddComment} onDeleteComment={onDeleteComment}
              onDragStart={onDragStart}
              onDragOver={()=>setDropTargetId(t.id)}
              onDropTask={()=>{ if(onReorderTask) onReorderTask(t.id); setDropTargetId(null); }}
              onToggleUrgent={onToggleUrgent}
              currentUser={currentUser}/>
          </div>
        ))}
        <div style={{height:10}}/>
      </div>
    </div>
  );
}

const css=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e8e8ed;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','Inter',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
.window{width:100%;min-height:100vh;display:flex;flex-direction:column}
.titlebar{height:44px;background:rgba(22,22,24,.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;padding:0 16px;gap:8px;flex-shrink:0;position:sticky;top:0;z-index:20}
.traffic{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.traffic.r{background:#ff5f57}.traffic.y{background:#febc2e}.traffic.g{background:#28c840}
.win-title{font-size:13px;font-weight:600;color:#f0ede6;margin:0 auto;letter-spacing:.01em}
.sync-pill{font-size:11px;font-weight:500;color:#8e8e93;background:rgba(255,255,255,.08);border-radius:20px;padding:3px 10px;display:flex;align-items:center;gap:5px;white-space:nowrap}
.sync-pill.saving{color:#0a84ff}
.pulse{width:5px;height:5px;border-radius:50%;background:currentColor}
.inner{display:flex;flex:1;overflow:hidden;min-height:calc(100vh - 44px)}
.sidebar{width:200px;flex-shrink:0;background:rgba(22,22,24,.97);border-right:1px solid rgba(255,255,255,.06);padding:12px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.sb-logo{font-size:17px;font-weight:800;color:#f0ede6;letter-spacing:-.5px;padding:6px 10px 14px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:6px}
.sb-section{font-size:10px;font-weight:700;color:#aeaeb2;letter-spacing:.08em;text-transform:uppercase;padding:10px 10px 4px;display:flex;align-items:center;justify-content:space-between}
.sb-plus{background:rgba(10,132,255,.18);border:none;cursor:pointer;color:#0a84ff;font-size:13px;font-weight:700;line-height:1;padding:2px 7px;border-radius:6px;transition:all .15s}
.sb-plus:hover{background:rgba(10,132,255,.3);color:#3fa9ff}
.sb-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;border:none;background:none;width:100%;text-align:left;transition:background .12s}
.sb-item:hover{background:rgba(255,255,255,.07)}
.sb-item.on{background:rgba(255,255,255,.11)}
.sb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.sb-label{font-size:12.5px;font-weight:500;color:#d0d0d0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px}
.sb-count{font-size:11px;color:#48484a;font-weight:500;flex-shrink:0}
.sb-proj-row{display:flex;align-items:center;border-radius:8px;transition:background .1s,border .1s;border:1.5px solid transparent}
.sb-proj-row:hover{background:rgba(255,255,255,.07)}
.sb-proj-row .sb-item{background:none !important}
.sb-drag-over{background:rgba(10,132,255,.15)!important;border-color:rgba(10,132,255,.5)!important}
.sb-proj-del{background:none;border:none;cursor:pointer;color:#48484a;font-size:11px;padding:4px 8px 4px 0;opacity:0;transition:opacity .15s;line-height:1;flex-shrink:0}
.sb-proj-row:hover .sb-proj-del{opacity:1}
.sb-proj-del:hover{color:#ff453a}
.sb-footer{padding:10px 10px 6px;border-top:1px solid rgba(255,255,255,.06);margin-top:auto}
.board-wrap{flex:1;overflow:hidden;display:flex;flex-direction:column}
.board{display:flex;gap:12px;padding:16px 20px 20px;overflow-x:auto;flex:1;align-items:flex-start;scroll-behavior:smooth;user-select:none}
.board::-webkit-scrollbar{height:8px}
.board::-webkit-scrollbar-track{background:rgba(0,0,0,.06);border-radius:10px}
.board::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:10px;transition:background .2s}
.board::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.35)}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(3px)}
.modal{background:#fff;border-radius:14px;padding:24px;width:300px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.modal h3{font-size:15px;font-weight:700;color:#1c1c1e;margin-bottom:16px}
.modal-input{width:100%;background:#f2f2f7;border:none;border-radius:8px;font-size:14px;color:#1c1c1e;padding:10px 12px;outline:none;font-family:inherit}
.modal-input:focus{box-shadow:0 0 0 3px rgba(10,132,255,.2)}
.modal-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.btn-cancel{background:rgba(0,0,0,.06);border:none;border-radius:8px;color:#636366;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer}
.btn-ok{background:#0a84ff;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer}
`;

export default function App() {
  const [authUser, setAuthUser] = useState(null); // {name, email, picture}
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSync, setLastSync] = useState("--");
  const [filterMember, setFilterMember] = useState("all");
  const [filterProject, setFilterProject] = useState("all"); // サイドバープロジェクトフィルター
  const [showProjModal, setShowProjModal] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const dragTaskId = useRef(null);
  const dragProjectName = useRef(null);
  const dragType = useRef(null);
  const boardRef = useRef(null);
  const scrollStart = useRef({x:0, left:0});
  const [isScrolling, setIsScrolling] = useState(false);
  const autoScrollRef = useRef(null);

  // ドラッグ中の端スクロール
  const startAutoScroll = (e) => {
    stopAutoScroll();
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const ZONE = 80; // 端からこのpx以内でスクロール開始
    const SPEED = 12;
    const x = e.clientX;
    let dir = 0;
    if (x < rect.left + ZONE) dir = -1;
    else if (x > rect.right - ZONE) dir = 1;
    if (dir !== 0) {
      autoScrollRef.current = setInterval(() => {
        board.scrollLeft += dir * SPEED;
      }, 16);
    }
  };
  const stopAutoScroll = () => {
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null; }
  };
  const [dragOverProject, setDragOverProject] = useState(null);

  const ts = () => new Date().toLocaleString("ja-JP",{hour:"2-digit",minute:"2-digit"});

  useEffect(()=>{
    // Google認証チェック（localStorageに保存済みなら自動通過）
    loadAuth().then(saved => {
      if (saved?.email) {
        const domain = saved.email.split("@")[1];
        if (domain === ALLOWED_DOMAIN || !ALLOWED_DOMAIN) setAuthUser(saved);
      }
      setAuthLoading(false);
    });
    // Google Sign-In コールバック
    window.__googleSignInCallback = (response) => {
      const b64 = response.credential.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
      const payload = JSON.parse(atob(b64.padEnd(b64.length+(4-b64.length%4)%4,"=")));
      const domain = payload.email?.split("@")[1];
      if (domain === ALLOWED_DOMAIN || !ALLOWED_DOMAIN) {
        const info = { name: payload.name, email: payload.email, picture: payload.picture };
        saveAuth(info);
        setAuthUser(info);
      } else {
        alert(`${ALLOWED_DOMAIN} のアカウントのみアクセスできます`);
      }
    };
    // Google Sign-Inスクリプトを動的に読み込んで初期化
    const CLIENT_ID = '102123014963-0ggc4knhhcq58g9k6gvhrtvjnb3nojb5.apps.googleusercontent.com';
    const initGoogle = () => {
      if (typeof google === 'undefined') return;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: window.__googleSignInCallback,
      });
      google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'ja', width: 220 }
      );
    };
    if (!document.getElementById('google-signin-script')) {
      const script = document.createElement('script');
      script.id = 'google-signin-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else {
      // すでに読み込み済みの場合
      setTimeout(initGoogle, 100);
    }
    Promise.all([loadShared(), loadUser()]).then(([d,u])=>{
      const base = d || {tasks:[], projects:[...DEFAULT_PROJECTS]};
      // colorsマップがなければ自動生成
      if (!base.colors) base.colors = assignColors(base.projects, {});
      setData(base);
      setCurrentUser(u || null);
      setLastSync(ts());
    });
    const iv=setInterval(()=>loadShared().then(d=>{if(d){setData(d);setLastSync(ts());}}),15000);
    return ()=>clearInterval(iv);
  },[]);

  // ログイン画面が表示されたタイミングでGoogleボタンを描画
  useEffect(()=>{
    if (!authLoading && !authUser && data) {
      const render = () => {
        if (typeof google === 'undefined') return;
        const btn = document.getElementById('google-signin-btn');
        if (!btn) return;
        google.accounts.id.renderButton(btn, {
          theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'ja', width: 220
        });
      };
      setTimeout(render, 150);
    }
  },[authLoading, authUser, data]);

  const save = async next=>{ setData(next); setSaving(true); await saveShared(next); setSaving(false); setLastSync(ts()); };

  const tasks = data?.tasks||[];
  const projects = data?.projects||DEFAULT_PROJECTS;

  const cycleStatus = id=>save({...data,tasks:tasks.map(t=>t.id===id?{...t,status:STATUS_CYCLE[t.status]??"undecided"}:t)});
  const toggleUrgent = id=>save({...data,tasks:tasks.map(t=>t.id===id?{...t,urgent:!t.urgent}:t)});
  const setDate=(id,date)=>save({...data,tasks:tasks.map(t=>t.id===id?{...t,date}:t)});
  const editTask=(id,text)=>save({...data,tasks:tasks.map(t=>t.id===id?{...t,text}:t)});
  const deleteTask=id=>save({...data,tasks:tasks.filter(t=>t.id!==id)});
  const addComment=(tid,c)=>save({...data,tasks:tasks.map(t=>t.id===tid?{...t,comments:[...(t.comments||[]),c]}:t)});
  const delComment=(tid,cid)=>save({...data,tasks:tasks.map(t=>t.id===tid?{...t,comments:(t.comments||[]).filter(c=>c.id!==cid)}:t)});
  const selectUser=async name=>{ setCurrentUser(name); await saveUser(name); };
  const addTask=({text,member,project,date})=>{
    save({...data,tasks:[{id:crypto.randomUUID(),text,member,project,status:"undecided",
      date,comments:[],createdAt:new Date().toISOString()},...tasks]});
  };
  const addProject=()=>{
    if (!newProjName.trim()||projects.includes(newProjName.trim())) return;
    const newProjects = [...projects, newProjName.trim()];
    const newColors = assignColors(newProjects, data.colors||{});
    save({...data, projects:newProjects, colors:newColors});
    setNewProjName(""); setShowProjModal(false);
  };
  const renameProject=(oldName, newName)=>{
    if (!newName.trim() || newName===oldName || projects.includes(newName.trim())) return;
    const newColors = {...(data.colors||{})};
    if (newColors[oldName]) { newColors[newName.trim()] = newColors[oldName]; delete newColors[oldName]; }
    save({
      ...data,
      tasks: tasks.map(t=>t.project===oldName?{...t,project:newName.trim()}:t),
      projects: projects.map(p=>p===oldName?newName.trim():p),
      colors: newColors
    });
    if (filterProject===oldName) setFilterProject(newName.trim());
  };
  const deleteProject=name=>{
    const newColors = {...(data.colors||{})};
    delete newColors[name];
    save({...data, tasks:tasks.map(t=>t.project===name?{...t,project:"その他"}:t), projects:projects.filter(p=>p!==name), colors:newColors});
    setConfirmDelete(null);
    if (filterProject===name) setFilterProject("all");
  };
  const handleReorderTask = (overTaskId) => {
    if (!dragTaskId.current || dragType.current !== "task" || dragTaskId.current === overTaskId) return;
    const allTasks = [...tasks];
    const dragIdx = allTasks.findIndex(t => t.id === dragTaskId.current);
    const overIdx = allTasks.findIndex(t => t.id === overTaskId);
    if (dragIdx === -1 || overIdx === -1) return;
    const [moved] = allTasks.splice(dragIdx, 1);
    allTasks.splice(overIdx, 0, moved);
    save({...data, tasks: allTasks});
  };
  const handleProjectDragStart = name => { dragProjectName.current = name; dragType.current = "project"; };
  const handleProjectDrop = toName => {
    if (dragType.current !== "project" || !dragProjectName.current || dragProjectName.current === toName) { dragProjectName.current = null; setDragOverProject(null); dragType.current = null; return; }
    const from = projects.indexOf(dragProjectName.current);
    const to = projects.indexOf(toName);
    const newProjects = [...projects];
    newProjects.splice(from, 1);
    newProjects.splice(to, 0, dragProjectName.current);
    save({...data, projects: newProjects, colors: data.colors||{}});
    dragProjectName.current = null;
    setDragOverProject(null);
  };

  // ドラッグ&ドロップでプロジェクト移動
  const handleDragStart = id => { dragTaskId.current = id; dragType.current = "task"; };
  const handleDrop = toProject => {
    if (dragType.current !== "task" || !dragTaskId.current) return;
    save({...data,tasks:tasks.map(t=>t.id===dragTaskId.current?{...t,project:toProject}:t)});
    dragTaskId.current = null; dragType.current = null;
  };

  // フィルター適用
  let visibleTasks = filterMember==="all" ? tasks : tasks.filter(t=>t.member===filterMember);
  const visibleProjects = filterProject==="all" ? projects : projects.filter(p=>p===filterProject);

  if (!data) return <><style>{css}</style><div className="window" style={{alignItems:"center",justifyContent:"center",paddingTop:80,color:"#aaa",fontSize:13}}>読み込み中...</div></>;

  // ローディング中
  if (authLoading) return <><style>{css}</style><div style={{minHeight:"100vh",background:"#161618",display:"flex",alignItems:"center",justifyContent:"center",color:"#636366",fontSize:13}}>認証確認中...</div></>;

  // Google認証画面
  if (!authUser) return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"#161618",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#1c1c1e",borderRadius:16,padding:40,width:300,
          boxShadow:"0 20px 60px rgba(0,0,0,.5)",textAlign:"center"}}>
          <div style={{fontSize:26,fontWeight:800,color:"#f0ede6",letterSpacing:"-.5px",marginBottom:8}}>Link</div>
          <div style={{fontSize:13,color:"#636366",marginBottom:32}}>CinemaLeapのアカウントでログイン</div>
          {/* Google Sign-In ボタン */}
          <div id="google-signin-btn" style={{display:"flex",justifyContent:"center",minHeight:44}}/>
          <div style={{marginTop:20,fontSize:11,color:"#48484a"}}>
            {ALLOWED_DOMAIN} のアカウントのみ
          </div>
        </div>
      </div>
    </>
  );

  if (!currentUser) return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:"#161618",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{background:"#1c1c1e",borderRadius:16,padding:32,width:280,
          boxShadow:"0 20px 60px rgba(0,0,0,.5)",textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:800,color:"#f0ede6",letterSpacing:"-.5px",marginBottom:8}}>Link</div>
          <div style={{fontSize:13,color:"#636366",marginBottom:28}}>あなたの名前を選んでください</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {MEMBERS.map(m=>(
              <button key={m} onClick={()=>selectUser(m)} style={{
                background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",
                borderRadius:10,padding:"12px 16px",cursor:"pointer",
                display:"flex",alignItems:"center",gap:10,transition:"all .15s",width:"100%"
              }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.borderColor=MEMBER_COLORS[m];}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.08)";}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:MEMBER_COLORS[m],flexShrink:0}}/>
                <span style={{fontSize:14,fontWeight:600,color:"#f0ede6"}}>{m}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div className="window">
        <div className="titlebar">
          <div className="traffic r"/><div className="traffic y"/><div className="traffic g"/>
          <div className="win-title">
            Link — Team Board {VERSION}
          </div>
          <div className={`sync-pill${saving?" saving":""}`}>
            <span className="pulse"/>
            {saving?"保存中...":`同期 ${lastSync}`}
          </div>
        </div>

        <div className="inner">
          {/* サイドバー */}
          <div className="sidebar">
            <div className="sb-logo">Link</div>

            <div className="sb-section">担当者</div>
            {[["all","全員","#636366"], ...MEMBERS.map(m=>[m,m,MEMBER_COLORS[m]])].map(([k,l,c])=>(
              <button key={k} className={`sb-item${filterMember===k?" on":""}`} onClick={()=>setFilterMember(k)}>
                <span className="sb-dot" style={{background:c}}/>
                <span className="sb-label">{l}</span>
                <span className="sb-count">{k==="all"?tasks.length:tasks.filter(t=>t.member===k).length}</span>
              </button>
            ))}

            <div className="sb-section" style={{marginTop:8}}>
              プロジェクト
              <button className="sb-plus" onClick={()=>setShowProjModal(true)} title="プロジェクトを追加">＋ 追加</button>
            </div>
            {/* 全件表示ボタン */}
            <button className={`sb-item${filterProject==="all"?" on":""}`} onClick={()=>setFilterProject("all")}>
              <span className="sb-dot" style={{background:"#636366"}}/>
              <span className="sb-label">すべて</span>
              <span className="sb-count">{tasks.length}</span>
            </button>
            {/* 各プロジェクト → クリックでフィルター（スクロールなし） */}
            {projects.map(p=>{
              const c = projColor(p,data.colors);
              return(
                <SidebarProjectItem
                  key={p}
                  name={p}
                  color={c}
                  count={tasks.filter(t=>t.project===p).length}
                  isActive={filterProject===p}
                  onSelect={()=>setFilterProject(p)}
                  onRename={(newName)=>renameProject(p, newName)}
                  onDelete={()=>setConfirmDelete(p)}
                  onProjectDragStart={handleProjectDragStart}
                  onProjectDrop={handleProjectDrop}
                />
              );
            })}

            <div className="sb-footer">
              <div style={{fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:MEMBER_COLORS[currentUser]||"#636366",flexShrink:0}}/>
                <span style={{color:"#d0d0d0"}}>{currentUser}</span>
                <button onClick={()=>selectUser(null)} style={{marginLeft:"auto",background:"none",border:"none",
                  cursor:"pointer",color:"#48484a",fontSize:11}} title="切り替え">⇄</button>
                <button onClick={()=>{ saveAuth(null); setAuthUser(null); }} style={{background:"none",border:"none",
                  cursor:"pointer",color:"#48484a",fontSize:11}} title="ログアウト">⏻</button>
              </div>
              <span style={{fontSize:10,color:"#48484a"}}>{VERSION}</span>
            </div>
          </div>

          {/* カンバンボード */}
          <div className="board-wrap">
            <div className="board" ref={boardRef}
              onWheel={e=>{
                if(e.deltaY!==0){ e.preventDefault(); boardRef.current.scrollLeft+=e.deltaY*1.5; }
              }}
              onDragOver={e=>{ startAutoScroll(e); }}
              onDragLeave={e=>{ stopAutoScroll(); }}
              onDrop={()=>{ stopAutoScroll(); }}
              onMouseDown={e=>{
                // タスクカードやボタン以外の場所でドラッグスクロール
                if(e.target===boardRef.current||e.target.classList.contains('board')){
                  setIsScrolling(true);
                  scrollStart.current={x:e.clientX, left:boardRef.current.scrollLeft};
                  boardRef.current.style.cursor='grabbing';
                }
              }}
              onMouseMove={e=>{
                if(!isScrolling) return;
                const dx = e.clientX - scrollStart.current.x;
                boardRef.current.scrollLeft = scrollStart.current.left - dx;
              }}
              onMouseUp={()=>{ setIsScrolling(false); if(boardRef.current) boardRef.current.style.cursor=''; }}
              onMouseLeave={()=>{ setIsScrolling(false); if(boardRef.current) boardRef.current.style.cursor=''; }}
              style={{cursor: isScrolling?'grabbing':'default'}}
            >
              {visibleProjects.map(p=>(
                <ProjectColumn
                  key={p}
                  project={p}
                  tasks={visibleTasks.filter(t=>t.project===p)}
                  color={projColor(p,data.colors)}
                  currentUser={currentUser}
                  onCycleStatus={cycleStatus}
                  onSetDate={setDate}
                  onDelete={deleteTask}
                  onEdit={editTask}
                  onAddTask={addTask}
                  onAddComment={addComment}
                  onDeleteComment={delComment}
                  onSetConfirmDelete={setConfirmDelete}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onProjectDragStart={handleProjectDragStart}
                  onProjectDrop={handleProjectDrop}
                  setDragOverProject={setDragOverProject}
                  isProjectDragOver={dragOverProject===p}
                  onReorderTask={(overId) => handleReorderTask(overId)}
                  onToggleUrgent={toggleUrgent}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showProjModal&&(
        <div className="modal-bg" onClick={()=>setShowProjModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>プロジェクトを追加</h3>
            <div style={{position:"relative"}}>
              <input className="modal-input" placeholder="プロジェクト名..." value={newProjName}
                onChange={e=>setNewProjName(e.target.value.slice(0,20))}
                onKeyDown={e=>e.key==="Enter"&&addProject()} autoFocus maxLength={20}/>
              <span style={{position:"absolute",right:10,bottom:10,fontSize:10,color:newProjName.length>=18?"#ff453a":"#aeaeb2"}}>
                {newProjName.length}/20
              </span>
            </div>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={()=>setShowProjModal(false)}>キャンセル</button>
              <button className="btn-ok" onClick={addProject}>追加</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete&&(
        <div className="modal-bg" onClick={()=>setConfirmDelete(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{color:"#ff453a"}}>プロジェクトを削除</h3>
            <p style={{fontSize:13,color:"#3a3a3c",lineHeight:1.6,margin:"8px 0 20px"}}>
              「<strong>{confirmDelete}</strong>」を削除しますか？<br/>
              <span style={{color:"#8e8e93",fontSize:12}}>タスクは「その他」に移動されます。</span>
            </p>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={()=>setConfirmDelete(null)}>キャンセル</button>
              <button style={{background:"#ff453a",border:"none",borderRadius:8,color:"#fff",fontSize:13,
                fontWeight:600,padding:"8px 14px",cursor:"pointer"}}
                onClick={()=>deleteProject(confirmDelete)}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
