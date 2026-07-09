// ── CONSTANTS ──────────────────────────────────────────────
const ROMAN = ['I','II','III','IV'];
const MOODS = ['neutral','anticipation','dread'];

// ── AUDIO ──────────────────────────────────────────────────
const AUDIO = {
  chorus: new Audio('sounds/chorus.mp3'),
  storm:  new Audio('sounds/storm.mp3'),
  post:   new Audio('sounds/post.mp3'),
};
Object.values(AUDIO).forEach(a => { a.loop = true; });

let muted       = false;
let activeTrack = null;
let openingDone = false;

// ── BACKGROUNDS ────────────────────────────────────────────
const BG = {
  espring: 'backgrounds/espring.png',
  mspring: 'backgrounds/mspring.png',
  srain:   'backgrounds/srain.png',
  mrain:   'backgrounds/mrain.png',
  storm:   'backgrounds/storm.png',
  after:   'backgrounds/after.png',
  summer:  'backgrounds/summer.png',
};

let bgLayer = 'a', bgShown = '';

function changeBg(url) {
  if (url === bgShown) return;
  bgShown = url;
  const next = bgLayer === 'a' ? 'b' : 'a';
  document.getElementById('bg-' + next).style.backgroundImage = `url('${url}')`;
  document.getElementById('bg-' + next).style.opacity = '1';
  document.getElementById('bg-' + bgLayer).style.opacity = '0';
  bgLayer = next;
}

// ── STATE ──────────────────────────────────────────────────
const blankFace = () => ({
  name: '', targetDate: '', mood: 'neutral',
  createdAt: null, arrivedAt: null,
});

// Coerce untrusted face data (localStorage or imported file) to the
// exact shape and types we expect; anything else falls back to blank.
function sanitizeFace(f) {
  const b = blankFace();
  if (typeof f !== 'object' || f === null) return b;
  if (typeof f.name === 'string') b.name = f.name.slice(0, 40);
  if (typeof f.targetDate === 'string' && f.targetDate &&
      !isNaN(new Date(f.targetDate).getTime())) b.targetDate = f.targetDate;
  if (MOODS.includes(f.mood)) b.mood = f.mood;
  if (Number.isFinite(f.createdAt)) b.createdAt = f.createdAt;
  if (Number.isFinite(f.arrivedAt)) b.arrivedAt = f.arrivedAt;
  return b;
}

const state = {
  face:  0,
  faces: [blankFace(), blankFace(), blankFace(), blankFace()],
  busy:  false,
};

// ── PERSISTENCE ────────────────────────────────────────────
function persist() { localStorage.setItem('erelong_v1', JSON.stringify(state.faces)); }
function hydrate() {
  try {
    const raw = localStorage.getItem('erelong_v1');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length === 4)
      state.faces = saved.map(sanitizeFace);
  } catch(_) {}
}

// ── BACKGROUND HELPERS ─────────────────────────────────────
function getElapsedPct(face) {
  if (!face.createdAt || !face.targetDate) return 0;
  const end = new Date(face.targetDate).getTime();
  if (end <= face.createdAt) return 100;
  return Math.min(100, Math.max(0, (Date.now()-face.createdAt)/(end-face.createdAt)*100));
}

function isNextCalendarDay(face) {
  if (!face.arrivedAt) return false;
  const a = new Date(face.arrivedAt), n = new Date();
  return n.getFullYear()!==a.getFullYear() || n.getMonth()!==a.getMonth() || n.getDate()!==a.getDate();
}

function visualState(face) {
  if (!face.targetDate) return 'none';
  if (new Date(face.targetDate).getTime() > Date.now()) return 'waiting';
  if (face.mood==='dread' && isNextCalendarDay(face)) return 'post';
  return 'arrived';
}

function selectBg(face) {
  const vs = visualState(face), pct = getElapsedPct(face);
  if (face.mood==='neutral') return BG.mspring;
  if (face.mood==='anticipation') { if (vs!=='waiting') return BG.summer; return pct<50 ? BG.espring : BG.mspring; }
  if (face.mood==='dread') { if (vs==='post') return BG.after; if (vs==='arrived') return BG.storm; return pct<50 ? BG.srain : BG.mrain; }
  return BG.mspring;
}

