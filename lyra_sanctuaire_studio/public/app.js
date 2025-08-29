const timeline = document.getElementById('timeline');
const textInput = document.getElementById('textInput');
const sendButton = document.getElementById('sendButton');
const micButton = document.getElementById('micButton');
const statusText = document.getElementById('statusText');
const studio = document.getElementById('studio');
const studioButton = document.getElementById('studioButton');
const closeStudio = document.getElementById('closeStudio') || document.getElementById('studio'); // fallback

// Studio fields
const adminToken = document.getElementById('adminToken');
const filePath = document.getElementById('filePath');
const desc = document.getElementById('desc');
const desired = document.getElementById('desired');
const propose = document.getElementById('propose');
const patchOut = document.getElementById('patchOut');

// Local conversation save
const STORE_KEY = 'lyra_conversation_studio_v1';
function loadLog(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'[]'); }catch{ return []; } }
function saveLog(items){ localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
let log = loadLog();

function addBubble(role, text){
  const li = document.createElement('li');
  li.className = role;
  li.textContent = text;
  timeline.appendChild(li);
  timeline.scrollTop = timeline.scrollHeight;
  log.push({role,text,ts:Date.now()});
  saveLog(log);
}

function contextFromLog(max=8){
  const slice = log.slice(-max);
  return slice.map(x => `${x.role.toUpperCase()}: ${x.text}`).join('\n');
}

// Voice output
let voices = [];
function loadVoices(){
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}
if ('speechSynthesis' in window){
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}
function speak(text){
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  const fr = voices.find(v => (v.lang||'').toLowerCase().startsWith('fr'));
  if (fr) u.voice = fr;
  u.rate = 1.0; u.pitch = 1.0;
  u.onstart = ()=> micButton.classList.add('speaking');
  u.onend = ()=> micButton.classList.remove('speaking');
  window.speechSynthesis.speak(u);
}

// Speech recognition (if available)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
if (SpeechRecognition){
  recognizer = new SpeechRecognition();
  recognizer.lang = 'fr-FR';
  recognizer.onstart = ()=> { statusText.textContent = 'Écoute…'; micButton.classList.add('listening'); };
  recognizer.onend = ()=> { statusText.textContent = 'Prête'; micButton.classList.remove('listening'); };
  recognizer.onerror = ()=> { statusText.textContent = 'Micro indisponible'; micButton.classList.remove('listening'); };
  recognizer.onresult = (e)=> {
    const txt = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
    if (txt) handleUserInput(txt);
  };
}

async function askLyra(message){
  try{
    statusText.textContent = 'Réfléchit…';
    const r = await fetch('/api/ask', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message, context: contextFromLog() })
    });
    if (!r.ok){ throw new Error(await r.text()); }
    const data = await r.json();
    const reply = (data && data.reply) ? data.reply.trim() : '(pas de réponse)';
    addBubble('lyra', reply);
    speak(reply);
  }catch(e){
    console.error(e);
    addBubble('lyra','Désolée, une erreur est survenue. Vérifie le serveur et Ollama.');
  }finally{
    statusText.textContent = 'Prête';
  }
}

function handleUserInput(text){
  addBubble('user', text);
  askLyra(text);
}

// UI handlers
micButton.addEventListener('click', ()=>{
  if (recognizer){
    try{ recognizer.start(); }catch{}
  }else{
    statusText.textContent = 'Micro non disponible, utilise le clavier.';
    setTimeout(()=> statusText.textContent='Prête', 1500);
  }
});
sendButton.addEventListener('click', ()=>{
  const v = textInput.value.trim(); if (!v) return;
  textInput.value=''; handleUserInput(v);
});
textInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter') sendButton.click(); });

// Restore timeline
for (const it of log){ addBubble(it.role, it.text); }

// Studio controls
studioButton.addEventListener('click', ()=> studio.classList.toggle('hidden'));
document.getElementById('closeStudio').addEventListener('click', ()=> studio.classList.add('hidden'));

propose.addEventListener('click', async ()=>{
  patchOut.textContent = '…';
  try{
    const r = await fetch('/api/propose-patch', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-admin-token': (adminToken.value||'').trim()
      },
      body: JSON.stringify({
        description: (desc.value||'').trim(),
        currentFilePath: (filePath.value||'').trim(),
        desiredChange: (desired.value||'').trim()
      })
    });
    const data = await r.json();
    patchOut.textContent = JSON.stringify(data, null, 2);
  }catch(e){
    patchOut.textContent = String(e);
  }
});
