import { useState, useEffect, useRef } from 'react'

// ここにApps ScriptのURLを貼る
const API_URL = import.meta.env.VITE_API_URL

const MEMBERS = ['待場', '内藤', '井上']
const MEMBER_COLORS = { '待場': '#c8f564', '内藤': '#8ac8e0', '井上': '#f5a623' }
const STATUS_CYCLE = { undecided: 'inprogress', inprogress: 'done', done: 'undecided' }
const STATUS_CONFIG = {
  undecided:  { label: '未定',   color: '#555',    bg: '#1a1a1a', border: '#2e2e2e', icon: '○' },
  inprogress: { label: '進行中', color: '#f5a623', bg: '#1f1500', border: '#6b4500', icon: '◑' },
  done:       { label: '完了',   color: '#c8f564', bg: '#0e1608', border: '#2a3a10', icon: '●' },
}

async function apiFetch(action, task) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, task }),
  })
  return res.json()
}

function getToday() { const d = new Date(); d.setHours(0,0,0,0); return d }

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const now = getToday()
  const diff = Math.round((d - now) / 86400000)
  const mm = d.getMonth() + 1, dd = d.getDate()
  const day = ['日','月','火','水','木','金','土'][d.getDay()]
  const label = diff === 0 ? '今日' : diff === 1 ? '明日' : null
  return { display: `${mm}/${dd}(${day})`, label, diff }
}

function DateBadge({ dateStr }) {
  if (!dateStr) return null
  const info = formatDate(dateStr)
  if (!info) return null
  const { display, label, diff } = info
  const color = diff < 0 ? '#e07060' : diff === 0 ? '#c8f564' : diff === 1 ? '#8ac8e0' : '#3a3a3a'
  const bg = diff === 0 ? '#1a220a' : diff < 0 ? '#1a0e0e' : '#111'
  return (
    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color, background:bg,
      border:`1px solid ${color}33`, borderRadius:'4px', padding:'1px 7px', marginLeft:'4px', whiteSpace:'nowrap' }}>
      {label ? `${label} ${display}` : display}
    </span>
  )
}

function MemberBadge({ member }) {
  const color = MEMBER_COLORS[member] || '#888'
  return (
    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px', color,
      background: color + '18', border:`1px solid ${color}44`,
      borderRadius:'4px', padding:'1px 8px', whiteSpace:'nowrap', fontWeight:'600' }}>
      {member}
    </span>
  )
}

function StatusBtn({ status, onClick }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.undecided
  return (
    <button onClick={onClick} style={{ background:cfg.bg, border:`1px solid ${cfg.border}`,
      borderRadius:'6px', color:cfg.color, fontFamily:"'DM Mono',monospace", fontSize:'10px',
      fontWeight:'600', padding:'3px 8px', cursor:'pointer', whiteSpace:'nowrap', transition:'all .15s' }}>
      {cfg.icon} {cfg.label}
    </button>
  )
}