// ── AUDIO HELPERS ──────────────────────────────────────────
function selectTrack(face) {
  const vs = visualState(face), pct = getElapsedPct(face);
  if (face.mood==='neutral') return { track:null, vol:0 };
  if (face.mood==='anticipation') { const vol=vs==='waiting'?Math.max(.02,pct/100):1; return { track:'chorus',vol }; }
  if (face.mood==='dread') { if (vs==='post') return { track:'post',vol:.5 }; const vol=vs==='waiting'?Math.max(.02,pct/100):1; return { track:'storm',vol }; }
  return { track:null, vol:0 };
}

function updateAudio() {
  if (muted || !openingDone) return;
  const { track, vol } = selectTrack(state.faces[state.face]);
  if (track !== activeTrack) {
    if (activeTrack) AUDIO[activeTrack].pause();
    activeTrack = track;
    if (activeTrack) { AUDIO[activeTrack].volume = vol; AUDIO[activeTrack].play().catch(()=>{}); }
  } else if (activeTrack) {
    AUDIO[activeTrack].volume = vol;
  }
}

function setMute(m) {
  muted = m;
  document.getElementById('mute-btn').classList.toggle('muted', muted);
  if (muted) { if (activeTrack) AUDIO[activeTrack].pause(); }
  else {
    if (activeTrack) {
      const { vol } = selectTrack(state.faces[state.face]);
      AUDIO[activeTrack].volume = vol; AUDIO[activeTrack].play().catch(()=>{});
    } else { updateAudio(); }
  }
}

document.getElementById('mute-btn').addEventListener('click', () => setMute(!muted));

// ── FOUR COUNTDOWN DIALS ───────────────────────────────────
const dialPrev = { d:null, h:null, m:null, s:null };

