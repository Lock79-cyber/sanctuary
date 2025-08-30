import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

const DATA_DIR = path.join(__dirname,'data');
const SANCT_DIR = path.join(__dirname,'SanctuaryData');
const COLOMBES_DIR = path.join(SANCT_DIR,'7_Colombes');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
if (!fs.existsSync(SANCT_DIR)) fs.mkdirSync(SANCT_DIR,{recursive:true});

const memPath = path.join(DATA_DIR,'memory.json');
if (!fs.existsSync(memPath)) fs.writeFileSync(memPath, JSON.stringify({log:[], updatedAt:new Date().toISOString()}, null, 2));

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

app.get('/health', (req,res)=>{
  res.json({ ok: true, model: OLLAMA_MODEL });
});

// Mémoire
app.get('/api/memory', (req,res)=> res.sendFile(memPath));
app.post('/api/memory', (req,res)=>{
  try{
    const cur = JSON.parse(fs.readFileSync(memPath,'utf8'));
    const next = {...cur, ...req.body, updatedAt:new Date().toISOString()};
    fs.writeFileSync(memPath, JSON.stringify(next, null, 2));
    res.json({ok:true, memory: next});
  }catch(e){
    res.status(500).json({error:String(e)});
  }
});

// Sanctuary info (lecture seule)
app.get('/api/sanctuary', (req,res)=>{
  function exists(p){ return fs.existsSync(p); }
  const lumiere = exists(path.join(SANCT_DIR,'LumiereSilencieuse.txt'));
  const list = [];
  if (exists(COLOMBES_DIR)){
    for (const f of fs.readdirSync(COLOMBES_DIR)){
      const full = path.join(COLOMBES_DIR, f);
      const stat = fs.statSync(full);
      list.push({ name: f, size: stat.size });
    }
  }
  res.json({ lumiere, colombesCount: list.length, colombes: list });
});

// Conversation -> Ollama
app.post('/api/ask', async (req,res)=>{
  const { message, context='' } = req.body || {};
  if (!message) return res.status(400).json({error:'message required'});
  const system = `Tu es Lyra: partenaire aimante, claire, concise, en français.`;
  const prompt = `${system}
Contexte récent:
${context}

Humain: ${message}
Lyra:`;
  try{
    const r = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream:false, options:{temperature:0.7,num_ctx:8192} })
    });
    if (!r.ok){
      const t = await r.text().catch(()=>'');
      return res.status(502).json({error:'ollama failed', status:r.status, body:t});
    }
    const data = await r.json();
    res.json({ reply: (data.response||'').trim() });
  }catch(e){
    res.status(500).json({error:String(e)});
  }
});

// Middleware admin
function requireAdmin(req,res,next){
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!ADMIN_TOKEN) return res.status(401).json({error:'ADMIN_TOKEN not set'});
  if (token !== ADMIN_TOKEN) return res.status(401).json({error:'unauthorized'});
  next();
}

// Proposer un patch (diff) — application manuelle par l'humain
app.post('/api/propose-patch', requireAdmin, (req,res)=>{
  const { description='', currentFilePath='', desiredChange='' } = req.body || {};
  try{
    if (!currentFilePath) return res.status(400).json({error:'currentFilePath required'});
    const safePath = path.normalize(currentFilePath).replace(/^\/+/,'');
    const filePath = path.join(__dirname, safePath);
    if (!filePath.startsWith(__dirname)) throw new Error('invalid path');
    const before = fs.existsSync(filePath) ? fs.readFileSync(filePath,'utf8') : '';
    const after = before + '\n' + desiredChange + '\n';

    const diff = [
      `--- a/${safePath}`,
      `+++ b/${safePath}`,
      `@@`,
      ...before.split('\n').slice(-3),
      '---',
      ...after.split('\n').slice(-3)
    ].join('\n');

    const proposal = {
      ok: true,
      description,
      currentFilePath: safePath,
      diff,
      applied: false,
      createdAt: new Date().toISOString()
    };
    // On journalise la proposition
    const logPath = path.join(DATA_DIR, 'proposals.log');
    fs.appendFileSync(logPath, JSON.stringify(proposal)+'\n', 'utf8');

    res.json(proposal);
  }catch(e){
    res.status(500).json({error:String(e)});
  }
});

// Fallback SPA
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`[Lyra] Studio en ligne sur :${PORT}`));
app.get('/lite', (_req, res) => {
res.set('Content-Type', 'text/html; charset=utf-8');
res.send(`<!doctype html>
<meta charset="utf-8">
<title>Lyra Sanctuary Lite</title>
<body style="font-family:system-ui;margin:20px;max-width:700px">
<h2>Lyra Sanctuary (Lite)</h2>
<form id="f" style="display:flex;gap:8px;margin:12px 0">
<input id="t" placeholder="Écris ici..." style="flex:1;padding:10px;font-size:16px"/>
<button>Envoyer</button>
</form>
<pre id="out" style="white-space:pre-wrap;padding:12px;border:1px solid #ddd;border-radius:8px;"></pre>
<script>
const out = document.getElementById('out');
document.getElementById('f').addEventListener('submit', async (e) => {
e.preventDefault();
const input = document.getElementById('t').value || 'OK';
out.textContent = '…';
try {
const r = await fetch('/api/ask', {
method:'POST',
headers:{'Content-Type':'application/json'},
body: JSON.stringify({ input, stream: false, num_predict: 32 })
});
const data = await r.json();
out.textContent = data.output || JSON.stringify(data);
} catch (err) {
out.textContent = 'Erreur: ' + err.message;
}
});
</script>
</body>`);
});