function CommentSection({ task, onAdd, onDelete }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const [who, setWho] = useState(MEMBERS[0])
  const inputRef = useRef(null)
  const comments = task.comments || []

  const handleAdd = () => {
    if (!val.trim()) return
    const time = new Date().toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    onAdd(task.id, { id: Date.now().toString(), text: val.trim(), time, who })
    setVal('')
  }

  return (
    <div style={{ marginTop:'8px' }}>
      <button onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
        style={{ background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Mono',monospace",
          fontSize:'10px', color: comments.length > 0 ? '#8ac8e0' : '#333', padding:0,
          display:'flex', alignItems:'center', gap:'4px' }}>
        <span>{open ? '▾' : '▸'}</span>
        <span>{comments.length > 0 ? `コメント ${comments.length}件` : 'コメント追加'}</span>
      </button>
      {open && (
        <div style={{ marginTop:'8px', paddingLeft:'8px', borderLeft:'2px solid #1e1e1e' }}>
          {comments.map(c => (
            <div key={c.id} style={{ marginBottom:'6px', display:'flex', gap:'6px', alignItems:'flex-start' }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'10px',
                color: MEMBER_COLORS[c.who] || '#555', whiteSpace:'nowrap', marginTop:'2px', fontWeight:'600' }}>{c.who}</span>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:'9px', color:'#333', marginTop:'3px', whiteSpace:'nowrap' }}>{c.time}</span>
              <span style={{ fontSize:'12px', color:'#b0ada6', flex:1, lineHeight:1.5 }}>{c.text}</span>
              <button onClick={() => onDelete(task.id, c.id)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#333', fontSize:'11px', padding:'0 2px' }}>×</button>
            </div>
          ))}
          <div style={{ display:'flex', gap:'6px', marginTop:'6px', flexWrap:'wrap' }}>
            <select value={who} onChange={e => setWho(e.target.value)}
              style={{ background:'#0e0e0e', border:'1px solid #222', borderRadius:'6px',
                color: MEMBER_COLORS[who] || '#888', fontFamily:"'DM Mono',monospace",
                fontSize:'11px', padding:'5px 8px', outline:'none', cursor:'pointer' }}>
              {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="コメントを入力... (Enterで追加)"
              style={{ flex:1, minWidth:'120px', background:'#0e0e0e', border:'1px solid #222',
                borderRadius:'6px', color:'#e0ddd6', fontFamily:"'Syne',sans-serif",
                fontSize:'12px', padding:'5px 10px', outline:'none' }} />
            <button onClick={handleAdd}
              style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'6px',
                color:'#c8f564', fontFamily:"'DM Mono',monospace", fontSize:'11px',
                padding:'5px 10px', cursor:'pointer' }}>追加</button>
          </div>
        </div>
      )}
    </div>
  )
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0e0e0e;color:#f0ede6;font-family:'Syne',sans-serif;min-height:100vh}
  .app{min-height:100vh;padding:32px 24px;max-width:760px;margin:0 auto}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:36px;gap:12px}
  .logo{font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#555;margin-bottom:6px}
  .title{font-size:34px;font-weight:800;color:#f0ede6;line-height:1}
  .title span{color:#c8f564}
  .date-str{font-family:'DM Mono',monospace;font-size:12px;color:#444;margin-top:8px}
  .badge{background:#131a08;border:1px solid #2a3a10;border-radius:6px;padding:8px 14px;font-family:'DM Mono',monospace;font-size:11px;color:#7ab83a;white-space:nowrap;flex-shrink:0}
  .badge.saving{background:#111;border-color:#333;color:#666}
  .badge.error{background:#1a0808;border-color:#3a1010;color:#e07060}
  .tip{background:#111;border:1px solid #1e1e1e;border-left:3px solid #c8f564;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#666;line-height:1.75}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
  .stat{background:#111;border:1px solid #1a1a1a;border-radius:10px;padding:14px 16px}
  .stat-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#444;margin-bottom:6px;font-family:'DM Mono',monospace}
  .stat-val{font-size:24px;font-weight:800;color:#f0ede6}
  .stat-val.g{color:#c8f564}.stat-val.r{color:#e07060}.stat-val.y{color:#f5a623}.stat-val.d{color:#333}
  .filter-row{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center}
  .filter-label{font-family:'DM Mono',monospace;font-size:10px;color:#444;letter-spacing:.1em;text-transform:uppercase}
  .tab{font-family:'DM Mono',monospace;font-size:11px;padding:5px 11px;border-radius:6px;border:1px solid #1e1e1e;background:none;color:#444;cursor:pointer;transition:all .15s}
  .tab.on{background:#1a1a1a;color:#c8f564;border-color:#2a2a2a}
  .tab:hover:not(.on){color:#777}
  .sec-label{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#3a3a3a;font-family:'DM Mono',monospace;margin-bottom:10px;margin-top:20px}
  .task-list{display:flex;flex-direction:column;gap:7px;margin-bottom:28px}
  .task{background:#111;border:1px solid #1a1a1a;border-radius:10px;padding:14px;transition:border-color .15s;animation:fi .25s ease forwards;opacity:0}
  @keyframes fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
  .task:hover{border-color:#252525}
  .task.is-done{opacity:.3}
  .task.is-prog{border-color:#3a2800;background:#0f0b00}
  .task.is-over{border-color:#2a1a1a}
  .tt{font-size:14px;font-weight:600;color:#e8e5de;line-height:1.45;margin-bottom:7px;display:flex;align-items:center;flex-wrap:wrap;gap:4px}
  .task.is-done .tt{text-decoration:line-through;color:#444}
  .tm{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  .di{background:none;border:none;outline:none;font-family:'DM Mono',monospace;font-size:11px;color:#3a3a3a;cursor:pointer;padding:0}
  .di::-webkit-calendar-picker-indicator{filter:invert(.25);cursor:pointer}
  .add-box{background:#111;border:1px dashed #222;border-radius:10px;padding:16px;margin-bottom:24px}
  .add-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
  .add-row2{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .ai{flex:1;min-width:160px;background:none;border:none;outline:none;font-family:'Syne',sans-serif;font-size:14px;color:#f0ede6}
  .ai::placeholder{color:#2e2e2e}
  .member-sel{background:#0e0e0e;border:1px solid #222;border-radius:6px;font-family:'DM Mono',monospace;font-size:12px;padding:6px 10px;outline:none;cursor:pointer}
  .ad{background:none;border:1px solid #222;outline:none;font-family:'DM Mono',monospace;font-size:12px;color:#555;padding:6px 10px;border-radius:6px;cursor:pointer}
  .ad::-webkit-calendar-picker-indicator{filter:invert(.3);cursor:pointer}
  .ab{background:#c8f564;border:none;color:#0e0e0e;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px;cursor:pointer;white-space:nowrap}
  .ab:hover{background:#d4ff6e}
  .empty{text-align:center;padding:40px 0;color:#333;font-size:13px}
  .error-box{background:#1a0808;border:1px solid #3a1010;border-radius:10px;padding:20px;text-align:center;color:#e07060;font-size:13px;margin-bottom:20px;line-height:1.8}
  .foot{font-family:'DM Mono',monospace;font-size:10px;color:#2a2a2a;text-align:center;margin-top:20px;padding-bottom:40px}
`

export default function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastSync, setLastSync] = useState('--')
  const [input, setInput] = useState('')
  const [inputDate, setInputDate] = useState(new Date().toISOString().split('T')[0])
  const [inputMember, setInputMember] = useState(MEMBERS[0])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMember, setFilterMember] = useState('all')

  const fetchTasks = async () => {
    try {
      const res = await fetch(API_URL)
      const data = await res.json()
      if (data.ok) {
        setTasks(data.tasks)
        setLastSync(new Date().toLocaleString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }))
        setError(null)
      }
    } catch(e) {
      setError('Googleスプレッドシートに接続できません。VITE_API_URLを確認してください。')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 15000)
    return () => clearInterval(interval)
  }, [])

  const updateTask = async (updatedTask) => {
    setSaving(true)
    setTasks(p => p.map(t => t.id === updatedTask.id ? updatedTask : t))
    await apiFetch('update', updatedTask)
    setSaving(false)
  }

  const cycleStatus = (id) => {
    const task = tasks.find(t => t.id === id)
    updateTask({ ...task, status: STATUS_CYCLE[task.status] ?? 'undecided' })
  }

  const setDate = (id, date) => {
    const task = tasks.find(t => t.id === id)
    updateTask({ ...task, date })
  }

  const addComment = (taskId, comment) => {
    const task = tasks.find(t => t.id === taskId)
    updateTask({ ...task, comments: [...(task.comments || []), comment] })
  }

  const deleteComment = (taskId, commentId) => {
    const task = tasks.find(t => t.id === taskId)
    updateTask({ ...task, comments: (task.comments || []).filter(c => c.id !== commentId) })
  }

  const addTask = async () => {
    if (!input.trim()) return
    const newTask = {
      id: crypto.randomUUID(),
      text: input.trim(),
      member: inputMember,
      status: 'undecided',
      date: inputDate,
      comments: [],
    }
    setTasks(p => [newTask, ...p])
    setInput('')
    setSaving(true)
    await apiFetch('add', newTask)
    setSaving(false)
  }

  const now = getToday()
  const undecidedList = tasks.filter(t => t.status === 'undecided')
  const inprogressList = tasks.filter(t => t.status === 'inprogress')
  const doneList = tasks.filter(t => t.status === 'done')
  const overdueList = tasks.filter(t => t.status !== 'done' && t.date && new Date(t.date+'T00:00:00') < now)

  let filtered = tasks
  if (filterStatus === 'undecided') filtered = undecidedList
  else if (filterStatus === 'inprogress') filtered = inprogressList
  else if (filterStatus === 'done') filtered = doneList
  else if (filterStatus === 'overdue') filtered = overdueList
  if (filterMember !== 'all') filtered = filtered.filter(t => t.member === filterMember)

  const nowStr = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' })

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div>
            <div className="logo">Kiku — Team Board</div>
            <div className="title">チームの<span>タスク</span></div>
            <div className="date-str">{nowStr}</div>
          </div>
          <div className={`badge${saving?' saving':error?' error':''}`}>
            {saving ? '保存中...' : error ? '⚠ 接続エラー' : `● 同期 ${lastSync}`}
          </div>
        </div>

        {error && (
          <div className="error-box">
            {error}<br/>
            <small style={{color:'#a05050'}}>Apps ScriptのURLをVITE_API_URLに設定してください</small>
          </div>
        )}

        <div className="tip">
          誰でもタスクを追加・ステータス更新・コメントできます。データはGoogleスプレッドシートに保存され、15秒ごとに同期されます🌿
        </div>

        <div className="add-box">
          <div className="add-row">
            <input className="ai" placeholder="タスクを追加..." value={input} onChange={e => setInput(e.target.value)} />
          </div>
          <div className="add-row2">
            <select className="member-sel" value={inputMember} onChange={e => setInputMember(e.target.value)}
              style={{ color: MEMBER_COLORS[inputMember] || '#888' }}>
              {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="date" className="ad" value={inputDate} onChange={e => setInputDate(e.target.value)} />
            <button className="ab" onClick={addTask}>＋ 追加</button>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><div className="stat-label">未定</div><div className="stat-val">{undecidedList.length}</div></div>
          <div className="stat"><div className="stat-label">進行中</div><div className="stat-val y">{inprogressList.length}</div></div>
          <div className="stat"><div className="stat-label">完了</div><div className="stat-val g">{doneList.length}</div></div>
          <div className="stat"><div className="stat-label">期限切れ</div><div className={`stat-val ${overdueList.length > 0 ? 'r' : 'd'}`}>{overdueList.length}</div></div>
        </div>

        <div className="filter-row">
          <span className="filter-label">ステータス</span>
          {[['all','すべて'],['undecided','未定'],['inprogress','進行中'],['done','完了'],['overdue','期限切れ']].map(([k,l]) => (
            <button key={k} className={`tab${filterStatus===k?' on':''}`} onClick={() => setFilterStatus(k)}>{l}</button>
          ))}
        </div>
        <div className="filter-row" style={{marginBottom:'20px'}}>
          <span className="filter-label">担当者</span>
          <button className={`tab${filterMember==='all'?' on':''}`} onClick={() => setFilterMember('all')}>全員</button>
          {MEMBERS.map(m => (
            <button key={m} className={`tab${filterMember===m?' on':''}`}
              style={filterMember===m?{borderColor:MEMBER_COLORS[m],color:MEMBER_COLORS[m]}:{}}
              onClick={() => setFilterMember(filterMember===m?'all':m)}>{m}</button>
          ))}
        </div>

        {loading ? (
          <div className="empty">読み込み中...</div>
        ) : filtered.length > 0 ? (
          <>
            <div className="sec-label">{filtered.length}件</div>
            <div className="task-list">
              {filtered.map((t, i) => {
                const df = t.date ? formatDate(t.date) : null
                const isDone = t.status === 'done'
                const isProg = t.status === 'inprogress'
                const isOver = !isDone && df && df.diff < 0
                return (
                  <div key={t.id}
                    className={`task${isDone?' is-done':''}${isProg?' is-prog':''}${isOver?' is-over':''}`}
                    style={{animationDelay:`${i*25}ms`}}>
                    <div className="tt">{t.text}<DateBadge dateStr={t.date} /></div>
                    <div className="tm">
                      <StatusBtn status={t.status} onClick={() => cycleStatus(t.id)} />
                      <MemberBadge member={t.member || 'その他'} />
                      <input type="date" className="di" value={t.date||''} onChange={e => setDate(t.id, e.target.value)} />
                    </div>
                    <CommentSection task={t} onAdd={addComment} onDelete={deleteComment} />
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="empty">該当するタスクはありません</div>
        )}

        <div className="foot">Kiku — CinemaLeap Team Board　|　Powered by Google Sheets</div>
      </div>
    </>
  )
}