function drawDial(key, val, glowBright) {
  if (dialPrev[key]===val && !glowBright) return;
  dialPrev[key] = val;

  const cnv = document.getElementById('dial-'+key);
  const ctx = cnv.getContext('2d');
  const W=cnv.width, H=cnv.height, cx=W/2, cy=H/2, r=Math.min(W,H)/2-3;

  ctx.clearRect(0,0,W,H);

  // Outer glow
  const grd = ctx.createRadialGradient(cx,cy,r-4,cx,cy,r+5);
  grd.addColorStop(0,'rgba(201,168,76,.12)'); grd.addColorStop(1,'transparent');
  ctx.beginPath(); ctx.arc(cx,cy,r+5,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

  // Face background
  const bg = ctx.createRadialGradient(cx,cy-8,4,cx,cy,r);
  bg.addColorStop(0,'rgba(26,22,48,.94)'); bg.addColorStop(1,'rgba(8,6,26,.97)');
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=bg; ctx.fill();

  // Gold outer ring — brighter when active
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle = glowBright ? '#d4b455' : '#c9a84c';
  ctx.lineWidth = glowBright ? 3 : 2.5; ctx.stroke();

  // Inner ring
  ctx.beginPath(); ctx.arc(cx,cy,r-6,0,Math.PI*2);
  ctx.strokeStyle='rgba(201,168,76,.22)'; ctx.lineWidth=1; ctx.stroke();

  // Tick marks
  for (let i=0; i<12; i++) {
    const a=(i*30-90)*Math.PI/180, major=i%3===0;
    const t0=major?r-14:r-10, t1=r-7;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*t0, cy+Math.sin(a)*t0);
    ctx.lineTo(cx+Math.cos(a)*t1, cy+Math.sin(a)*t1);
    ctx.strokeStyle=major?'rgba(201,168,76,.55)':'rgba(201,168,76,.22)';
    ctx.lineWidth=major?1.5:1; ctx.stroke();
  }

  // Number
  const fontSize = val.length>2 ? Math.round(r*.38) : Math.round(r*.52);
  ctx.save();
  ctx.fillStyle='#f0ead8';
  ctx.font=`900 ${fontSize}px Cinzel,serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='rgba(201,168,76,.38)'; ctx.shadowBlur=glowBright?14:10;
  ctx.fillText(val,cx,cy); ctx.restore();
}

function setAllDials(val) { ['d','h','m','s'].forEach(k=>drawDial(k,val,false)); }

// Force full redraw (used on face change)
function redrawAllDials() { Object.keys(dialPrev).forEach(k=>{dialPrev[k]=null;}); }

// ── COUNTDOWN LOGIC ────────────────────────────────────────
function faceStatus(face) {
  if (!face.targetDate) return { phase:'none', diff:0 };
  const diff = new Date(face.targetDate).getTime()-Date.now();
  if (diff>0)         return { phase:'waiting', diff };
  if (diff>-86400000) return { phase:'arrived', diff:Math.abs(diff) };
  return                     { phase:'expired', diff:Math.abs(diff) };
}

function decompose(ms) {
  const t=Math.floor(Math.abs(ms)/1000);
  return { d:Math.floor(t/86400), h:Math.floor((t%86400)/3600), m:Math.floor((t%3600)/60), s:t%60 };
}

function pad(n) { return String(n).padStart(2,'0'); }

// ── QUOTES ─────────────────────────────────────────────────
const QUOTES = {
  waiting: {
    funny: [
      { text:"I am to wait, though waiting so be hell",                              attr:"Sonnet 58" },
      { text:"There's no more faith in thee than in a stewed prune",                 attr:"Henry IV Part 1" },
      { text:"Life is as tedious as a twice-told tale",                              attr:"King John" },
      { text:"Misery acquaints a man with strange bedfellows",                       attr:"The Tempest" },
    ],
    warm: [
      { text:"All things are ready, if our minds be so",                             attr:"Henry V" },
      { text:"How poor are they that have not patience",                             attr:"Othello" },
      { text:"Oft expectation fails, and most oft there where most it promises",     attr:"All's Well That Ends Well" },
      { text:"There are many events in the womb of time, which will be delivered",   attr:"Othello" },
    ],
    dark: [
      { text:"What's to come is still unsure",                                       attr:"Twelfth Night" },
      { text:"We are time's subjects, and time bids be gone",                        attr:"Henry IV Part 2" },
      { text:"Defer no time, delays have dangerous ends",                            attr:"Henry VI" },
      { text:"Come what come may, time and the hour runs through the roughest day",  attr:"Macbeth" },
    ],
  },
  arrived: {
    funny: [
      { text:"O excellent! I love long life better than figs",                                           attr:"Antony and Cleopatra" },
      { text:"With mirth and laughter let old wrinkles come",                                            attr:"Merchant of Venice" },
      { text:"Now I will believe that there are unicorns",                                               attr:"The Tempest" },
      { text:"I am glad of your departure; adieu, good Monsieur Melancholy",                            attr:"As You Like It" },
    ],
    warm: [
      { text:"That time offered sorrow; this, general joy",                                              attr:"The Winter's Tale" },
      { text:"Silence is the perfectest herald of joy",                                                  attr:"Much Ado About Nothing" },
      { text:"Prepare for mirth, for mirth becomes a feast",                                             attr:"Pericles" },
      { text:"Make use of time, let not advantage slip",                                                 attr:"Venus and Adonis" },
      { text:"Let every man be master of his time",                                                      attr:"Macbeth" },
    ],
    dark: [
      { text:"By the pricking of my thumbs, something wicked this way comes",                           attr:"Macbeth" },
      { text:"Is this a dagger which I see before me?",                                                  attr:"Macbeth" },
      { text:"Double, double toil and trouble; fire burn and cauldron bubble",                           attr:"Macbeth" },
      { text:"Cowards die many times before their deaths; the valiant never taste of death but once",   attr:"Julius Caesar" },
    ],
  },
  expired: {
    funny: [
      { text:"Away! thou'rt a knave",                                                attr:"All's Well That Ends Well" },
      { text:"The first thing we do, let's kill all the lawyers",                    attr:"Henry VI Part 2" },
      { text:"I am sick when I do look on thee",                                     attr:"A Midsummer Night's Dream" },
      { text:"Brevity is the soul of wit",                                           attr:"Hamlet" },
    ],
    warm: [
      { text:"What's done cannot be undone",                                         attr:"Macbeth" },
      { text:"What's gone and what's past help should be past grief",                attr:"The Winter's Tale" },
      { text:"All's well that ends well",                                            attr:"All's Well That Ends Well" },
      { text:"Good night, good night! Parting is such sweet sorrow",                 attr:"Romeo and Juliet" },
      { text:"What's past is prologue",                                              attr:"The Tempest" },
    ],
    dark: [
      { text:"Tomorrow and tomorrow and tomorrow creeps in this petty pace from day to day",              attr:"Macbeth" },
      { text:"Life's but a walking shadow, a poor player that struts and frets his hour upon the stage",  attr:"Macbeth" },
      { text:"We are such stuff as dreams are made on",                                                   attr:"The Tempest" },
      { text:"I wasted time, and now doth time waste me",                                                 attr:"Richard II" },
      { text:"Like as the waves make towards the pebbled shore, so do our minutes hasten to their end",  attr:"Sonnet 60" },
    ],
  },
};

const qState = {
  current: [null,null,null,null],
  phase:   ['none','none','none','none'],
  mood:    ['neutral','neutral','neutral','neutral'],
};

function pickQuote(phase, mood) {
  if (mood==='neutral'||phase==='none') return null;
  const bucket=QUOTES[phase]; if (!bucket) return null;
  const pool=mood==='anticipation'?(Math.random()<.5?bucket.funny:bucket.warm):bucket.dark;
  return pool[Math.floor(Math.random()*pool.length)];
}

function renderQuote(q) {
  const area=document.getElementById('quote-area');
  const txt=document.getElementById('quote-text');
  const attr=document.getElementById('quote-attr');
  if (!q) { area.classList.remove('visible'); txt.textContent=''; attr.textContent=''; }
  else    { txt.textContent='"'+q.text+'"'; attr.textContent='— '+q.attr; area.classList.add('visible'); }
}

function refreshQuote(fi, phase, mood) {
  if (phase===qState.phase[fi]&&mood===qState.mood[fi]) return;
  qState.phase[fi]=phase; qState.mood[fi]=mood;
  qState.current[fi]=pickQuote(phase,mood);
  if (fi===state.face) renderQuote(qState.current[fi]);
}

// ── REFRESH DISPLAY ────────────────────────────────────────
function refreshDisplay() {
  const face=state.faces[state.face];
  const { phase, diff }=faceStatus(face);
  const vs=visualState(face);
  const panel=document.getElementById('panel');
  const st=document.getElementById('status-text');
  const active=!!face.targetDate; // glow dials when a date is set

  panel.classList.remove('state-arrived','state-expired');

  if (phase==='none') {
    setAllDials('--');
    st.textContent='';
    refreshQuote(state.face,'none',face.mood);
    return;
  }

  if (phase==='waiting') {
    const {d,h,m,s}=decompose(diff);
    drawDial('d',pad(d),active); drawDial('h',pad(h),active);
    drawDial('m',pad(m),active); drawDial('s',pad(s),active);
    st.textContent='';
    refreshQuote(state.face,'waiting',face.mood);
    return;
  }

  // Event has passed
  if (face.mood==='dread'&&!face.arrivedAt) {
    face.arrivedAt=new Date(face.targetDate).getTime(); persist();
  }

  if (vs==='post') {
    setAllDials('00');
    st.textContent='— The storm has passed —';
    panel.classList.add('state-expired');
    refreshQuote(state.face,'expired',face.mood);
    return;
  }

  setAllDials('00');
  st.textContent='— The hour is upon us —';
  panel.classList.add('state-arrived');
  refreshQuote(state.face,'arrived',face.mood);
}

// ── PANEL SYNC ─────────────────────────────────────────────
function panelLoad(i) {
  const f=state.faces[i];
  document.getElementById('inp-name').value=f.name;
  document.getElementById('inp-date').value=f.targetDate;

  const bA=document.getElementById('btn-anticipation'), bD=document.getElementById('btn-dread');
  bA.classList.remove('on-anticipation','on-dread');
  bD.classList.remove('on-anticipation','on-dread');
  if (f.mood==='anticipation') bA.classList.add('on-anticipation');
  else if (f.mood==='dread')   bD.classList.add('on-dread');

  redrawAllDials();
  renderQuote(qState.current[i]);
  refreshDisplay();
  changeBg(selectBg(f));
}

function panelSave() {
  const f=state.faces[state.face];
  const dateEl=document.getElementById('inp-date');
  let newDate=dateEl.value;
  // Refuse impossible or out-of-range dates (bad year length, Feb 30, etc.):
  // the browser flags them invalid; revert to the last good value.
  if (!dateEl.checkValidity()) { dateEl.value=f.targetDate; newDate=f.targetDate; }
  if (newDate!==f.targetDate) { f.createdAt=newDate?Date.now():null; f.arrivedAt=null; }
  f.name=document.getElementById('inp-name').value.trim();
  f.targetDate=newDate;
  persist(); refreshDisplay(); changeBg(selectBg(f)); updateAudio();
}

// ── MOOD BUTTONS ───────────────────────────────────────────
document.getElementById('btn-anticipation').addEventListener('click',()=>{
  const f=state.faces[state.face];
  const bA=document.getElementById('btn-anticipation'), bD=document.getElementById('btn-dread');
  if (f.mood==='anticipation') { f.mood='neutral'; bA.classList.remove('on-anticipation'); }
  else { f.mood='anticipation'; f.arrivedAt=null; bA.classList.add('on-anticipation'); bD.classList.remove('on-dread'); }
  persist(); changeBg(selectBg(f)); updateAudio();
});

document.getElementById('btn-dread').addEventListener('click',()=>{
  const f=state.faces[state.face];
  const bD=document.getElementById('btn-dread'), bA=document.getElementById('btn-anticipation');
  if (f.mood==='dread') { f.mood='neutral'; bD.classList.remove('on-dread'); }
  else { f.mood='dread'; f.arrivedAt=null; bD.classList.add('on-dread'); bA.classList.remove('on-anticipation'); }
  persist(); changeBg(selectBg(f)); updateAudio();
});

document.getElementById('save-btn').addEventListener('click', panelSave);
document.getElementById('inp-name').addEventListener('blur', panelSave);
document.getElementById('inp-date').addEventListener('change', panelSave);

// ── INFO MODAL ─────────────────────────────────────────────
const infoModal = document.getElementById('info-modal');
document.getElementById('info-btn').addEventListener('click', () => infoModal.classList.add('open'));
document.getElementById('info-close').addEventListener('click', () => infoModal.classList.remove('open'));
infoModal.addEventListener('click', e => { if (e.target === infoModal) infoModal.classList.remove('open'); });

// ── EXPORT / IMPORT ────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const data = JSON.stringify(state.faces, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'erelong-events.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (Array.isArray(parsed) && parsed.length === 4) {
        state.faces = parsed.map(sanitizeFace);
        persist();
        // Re-seed quote state
        state.faces.forEach((f,i) => {
          const phase = faceStatus(f).phase;
          qState.phase[i]=phase; qState.mood[i]=f.mood; qState.current[i]=pickQuote(phase,f.mood);
        });
        panelLoad(state.face);
      }
    } catch(_) {}
    e.target.value = ''; // reset so same file can be re-imported
  };
  reader.readAsText(file);
});

// ── FIRST-VISIT TUTORIAL ───────────────────────────────────
const TUT_KEY = 'erelong_tut_v1';
const TUT_STEPS = [
  { title: 'Welcome to Ere Long',
    text:  'A countdown for things dreaded and anticipated. Ere Long keeps four faces — four separate events. Turn between them with the ◀ and ▶ arrows, or your keyboard\'s arrow keys.' },
  { title: 'Set an Event',
    text:  'Name the event, choose its date and hour, then press Set. The dials will count down the days, hours, minutes, and seconds until it arrives.' },
  { title: 'Choose a Mood',
    text:  'Await marks something longed for; Forebode, something dreaded. The scenery, music, and words will follow your choice as the hour draws near. Choose neither, and all stays still. The ♪ button silences the music.' },
  { title: 'Yours Alone',
    text:  'Thy serial number only unlocks the door. Your events are saved solely on this device — no database of your countdowns exists, and no one can see what you await or dread. Use Export Events to keep a copy and Import Events to restore it. Press ? at any time to read the guide again.' },
];
let tutStep = 0;

const tutModal = document.getElementById('tut-modal');

function tutRender() {
  const s = TUT_STEPS[tutStep];
  document.getElementById('tut-title').textContent = s.title;
  document.getElementById('tut-text').textContent = s.text;
  document.getElementById('tut-next').textContent = tutStep === TUT_STEPS.length-1 ? 'Begin' : 'Next';
  document.querySelectorAll('#tut-dots span').forEach((d,i) => d.classList.toggle('active', i === tutStep));
}

function tutClose() {
  tutModal.classList.remove('open');
  try { localStorage.setItem(TUT_KEY, '1'); } catch(_) {}
}

function maybeShowTutorial() {
  try { if (localStorage.getItem(TUT_KEY)) return; } catch(_) { return; }
  tutStep = 0; tutRender();
  tutModal.classList.add('open');
}

document.getElementById('tut-skip').addEventListener('click', tutClose);
document.getElementById('tut-next').addEventListener('click', () => {
  if (tutStep >= TUT_STEPS.length-1) { tutClose(); return; }
  tutStep++; tutRender();
});

// ── FACE NAVIGATION (with dial fade) ──────────────────────
function goToFace(next) {
  if (state.busy || next===state.face) return;
  state.busy = true;
  panelSave();

  const dialArea = document.getElementById('dial-area');
  dialArea.classList.add('fading');

  setTimeout(() => {
    state.face = next;
    panelLoad(next);
    updateAudio();
    dialArea.classList.remove('fading');
    setTimeout(() => { state.busy = false; }, 60);
  }, 350);
}

document.getElementById('btn-prev').addEventListener('click',()=>goToFace((state.face+3)%4));
document.getElementById('btn-next').addEventListener('click',()=>goToFace((state.face+1)%4));
document.addEventListener('keydown',e=>{
  if (infoModal.classList.contains('open') || tutModal.classList.contains('open')) return;
  if (e.key==='ArrowLeft')  goToFace((state.face+3)%4);
  if (e.key==='ArrowRight') goToFace((state.face+1)%4);
});

// ── OPENING SEQUENCE ───────────────────────────────────────
function runOpeningSequence() {
  const screen = document.getElementById('opening-screen');
  const title  = document.getElementById('opening-title');
  const SHOW_MS = 2500;
  const FADE_MS = 1500;
  const STEPS   = 15;
  const STEP_MS = FADE_MS / STEPS;

  function startFade() {
    screen.style.transition    = `opacity ${FADE_MS}ms ease`;
    screen.style.opacity       = '0';
    screen.style.pointerEvents = 'none';

    openingDone = true;
    const { track, vol: targetVol } = selectTrack(state.faces[state.face]);
    if (!muted && track) {
      activeTrack = track;
      AUDIO[track].volume = 0;
      AUDIO[track].play().catch(()=>{});
      let step = 0;
      const fade = setInterval(()=>{
        step++;
        if (activeTrack) AUDIO[activeTrack].volume = Math.min(targetVol, targetVol*step/STEPS);
        if (step>=STEPS) clearInterval(fade);
      }, STEP_MS);
    }
    setTimeout(()=>{ screen.style.display='none'; maybeShowTutorial(); }, FADE_MS+100);
  }

  // Race font load against a 1.5 s safety timeout — whichever resolves first
  // reveals the title, then SHOW_MS later we fade to the landscape.
  const fontReady    = document.fonts.load('5rem "UnifrakturMaguntia"').catch(()=>{});
  const safetyTimer  = new Promise(res => setTimeout(res, 1500));

  Promise.race([fontReady, safetyTimer]).then(() => {
    title.style.opacity = '1';          // reveal title only after font is confirmed ready
    setTimeout(startFade, SHOW_MS);
  });
}

// ── ANIMATION LOOP ─────────────────────────────────────────
let lastSlowTick = 0;

function tick() {
  refreshDisplay();
  const now=Date.now();
  if (now-lastSlowTick>2000) {
    lastSlowTick=now;
    changeBg(selectBg(state.faces[state.face]));
    updateAudio();
  }
  requestAnimationFrame(tick);
}

// ── INIT ───────────────────────────────────────────────────
hydrate();

let needsPersist = false;
state.faces.forEach(f=>{
  if (f.mood==='dread'&&f.targetDate&&!f.arrivedAt) {
    const t=new Date(f.targetDate).getTime();
    if (t<=Date.now()) { f.arrivedAt=t; needsPersist=true; }
  }
});
if (needsPersist) persist();

state.faces.forEach((f,i)=>{
  const phase=faceStatus(f).phase;
  qState.phase[i]=phase; qState.mood[i]=f.mood; qState.current[i]=pickQuote(phase,f.mood);
});

changeBg(selectBg(state.faces[0]));
panelLoad(0);
tick();
runOpeningSequence();

// ── SERVICE WORKER ─────────────────────────────────────────
// Registers over https/localhost only (browsers ignore it on file://).
// When running as an installed app, ask the worker to pre-cache all
// backgrounds and sounds so the full experience works offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
      if (standalone) {
        navigator.serviceWorker.ready.then(reg => {
          if (reg.active) reg.active.postMessage('precache-media');
        });
      }
    }).catch(()=>{});
  });
}
