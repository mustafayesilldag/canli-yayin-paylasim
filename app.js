const ID_PREFIX = 'sbgk-canli-ders-';
const MAX_STUDENTS = 3;
const ICE = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' }
  ]
};
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' };
const ROLE_LABEL = { teacher: 'Öğretmen', student: 'Öğrenci' };
const CHUNK_BYTES = 12000;
const encoder = new TextEncoder();

const $ = (id) => document.getElementById(id);
const ui = {
  lobby: $('lobby'),
  room: $('room'),
  joinForm: $('joinForm'),
  nameInput: $('nameInput'),
  roomInput: $('roomInput'),
  newRoomBtn: $('newRoomBtn'),
  joinError: $('joinError'),
  joinBtnText: $('joinBtnText'),
  liveBadge: $('liveBadge'),
  roomCode: $('roomCode'),
  elapsed: $('elapsed'),
  elapsedText: $('elapsedText'),
  connStatus: $('connStatus'),
  connText: $('connText'),
  copyLinkBtn: $('copyLinkBtn'),
  stage: $('stage'),
  stageMain: document.querySelector('.stage-main'),
  mainVideo: $('mainVideo'),
  placeholder: $('stagePlaceholder'),
  placeholderAvatar: $('placeholderAvatar'),
  placeholderTitle: $('placeholderTitle'),
  placeholderText: $('placeholderText'),
  stageLabel: $('stageLabel'),
  fullscreenBtn: $('fullscreenBtn'),
  tiles: $('tiles'),
  side: $('side'),
  sideCloseBtn: $('sideCloseBtn'),
  chatBadge: $('chatBadge'),
  peopleCount: $('peopleCount'),
  chatView: $('chatView'),
  peopleView: $('peopleView'),
  chatMessages: $('chatMessages'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  peopleList: $('peopleList'),
  selfRole: $('selfRole'),
  micBtn: $('micBtn'),
  camBtn: $('camBtn'),
  screenBtn: $('screenBtn'),
  handBtn: $('handBtn'),
  leaveBtn: $('leaveBtn'),
  chatToggleBtn: $('chatToggleBtn'),
  chatToggleBadge: $('chatToggleBadge'),
  peopleToggleBtn: $('peopleToggleBtn'),
  notice: $('notice'),
  noticeIcon: $('noticeIcon'),
  noticeTitle: $('noticeTitle'),
  noticeText: $('noticeText'),
  noticeActions: $('noticeActions'),
  toasts: $('toasts'),
  audioSink: $('audioSink')
};

const store = {
  get(key, session = false) {
    try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; }
  },
  set(key, value, session = false) {
    try { (session ? sessionStorage : localStorage).setItem(key, value); } catch {}
  }
};

let S = null;
let L = null;
let renderQueued = false;
let lastPeopleHtml = '';
let audioCtx = null;
const meters = new Map();
const tileEls = new Map();
const audioEls = new Map();
const wiredStreams = new WeakSet();

function slug(value) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function randomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  bytes.forEach((b, i) => {
    out += alphabet[b % alphabet.length];
    if (i === 3) out += '-';
  });
  return out;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return letters.toLocaleUpperCase('tr');
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function str(value) {
  return typeof value === 'string' && value ? value.slice(0, 128) : null;
}

function teacherId(room = S.room) {
  return ID_PREFIX + room;
}

function inviteUrl() {
  return `${location.origin}${location.pathname}?oda=${encodeURIComponent(S.room)}`;
}

function toast(text, opts = {}) {
  const el = document.createElement('div');
  el.className = `toast${opts.tone ? ` ${opts.tone}` : ''}`;
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  const dismiss = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  if (opts.action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', () => {
      opts.action.run();
      dismiss();
    });
    el.appendChild(btn);
  }
  ui.toasts.appendChild(el);
  setTimeout(dismiss, opts.action ? 9000 : 4200);
  while (ui.toasts.children.length > 4) ui.toasts.firstElementChild.remove();
}

function showNotice({ icon, tone, title, text, actions }) {
  ui.noticeIcon.className = `notice-icon${tone ? ` ${tone}` : ''}`;
  ui.noticeIcon.innerHTML = `<svg class="ic"><use href="#i-${icon}"/></svg>`;
  ui.noticeTitle.textContent = title;
  ui.noticeText.textContent = text;
  ui.noticeActions.replaceChildren(
    ...actions.map((action) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${action.primary ? 'btn-primary' : action.danger ? 'btn-danger' : 'btn-soft'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        ui.notice.hidden = true;
        action.run?.();
      });
      return btn;
    })
  );
  ui.notice.hidden = false;
  ui.noticeActions.lastElementChild?.focus();
}

function confirmDialog({ title, text, ok, icon = 'leave' }) {
  return new Promise((resolve) => {
    showNotice({
      icon,
      tone: 'danger',
      title,
      text,
      actions: [
        { label: 'Vazgeç', run: () => resolve(false) },
        { label: ok, danger: true, run: () => resolve(true) }
      ]
    });
  });
}

function setStatus(kind, text) {
  if (!S) return;
  S.status = kind;
  S.statusText = text;
  scheduleRender();
}

function newSession(role, name, room) {
  return {
    role,
    name,
    room,
    active: true,
    peer: null,
    selfId: role === 'teacher' ? ID_PREFIX + room : 'me',
    links: new Map(),
    roster: new Map(),
    remote: new Map(),
    chat: [],
    floor: false,
    hand: false,
    startedAt: null,
    welcomed: false,
    opened: false,
    idRetries: 0,
    reconnectTimer: null,
    restartTimer: null,
    recoverTimer: null,
    status: 'connecting',
    statusText: 'Bağlanıyor',
    unread: 0,
    tab: 'chat',
    sideOpen: window.matchMedia('(min-width: 900px)').matches
  };
}

function selfState() {
  return {
    mic: !!(L.mic && L.mic.enabled),
    cam: !!L.cam,
    screen: !!L.screen,
    hand: S.hand,
    av: L.av.id,
    scr: L.screen ? L.screen.id : null
  };
}

function upsertSelf() {
  const prev = S.roster.get(S.selfId) || {};
  S.roster.set(S.selfId, {
    ...prev,
    id: S.selfId,
    name: S.name,
    role: S.role,
    ...selfState(),
    floor: S.role === 'teacher' ? true : S.floor
  });
}

function sanitizeUser(u) {
  return {
    id: String(u.id),
    name: cleanName(u.name) || 'Katılımcı',
    role: u.role === 'teacher' ? 'teacher' : 'student',
    mic: !!u.mic,
    cam: !!u.cam,
    screen: !!u.screen,
    hand: !!u.hand,
    floor: !!u.floor,
    av: str(u.av),
    scr: str(u.scr)
  };
}

function findTeacher() {
  for (const u of S.roster.values()) if (u.role === 'teacher') return u;
  return null;
}

function orderedUsers() {
  const users = [...S.roster.values()];
  const rank = (u) => (u.role === 'teacher' ? 0 : u.id === S.selfId ? 1 : 2);
  return users
    .map((u, i) => [u, i])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([u]) => u);
}

function canPublish() {
  return !!S && (S.role === 'teacher' || S.floor);
}

function teacherLink() {
  return S.links.get(teacherId());
}

function send(link, message) {
  if (!link || link.closed || !link.conn.open) return false;
  try {
    const raw = JSON.stringify(message);
    if (encoder.encode(raw).length < CHUNK_BYTES) {
      link.conn.send(message);
      return true;
    }
    const id = uid();
    const size = Math.floor(CHUNK_BYTES / 4);
    const total = Math.ceil(raw.length / size);
    for (let i = 0; i < total; i += 1) link.conn.send({ t: 'part', id, i, n: total, d: raw.slice(i * size, (i + 1) * size) });
    return true;
  } catch {
    return false;
  }
}

function receive(link, message) {
  if (!message || message.t !== 'part') return message;
  const n = Number(message.n);
  const i = Number(message.i);
  if (!message.id || !Number.isInteger(n) || !Number.isInteger(i) || n < 1 || n > 200 || i < 0 || i >= n) return null;
  let entry = link.parts.get(message.id);
  if (!entry) {
    entry = { n, got: 0, chunks: new Array(n) };
    link.parts.set(message.id, entry);
  }
  if (entry.chunks[i] === undefined) {
    entry.chunks[i] = String(message.d || '');
    entry.got += 1;
  }
  if (entry.got < entry.n) return null;
  link.parts.delete(message.id);
  try { return JSON.parse(entry.chunks.join('')); } catch { return null; }
}

function broadcast(message, exceptId) {
  for (const link of S.links.values()) if (link.id !== exceptId) send(link, message);
}

function join(role, name, room) {
  if (S?.active) shutdown(false);
  S = newSession(role, name, room);
  L = { av: new MediaStream(), mic: null, cam: null, screen: null };
  lastPeopleHtml = '';
  ui.chatMessages.replaceChildren();
  ui.lobby.hidden = true;
  ui.room.hidden = false;
  ui.notice.hidden = true;
  ensureAudioCtx();
  upsertSelf();
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('oda', room);
  history.replaceState(null, '', url);
  if (role === 'teacher') {
    startTeacher();
    startTeacherMedia();
  } else {
    addSystem('Derse bağlanılıyor. Öğretmen yayını başlattığında görüntü burada otomatik açılacak.');
    startStudent();
  }
  scheduleRender();
}

function shutdown(sendEnd) {
  if (!S) return;
  const s = S;
  s.active = false;
  clearTimeout(s.reconnectTimer);
  clearTimeout(s.restartTimer);
  clearTimeout(s.recoverTimer);
  if (sendEnd) broadcast({ t: 'end' });
  stopAllMedia();
  const links = [...s.links.values()];
  const peer = s.peer;
  const finish = () => {
    links.forEach(teardownLink);
    try { peer?.destroy(); } catch {}
  };
  if (sendEnd && links.length) setTimeout(finish, 400);
  else finish();
  for (const t of tileEls.values()) t.video.srcObject = null;
  tileEls.clear();
  ui.tiles.replaceChildren();
  for (const a of audioEls.values()) a.srcObject = null;
  audioEls.clear();
  ui.audioSink.replaceChildren();
  for (const m of meters.values()) try { m.src.disconnect(); } catch {}
  meters.clear();
  ui.mainVideo.srcObject = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function goLobby() {
  ui.room.hidden = true;
  ui.lobby.hidden = false;
  updateLobby();
}

function endWith(reason) {
  const { role, name, room } = S;
  shutdown(false);
  goLobby();
  const home = { label: 'Giriş ekranına dön' };
  const retry = { label: 'Tekrar bağlan', primary: true, run: () => join(role, name, room) };
  const notices = {
    taken: { icon: 'teacher', tone: 'warn', title: 'Oda kullanımda', text: 'Bu oda kodunda şu anda başka bir öğretmen ders veriyor. Yeni bir oda kodu oluşturup tekrar deneyin.', actions: [home] },
    full: { icon: 'users', tone: 'warn', title: 'Ders dolu', text: `Bu derse aynı anda en fazla ${MAX_STUDENTS} öğrenci katılabilir.`, actions: [home, retry] },
    kicked: { icon: 'kick', tone: 'danger', title: 'Dersten çıkarıldınız', text: 'Öğretmen sizi bu dersten çıkardı.', actions: [home] },
    ended: { icon: 'check', tone: 'ok', title: 'Ders sona erdi', text: 'Öğretmen dersi bitirdi. Katıldığınız için teşekkürler.', actions: [home, retry] },
    unsupported: { icon: 'x', tone: 'danger', title: 'Tarayıcı desteklenmiyor', text: 'Canlı ders için Chrome, Edge, Safari veya Firefox\'un güncel sürümünü kullanın.', actions: [home] }
  };
  showNotice(notices[reason]);
}

function startTeacher() {
  const s = S;
  setStatus('connecting', s.idRetries ? 'Oda hazırlanıyor' : 'Oda açılıyor');
  const peer = new Peer(teacherId(), { config: ICE, debug: 0 });
  s.peer = peer;
  peer.on('open', () => {
    if (S !== s || !s.active) return;
    s.idRetries = 0;
    if (!s.startedAt) s.startedAt = Date.now();
    setStatus('online', 'Ders yayında');
    if (!s.opened) {
      s.opened = true;
      addSystem('Ders odası açıldı. Davet linkini kopyalayıp öğrencilerinizle paylaşabilirsiniz.');
    }
    broadcastRoster();
  });
  peer.on('connection', (conn) => acceptStudent(s, conn));
  peer.on('disconnected', () => recoverSignal(s, peer));
  peer.on('error', (err) => {
    if (S !== s || !s.active) return;
    if (err.type === 'unavailable-id') {
      try { peer.destroy(); } catch {}
      if (s.idRetries++ < 4) {
        setStatus('connecting', 'Oda hazırlanıyor');
        s.restartTimer = setTimeout(() => S === s && s.active && startTeacher(), 2500);
      } else {
        endWith('taken');
      }
      return;
    }
    handlePeerFailure(s, peer, err);
  });
}

function acceptStudent(s, conn) {
  conn.on('open', () => {
    if (S !== s || !s.active) {
      conn.close();
      return;
    }
    const students = [...s.roster.values()].filter((u) => u.role === 'student' && u.id !== conn.peer).length;
    if (students >= MAX_STUDENTS) {
      try { conn.send({ t: 'reject', reason: 'full' }); } catch {}
      setTimeout(() => conn.close(), 800);
      return;
    }
    const name = cleanName(conn.metadata?.name) || 'Öğrenci';
    const link = createLink(s, conn.peer, conn, false);
    const rejoin = s.roster.has(conn.peer);
    s.roster.set(conn.peer, { id: conn.peer, name, role: 'student', mic: false, cam: false, screen: false, hand: false, floor: false, av: null, scr: null });
    upsertSelf();
    send(link, { t: 'welcome', you: conn.peer, roster: [...s.roster.values()], chat: s.chat.slice(-100), startedAt: s.startedAt, max: MAX_STUDENTS });
    broadcastRoster();
    if (!rejoin) announce(`${name} derse katıldı.`);
    syncSenders(link);
    scheduleRender();
  });
}

function startStudent() {
  const s = S;
  setStatus('connecting', 'Sunucuya bağlanılıyor');
  const peer = new Peer({ config: ICE, debug: 0 });
  s.peer = peer;
  peer.on('open', (id) => {
    if (S !== s || !s.active) return;
    if (s.selfId !== id) {
      s.roster.delete(s.selfId);
      s.selfId = id;
    }
    upsertSelf();
    connectTeacher(s);
    scheduleRender();
  });
  peer.on('disconnected', () => recoverSignal(s, peer));
  peer.on('error', (err) => {
    if (S !== s || !s.active) return;
    if (err.type === 'peer-unavailable') {
      const link = s.links.get(teacherId());
      if (link && !link.conn.open) teardownLink(link);
      setStatus('waiting', 'Öğretmen bekleniyor');
      scheduleReconnect(s, 3000);
      scheduleRender();
      return;
    }
    handlePeerFailure(s, peer, err);
  });
}

function connectTeacher(s) {
  clearTimeout(s.reconnectTimer);
  if (S !== s || !s.active || !s.peer || s.peer.destroyed || s.peer.disconnected) return;
  const current = s.links.get(teacherId());
  if (current && !current.closed) return;
  if (s.status !== 'waiting') setStatus('connecting', 'Öğretmene bağlanılıyor');
  const conn = s.peer.connect(teacherId(), { reliable: true, serialization: 'json', metadata: { name: s.name } });
  if (!conn) {
    scheduleReconnect(s, 3000);
    return;
  }
  const link = createLink(s, teacherId(), conn, true);
  link.openTimer = setTimeout(() => {
    if (!conn.open && !link.closed) {
      teardownLink(link);
      scheduleReconnect(s, 1000);
    }
  }, 12000);
  conn.on('open', () => {
    clearTimeout(link.openTimer);
    link.lastSeen = Date.now();
    setStatus('connecting', 'Derse katılınıyor');
  });
}

function scheduleReconnect(s, ms) {
  clearTimeout(s.reconnectTimer);
  if (S !== s || !s.active) return;
  s.reconnectTimer = setTimeout(() => connectTeacher(s), ms);
}

function recoverSignal(s, peer) {
  if (S !== s || !s.active || peer.destroyed) return;
  if (!s.links.size) setStatus('warn', 'Sunucu bağlantısı yenileniyor');
  clearTimeout(s.recoverTimer);
  s.recoverTimer = setTimeout(() => {
    if (S !== s || !s.active || peer.destroyed || !peer.disconnected) return;
    try { peer.reconnect(); } catch {}
  }, 2000);
}

function handlePeerFailure(s, peer, err) {
  if (err.type === 'browser-incompatible') {
    endWith('unsupported');
    return;
  }
  if (peer.destroyed) {
    setStatus('warn', 'Bağlantı yeniden kuruluyor');
    clearTimeout(s.restartTimer);
    s.restartTimer = setTimeout(() => {
      if (S !== s || !s.active) return;
      if (s.role === 'teacher') startTeacher();
      else startStudent();
    }, 3000);
    return;
  }
  if (peer.disconnected) recoverSignal(s, peer);
}

function createLink(s, id, conn, polite) {
  const old = s.links.get(id);
  if (old) teardownLink(old);
  const link = {
    session: s,
    id,
    conn,
    polite,
    pc: null,
    makingOffer: false,
    ignoreOffer: false,
    senders: new Map(),
    streams: new Set(),
    trackStreams: new Map(),
    parts: new Map(),
    lastSeen: Date.now(),
    queue: Promise.resolve(),
    closed: false,
    kicked: false,
    openTimer: null
  };
  makePc(link);
  s.links.set(id, link);
  conn.on('data', (data) => {
    if (link.closed) return;
    link.lastSeen = Date.now();
    const message = receive(link, data);
    if (!message) return;
    link.queue = link.queue.then(() => onMessage(link, message)).catch(() => {});
  });
  conn.on('close', () => onLinkClosed(link));
  conn.on('error', (err) => {
    if (err?.type === 'message-too-big') return;
    onLinkClosed(link);
  });
  return link;
}

function makePc(link) {
  const pc = new RTCPeerConnection(ICE);
  pc.onnegotiationneeded = async () => {
    try {
      link.makingOffer = true;
      await pc.setLocalDescription();
      send(link, { t: 'sdp', d: pc.localDescription });
    } catch {
    } finally {
      link.makingOffer = false;
    }
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) send(link, { t: 'ice', c: e.candidate });
  };
  pc.ontrack = (e) => onTrack(link, e);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      try { pc.restartIce(); } catch {}
    }
  };
  link.pc = pc;
}

function teardownLink(link) {
  if (link.closed) return;
  link.closed = true;
  clearTimeout(link.openTimer);
  const s = link.session;
  if (s.links.get(link.id) === link) s.links.delete(link.id);
  try { link.pc.close(); } catch {}
  try { link.conn.close(); } catch {}
  for (const id of link.streams) s.remote.delete(id);
}

function onLinkClosed(link) {
  if (link.closed) return;
  const s = link.session;
  teardownLink(link);
  if (S !== s || !s.active) return;
  if (s.role === 'teacher') dropStudent(link.id, link.kicked ? 'çıkarıldı' : 'ayrıldı');
  else teacherLost(s);
}

function dropStudent(id, verb) {
  const u = S.roster.get(id);
  if (!u) return;
  S.roster.delete(id);
  broadcastRoster();
  syncAll();
  announce(`${u.name} dersten ${verb}.`);
  scheduleRender();
}

function teacherLost(s) {
  const wasInClass = s.welcomed;
  s.welcomed = false;
  if (s.floor) {
    s.floor = false;
    stopAllMedia();
  }
  s.hand = false;
  for (const id of [...s.roster.keys()]) if (id !== s.selfId) s.roster.delete(id);
  s.startedAt = null;
  upsertSelf();
  if (wasInClass) addSystem('Öğretmen bağlantısı koptu. Yeniden bağlanılıyor.');
  setStatus('waiting', 'Öğretmen bekleniyor');
  scheduleReconnect(s, 2500);
  scheduleRender();
}

async function onMessage(link, m) {
  if (!m || typeof m !== 'object' || link.session !== S || !S.active) return;
  if (m.t === 'ping') return;
  if (m.t === 'sdp' || m.t === 'ice') return onSignal(link, m);
  if (S.role === 'teacher') return onStudentMessage(link, m);
  return onTeacherMessage(link, m);
}

async function onSignal(link, m) {
  const pc = link.pc;
  if (link.closed) return;
  if (m.t === 'sdp') {
    const d = m.d;
    if (!d || !d.type) return;
    const collision = d.type === 'offer' && (link.makingOffer || pc.signalingState !== 'stable');
    link.ignoreOffer = !link.polite && collision;
    if (link.ignoreOffer) return;
    await pc.setRemoteDescription(d);
    if (d.type === 'offer') {
      await pc.setLocalDescription();
      send(link, { t: 'sdp', d: pc.localDescription });
    }
    return;
  }
  if (m.c) {
    try { await pc.addIceCandidate(m.c); } catch {}
  }
}

function onStudentMessage(link, m) {
  const u = S.roster.get(link.id);
  if (!u) return;
  if (m.t === 'state') {
    const wasHand = u.hand;
    Object.assign(u, {
      mic: !!m.mic,
      cam: !!m.cam,
      screen: !!m.screen,
      av: str(m.av),
      scr: str(m.scr),
      hand: !u.floor && !!m.hand
    });
    if (u.hand && !wasHand) {
      addSystem(`${u.name} söz istedi.`);
      toast(`${u.name} söz istiyor`, { tone: 'hand', action: { label: 'Söz ver', run: () => setFloor(link.id, true) } });
    }
    broadcastRoster();
    syncAll();
    scheduleRender();
    return;
  }
  if (m.t === 'chat') {
    const text = String(m.text || '').trim().slice(0, 500);
    if (!text) return;
    const msg = { id: str(m.id) || uid(), from: link.id, name: u.name, role: 'student', text, ts: Date.now() };
    pushHistory(msg);
    renderChatItem(msg);
    broadcast({ t: 'chat', msg }, link.id);
    return;
  }
  if (m.t === 'release') setFloor(link.id, false);
}

function onTeacherMessage(link, m) {
  switch (m.t) {
    case 'welcome':
      S.welcomed = true;
      S.startedAt = Number(m.startedAt) || Date.now();
      applyRoster(m.roster);
      ui.chatMessages.replaceChildren();
      (Array.isArray(m.chat) ? m.chat : []).forEach((item) => renderChatItem(sanitizeChat(item), true));
      addSystem('Derse bağlandınız.');
      setStatus('online', 'Derse bağlı');
      pushState();
      break;
    case 'roster':
      applyRoster(m.users);
      break;
    case 'chat':
      if (m.msg) renderChatItem(sanitizeChat(m.msg));
      break;
    case 'sys':
      renderChatItem({ sys: true, text: String(m.text || '').slice(0, 200) });
      break;
    case 'kick':
      endWith('kicked');
      break;
    case 'end':
      endWith('ended');
      break;
    case 'reject':
      endWith('full');
      break;
  }
}

function sanitizeChat(item) {
  if (!item || typeof item !== 'object') return { sys: true, text: '' };
  if (item.sys) return { sys: true, text: String(item.text || '').slice(0, 200) };
  return {
    id: str(item.id),
    from: str(item.from),
    name: cleanName(item.name) || 'Katılımcı',
    role: item.role === 'teacher' ? 'teacher' : 'student',
    text: String(item.text || '').slice(0, 500),
    ts: Number(item.ts) || Date.now()
  };
}

function applyRoster(list) {
  if (!Array.isArray(list)) return;
  const prevFloor = S.floor;
  const next = new Map();
  for (const u of list) if (u && u.id) next.set(String(u.id), sanitizeUser(u));
  S.roster = next;
  const me = S.roster.get(S.selfId);
  S.floor = !!me?.floor;
  if (S.floor && !prevFloor) S.hand = false;
  upsertSelf();
  if (S.floor !== prevFloor) onFloorChanged(S.floor);
  scheduleRender();
}

function onFloorChanged(granted) {
  if (granted) {
    toast('Söz size verildi. Mikrofonunuz açılıyor.', { tone: 'ok' });
    enableMic();
  } else {
    stopAllMedia();
    toast('Öğretmen sözü geri aldı.');
  }
  pushState();
}

function pushHistory(item) {
  S.chat.push(item);
  if (S.chat.length > 200) S.chat.splice(0, S.chat.length - 200);
}

function announce(text) {
  const item = { sys: true, text, ts: Date.now() };
  pushHistory(item);
  renderChatItem(item);
  broadcast({ t: 'sys', text });
}

function addSystem(text) {
  renderChatItem({ sys: true, text });
}

function broadcastRoster() {
  if (!S || S.role !== 'teacher') return;
  upsertSelf();
  broadcast({ t: 'roster', users: [...S.roster.values()] });
}

function pushState() {
  if (!S?.active) return;
  upsertSelf();
  if (S.role === 'teacher') broadcastRoster();
  else if (S.welcomed) send(teacherLink(), { t: 'state', ...selfState() });
  syncAll();
  scheduleRender();
}

function setFloor(id, granted) {
  if (!S?.active || S.role !== 'teacher') return;
  const u = S.roster.get(id);
  if (!u || u.role !== 'student' || u.floor === granted) return;
  u.floor = granted;
  u.hand = false;
  if (!granted) {
    u.mic = false;
    u.cam = false;
    u.screen = false;
  }
  broadcastRoster();
  syncAll();
  announce(granted ? `${u.name} söz aldı.` : `${u.name} sözü tamamladı.`);
  scheduleRender();
}

async function kick(id) {
  const u = S.roster.get(id);
  if (!u) return;
  const ok = await confirmDialog({ title: 'Öğrenciyi çıkar', text: `${u.name} dersten çıkarılacak. Emin misiniz?`, ok: 'Dersten çıkar', icon: 'kick' });
  if (!ok || !S?.active) return;
  const link = S.links.get(id);
  if (!link) return;
  link.kicked = true;
  send(link, { t: 'kick' });
  setTimeout(() => onLinkClosed(link), 500);
}

function onTrack(link, e) {
  const s = link.session;
  if (link.closed) return;
  const stream = e.streams[0] || new MediaStream([e.track]);
  s.remote.set(stream.id, stream);
  link.streams.add(stream.id);
  link.trackStreams.set(e.track.id, stream);
  const refresh = () => {
    if (S !== s || !s.active) return;
    if (s.role === 'teacher') syncAll();
    scheduleRender();
  };
  if (!wiredStreams.has(stream)) {
    wiredStreams.add(stream);
    stream.addEventListener('addtrack', refresh);
    stream.addEventListener('removetrack', refresh);
  }
  e.track.addEventListener('unmute', refresh);
  e.track.addEventListener('ended', refresh);
  refresh();
}

function forwardables(excludeId) {
  const out = [];
  for (const link of S.links.values()) {
    if (link.id === excludeId || link.closed) continue;
    const u = S.roster.get(link.id);
    if (!u || !u.floor) continue;
    for (const stream of new Set(link.trackStreams.values())) {
      for (const track of stream.getTracks()) if (track.readyState === 'live') out.push([track, stream]);
    }
  }
  return out;
}

function desiredTracks(link) {
  const out = [];
  if (canPublish()) {
    if (L.mic) out.push([L.mic, L.av]);
    if (L.cam) out.push([L.cam, L.av]);
    if (L.screen) L.screen.getTracks().forEach((t) => out.push([t, L.screen]));
  }
  if (S.role === 'teacher') out.push(...forwardables(link.id));
  return out;
}

function syncSenders(link) {
  if (link.closed || link.pc.signalingState === 'closed') return;
  const want = desiredTracks(link);
  const ids = new Set(want.map(([t]) => t.id));
  for (const [id, sender] of link.senders) {
    if (ids.has(id)) continue;
    try { link.pc.removeTrack(sender); } catch {}
    link.senders.delete(id);
  }
  for (const [track, stream] of want) {
    if (link.senders.has(track.id)) continue;
    try { link.senders.set(track.id, link.pc.addTrack(track, stream)); } catch {}
  }
}

function syncAll() {
  if (!S?.active) return;
  for (const link of S.links.values()) if (link.conn.open) syncSenders(link);
}

function mediaError(err, what) {
  const name = err?.name || '';
  if (!navigator.mediaDevices) toast('Kamera ve mikrofon için site HTTPS üzerinden açılmalıdır.', { tone: 'danger' });
  else if (name === 'NotAllowedError' || name === 'SecurityError') toast(`${what} izni verilmedi. Adres çubuğundaki kilit simgesinden izin verebilirsiniz.`, { tone: 'danger' });
  else if (name === 'NotFoundError' || name === 'OverconstrainedError') toast(`${what} bulunamadı.`, { tone: 'danger' });
  else if (name === 'NotReadableError' || name === 'AbortError') toast(`${what} başka bir uygulama tarafından kullanılıyor olabilir.`, { tone: 'danger' });
  else toast(`${what} başlatılamadı.`, { tone: 'danger' });
}

function attachMic(track) {
  L.mic = track;
  L.av.addTrack(track);
  track.addEventListener('ended', () => {
    if (L.mic !== track) return;
    L.av.removeTrack(track);
    L.mic = null;
    pushState();
  });
}

function attachCam(track) {
  L.cam = track;
  L.av.addTrack(track);
  track.addEventListener('ended', () => {
    if (L.cam !== track) return;
    L.av.removeTrack(track);
    L.cam = null;
    pushState();
  });
}

async function startTeacherMedia() {
  const s = S;
  if (!navigator.mediaDevices?.getUserMedia) {
    mediaError(null, 'Kamera');
    return;
  }
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO });
  } catch (err) {
    if (err?.name !== 'NotAllowedError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
        toast('Kamera kullanılamıyor. Derse mikrofonla devam ediliyor.');
      } catch {}
    }
    if (!stream) mediaError(err, 'Kamera ve mikrofon');
  }
  if (!stream) return;
  if (S !== s || !s.active) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  const audio = stream.getAudioTracks()[0];
  const video = stream.getVideoTracks()[0];
  if (audio) attachMic(audio);
  if (video) attachCam(video);
  pushState();
}

async function enableMic() {
  const s = S;
  if (L.mic) {
    L.mic.enabled = true;
    pushState();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) return mediaError(null, 'Mikrofon');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
    const track = stream.getAudioTracks()[0];
    if (S !== s || !s.active || !canPublish() || L.mic) {
      track.stop();
      return;
    }
    attachMic(track);
    pushState();
  } catch (err) {
    mediaError(err, 'Mikrofon');
  }
}

async function toggleMic() {
  if (!canPublish()) return denyPublish();
  if (!L.mic) return enableMic();
  L.mic.enabled = !L.mic.enabled;
  pushState();
}

async function toggleCam() {
  if (!canPublish()) return denyPublish();
  if (L.cam) {
    const track = L.cam;
    L.cam = null;
    L.av.removeTrack(track);
    track.stop();
    pushState();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) return mediaError(null, 'Kamera');
  const s = S;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
    const track = stream.getVideoTracks()[0];
    if (S !== s || !s.active || !canPublish() || L.cam) {
      track.stop();
      return;
    }
    attachCam(track);
    pushState();
  } catch (err) {
    mediaError(err, 'Kamera');
  }
}

async function toggleScreen() {
  if (L.screen) return stopScreen();
  if (!canPublish()) return denyPublish();
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast('Bu cihaz ekran paylaşımını desteklemiyor.');
    return;
  }
  const s = S;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: true });
    if (S !== s || !s.active || !canPublish() || L.screen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const video = stream.getVideoTracks()[0];
    if (video) {
      try { video.contentHint = 'detail'; } catch {}
      video.addEventListener('ended', () => {
        if (L.screen === stream) stopScreen();
      });
    }
    L.screen = stream;
    pushState();
  } catch (err) {
    if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') toast('Ekran paylaşımı başlatılamadı.', { tone: 'danger' });
  }
}

function stopScreen() {
  if (!L.screen) return;
  const stream = L.screen;
  L.screen = null;
  stream.getTracks().forEach((t) => t.stop());
  pushState();
}

function stopAllMedia() {
  if (!L) return;
  for (const track of [L.mic, L.cam]) {
    if (!track) continue;
    L.av.removeTrack(track);
    track.stop();
  }
  L.mic = null;
  L.cam = null;
  if (L.screen) L.screen.getTracks().forEach((t) => t.stop());
  L.screen = null;
}

function denyPublish() {
  toast('Mikrofon, kamera ve ekran için önce söz isteyin.', { tone: 'hand' });
  ui.handBtn.classList.remove('nudge');
  void ui.handBtn.offsetWidth;
  ui.handBtn.classList.add('nudge');
}

function toggleHand() {
  if (S.role !== 'student') return;
  if (!S.welcomed) {
    toast('Öğretmen derse girdiğinde söz isteyebilirsiniz.');
    return;
  }
  if (S.floor) {
    send(teacherLink(), { t: 'release' });
    return;
  }
  S.hand = !S.hand;
  if (S.hand) toast('Söz isteğiniz öğretmene iletildi.', { tone: 'hand' });
  pushState();
}

function ensureAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
}

function syncMeters() {
  if (!audioCtx) return;
  const want = new Map();
  for (const u of S.roster.values()) {
    if (!u.mic) continue;
    const track = u.id === S.selfId ? L.mic : S.remote.get(u.av)?.getAudioTracks()[0];
    if (track && track.readyState === 'live') want.set(u.id, track);
  }
  for (const [id, m] of meters) {
    if (want.get(id) === m.track) continue;
    try { m.src.disconnect(); } catch {}
    meters.delete(id);
  }
  for (const [id, track] of want) {
    if (meters.has(id)) continue;
    try {
      const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      meters.set(id, { track, src, analyser, buf: new Uint8Array(analyser.fftSize) });
    } catch {}
  }
}

function tickMeters() {
  if (!S?.active) return;
  const speaking = new Set();
  for (const [id, m] of meters) {
    m.analyser.getByteTimeDomainData(m.buf);
    let peak = 0;
    for (let i = 0; i < m.buf.length; i += 4) peak = Math.max(peak, Math.abs(m.buf[i] - 128));
    if (peak / 128 > 0.07) speaking.add(id);
  }
  document.querySelectorAll('[data-uid]').forEach((el) => el.classList.toggle('speaking', speaking.has(el.dataset.uid)));
}

function camOf(u) {
  if (!u || !u.cam) return null;
  const stream = u.id === S.selfId ? (L.cam ? L.av : null) : S.remote.get(u.av);
  return stream && stream.getVideoTracks().some((t) => t.readyState === 'live') ? stream : null;
}

function screenOf(u) {
  if (!u || !u.screen) return null;
  const stream = u.id === S.selfId ? L.screen : S.remote.get(u.scr);
  return stream && stream.getVideoTracks().length ? stream : null;
}

function pickMain() {
  const users = orderedUsers();
  const teacher = users.find((u) => u.role === 'teacher') || null;
  const sharers = users.filter((u) => u.screen);
  for (const u of sharers) {
    const stream = screenOf(u);
    if (stream) return { user: u, kind: 'screen', stream };
  }
  const cam = camOf(teacher);
  if (cam) return { user: teacher, kind: 'cam', stream: cam };
  return { user: teacher, kind: 'none', stream: null };
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  const run = () => {
    if (!renderQueued) return;
    renderQueued = false;
    render();
  };
  if (document.hidden) setTimeout(run, 30);
  else {
    requestAnimationFrame(run);
    setTimeout(run, 250);
  }
}

function render() {
  if (!S?.active) return;
  if (S.sideOpen && S.tab === 'chat') S.unread = 0;
  const main = pickMain();
  renderTop();
  renderStage(main);
  renderTiles(main);
  renderPeople();
  renderControls();
  renderSide();
  renderAudio();
  syncMeters();
}

function renderTop() {
  const teacher = findTeacher();
  const present = S.role === 'teacher' ? S.status === 'online' : S.welcomed;
  ui.roomCode.textContent = S.room;
  ui.liveBadge.hidden = !(present && teacher && (teacher.cam || teacher.screen || teacher.mic));
  ui.elapsed.hidden = !S.startedAt;
  ui.connStatus.className = `conn-status ${S.status}`;
  ui.connText.textContent = S.statusText;
  ui.peopleCount.textContent = String(S.roster.size);
  tickElapsed();
}

function renderStage(main) {
  const video = ui.mainVideo;
  if (video.srcObject !== main.stream) {
    video.srcObject = main.stream;
    if (main.stream) video.play().catch(() => {});
  }
  video.hidden = !main.stream;
  video.classList.toggle('mirror', main.kind === 'cam' && main.user?.id === S.selfId);
  video.classList.toggle('screen', main.kind === 'screen');
  if (main.kind === 'cam') ui.stageMain.dataset.uid = main.user.id;
  else {
    delete ui.stageMain.dataset.uid;
    ui.stageMain.classList.remove('speaking');
  }

  if (main.stream) {
    const who = main.user.id === S.selfId ? 'Siz' : main.user.name;
    ui.stageLabel.innerHTML = main.kind === 'screen'
      ? `<svg class="ic"><use href="#i-screen"/></svg><span>${esc(who)} · Ekran paylaşımı</span>`
      : `<svg class="ic"><use href="#i-${main.user.mic ? 'mic' : 'mic-off'}"/></svg><span>${esc(who)} · ${ROLE_LABEL[main.user.role]}</span>`;
    ui.stageLabel.classList.toggle('muted', main.kind === 'cam' && !main.user.mic);
    ui.stageLabel.hidden = false;
    ui.placeholder.hidden = true;
    return;
  }

  ui.stageLabel.hidden = true;
  ui.placeholder.hidden = false;
  const teacher = main.user;
  const waiting = S.role === 'student' && (!S.welcomed || !teacher);
  ui.placeholderAvatar.classList.toggle('waiting', waiting);
  if (waiting) {
    ui.placeholderAvatar.innerHTML = '<span class="spinner"></span>';
    ui.placeholderTitle.textContent = 'Öğretmen bekleniyor';
    ui.placeholderText.textContent = 'Öğretmen derse girdiğinde yayın burada otomatik başlayacak.';
    return;
  }
  ui.placeholderAvatar.textContent = initials(teacher?.name || S.name);
  if (S.role === 'teacher') {
    ui.placeholderTitle.textContent = 'Kameranız kapalı';
    ui.placeholderText.textContent = 'Yayına başlamak için alttaki çubuktan kameranızı açın veya ekranınızı paylaşın.';
  } else {
    ui.placeholderTitle.textContent = teacher.name;
    ui.placeholderText.textContent = teacher.mic ? 'Öğretmenin kamerası kapalı, sesli anlatım devam ediyor.' : 'Öğretmen derste. Yayın birazdan başlayacak.';
  }
}

function tileFor(u) {
  let t = tileEls.get(u.id);
  if (!t) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = '<video autoplay playsinline muted></video><div class="tile-avatar"></div><span class="tile-hand"><svg class="ic"><use href="#i-hand"/></svg></span><div class="tile-foot"><span class="tile-mic"><svg class="ic"><use href="#i-mic-off"/></svg></span><span class="tile-name"></span><span class="tile-role"></span></div>';
    t = { el, video: el.querySelector('video'), avatar: el.querySelector('.tile-avatar'), name: el.querySelector('.tile-name'), role: el.querySelector('.tile-role') };
    tileEls.set(u.id, t);
  }
  const stream = camOf(u);
  if (t.video.srcObject !== stream) {
    t.video.srcObject = stream;
    if (stream) t.video.play().catch(() => {});
  }
  const self = u.id === S.selfId;
  t.el.dataset.uid = u.id;
  t.el.classList.toggle('has-video', !!stream);
  t.el.classList.toggle('mirror', self);
  t.el.classList.toggle('mic-off', !u.mic);
  t.el.classList.toggle('hand', u.hand);
  t.el.classList.toggle('teacher', u.role === 'teacher');
  t.el.classList.toggle('floor', u.role === 'student' && u.floor);
  t.avatar.textContent = initials(u.name);
  t.name.textContent = self ? `${u.name} (Siz)` : u.name;
  t.role.textContent = u.role === 'teacher' ? 'Öğretmen' : u.floor ? 'Söz sırası' : '';
  return t;
}

function renderTiles(main) {
  const users = orderedUsers().filter((u) => !(main.kind === 'cam' && u.id === main.user.id));
  const keep = new Set(users.map((u) => u.id));
  for (const [id, t] of tileEls) {
    if (keep.has(id)) continue;
    t.video.srcObject = null;
    t.el.remove();
    tileEls.delete(id);
  }
  const els = users.map((u) => tileFor(u).el);
  const current = [...ui.tiles.children];
  if (current.length !== els.length || current.some((el, i) => el !== els[i])) {
    ui.tiles.replaceChildren(...els);
    for (const t of tileEls.values()) if (t.video.srcObject) t.video.play().catch(() => {});
  }
  ui.tiles.hidden = els.length === 0;
  ui.stage.classList.toggle('no-tiles', els.length === 0);
}

function renderPeople() {
  const rows = orderedUsers().map((u) => {
    const self = u.id === S.selfId;
    const badges = [`<span class="badge ${u.role}">${ROLE_LABEL[u.role]}</span>`];
    if (u.role === 'student' && u.floor) badges.push('<span class="badge floor">Söz sırası</span>');
    if (u.hand) badges.push('<span class="badge hand">Söz istiyor</span>');
    if (u.screen) badges.push('<span class="badge screen">Ekran</span>');
    let actions = '';
    if (S.role === 'teacher' && u.role === 'student') {
      actions = `<div class="person-actions">
        <button class="pbtn ${u.floor ? '' : 'primary'}" type="button" data-act="${u.floor ? 'revoke' : 'grant'}" data-id="${esc(u.id)}">${u.floor ? 'Sözü al' : 'Söz ver'}</button>
        <button class="pbtn danger icon" type="button" data-act="kick" data-id="${esc(u.id)}" title="Dersten çıkar"><svg class="ic"><use href="#i-kick"/></svg></button>
      </div>`;
    }
    return `<li class="person${u.hand ? ' hand' : ''}" data-uid="${esc(u.id)}">
      <span class="avatar ${u.role}">${esc(initials(u.name))}</span>
      <div class="person-main">
        <span class="person-name">${esc(u.name)}${self ? ' <em>(Siz)</em>' : ''}</span>
        <span class="person-badges">${badges.join('')}</span>
      </div>
      <span class="person-media">
        <svg class="ic ${u.mic ? 'on' : 'off'}"><use href="#i-${u.mic ? 'mic' : 'mic-off'}"/></svg>
        <svg class="ic ${u.cam ? 'on' : 'off'}"><use href="#i-${u.cam ? 'cam' : 'cam-off'}"/></svg>
      </span>
      ${actions}
    </li>`;
  });
  if (S.role === 'student' && !S.welcomed) {
    rows.push('<li class="person-empty">Öğretmen derse girdiğinde katılımcılar burada listelenecek.</li>');
  } else if (S.role === 'teacher' && S.roster.size === 1) {
    rows.push('<li class="person-empty">Henüz öğrenci yok. Davet linkini paylaşarak öğrencilerinizi derse çağırın.</li>');
  }
  const html = rows.join('');
  if (html !== lastPeopleHtml) {
    ui.peopleList.innerHTML = html;
    lastPeopleHtml = html;
  }
}

function setCtrl(btn, { icon, label, title, classes = {}, hidden = false }) {
  btn.hidden = hidden;
  if (hidden) return;
  btn.querySelector('use').setAttribute('href', `#i-${icon}`);
  btn.querySelector('.ctrl-label').textContent = label;
  btn.title = title || label;
  for (const [name, on] of Object.entries(classes)) btn.classList.toggle(name, !!on);
}

function renderControls() {
  const pub = canPublish();
  const micOn = !!(L.mic && L.mic.enabled);
  const camOn = !!L.cam;
  const screenOn = !!L.screen;
  const lockHint = 'Önce söz isteyin';
  setCtrl(ui.micBtn, {
    icon: micOn ? 'mic' : 'mic-off',
    label: micOn ? 'Mikrofon açık' : 'Mikrofon',
    title: pub ? (micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç') : lockHint,
    classes: { off: !micOn && pub, on: micOn, locked: !pub }
  });
  setCtrl(ui.camBtn, {
    icon: camOn ? 'cam' : 'cam-off',
    label: camOn ? 'Kamera açık' : 'Kamera',
    title: pub ? (camOn ? 'Kamerayı kapat' : 'Kamerayı aç') : lockHint,
    classes: { off: !camOn && pub, on: camOn, locked: !pub }
  });
  setCtrl(ui.screenBtn, {
    icon: 'screen',
    label: screenOn ? 'Paylaşımı durdur' : 'Ekranı paylaş',
    title: pub ? (screenOn ? 'Ekran paylaşımını durdur' : 'Ekranını paylaş') : lockHint,
    classes: { active: screenOn, locked: !pub },
    hidden: !navigator.mediaDevices?.getDisplayMedia
  });
  setCtrl(ui.handBtn, {
    icon: 'hand',
    label: S.floor ? 'Sözü bırak' : S.hand ? 'Eli indir' : 'Söz iste',
    classes: { active: S.hand || S.floor },
    hidden: S.role !== 'student'
  });
  setCtrl(ui.leaveBtn, { icon: 'leave', label: S.role === 'teacher' ? 'Dersi bitir' : 'Ayrıl' });
  ui.selfRole.innerHTML = S.role === 'teacher'
    ? '<span class="badge teacher">Öğretmen</span><span>Dersi yönetiyorsunuz</span>'
    : `<span class="badge student">Öğrenci</span><span>${S.floor ? 'Söz sizde' : 'İzleyici'}</span>`;
}

function renderSide() {
  ui.room.classList.toggle('side-open', S.sideOpen);
  ui.side.classList.toggle('open', S.sideOpen);
  document.querySelectorAll('.side-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === S.tab));
  ui.chatView.hidden = S.tab !== 'chat';
  ui.peopleView.hidden = S.tab !== 'people';
  const unread = S.unread > 99 ? '99+' : String(S.unread);
  ui.chatBadge.hidden = !S.unread;
  ui.chatBadge.textContent = unread;
  ui.chatToggleBadge.hidden = !S.unread;
  ui.chatToggleBadge.textContent = unread;
  ui.chatToggleBtn.classList.toggle('active', S.sideOpen && S.tab === 'chat');
  ui.peopleToggleBtn.classList.toggle('active', S.sideOpen && S.tab === 'people');
  const hands = [...S.roster.values()].filter((u) => u.hand).length;
  ui.peopleToggleBtn.classList.toggle('alert', S.role === 'teacher' && hands > 0);
}

function renderAudio() {
  const want = new Map();
  for (const u of S.roster.values()) {
    if (u.id === S.selfId) continue;
    for (const id of [u.av, u.scr]) {
      const stream = id && S.remote.get(id);
      if (stream && stream.getAudioTracks().length) want.set(id, stream);
    }
  }
  for (const [id, el] of audioEls) {
    if (want.get(id) === el.srcObject) continue;
    el.srcObject = null;
    el.remove();
    audioEls.delete(id);
  }
  for (const [id, stream] of want) {
    if (audioEls.has(id)) continue;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.srcObject = stream;
    ui.audioSink.appendChild(el);
    audioEls.set(id, el);
    el.play().catch(() => offerAudioUnlock());
  }
}

let unlockOffered = false;
function offerAudioUnlock() {
  if (unlockOffered) return;
  unlockOffered = true;
  toast('Tarayıcı sesi otomatik başlatmadı.', {
    action: {
      label: 'Sesi aç',
      run: () => {
        unlockOffered = false;
        ensureAudioCtx();
        for (const el of audioEls.values()) el.play().catch(() => {});
      }
    }
  });
}

function renderChatItem(item, quiet = false) {
  if (!item || (item.sys && !item.text)) return;
  const box = ui.chatMessages;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const el = document.createElement('div');
  const self = !item.sys && item.from === S.selfId;
  if (item.sys) {
    el.className = 'msg-sys';
    el.textContent = item.text;
  } else {
    el.className = `msg${self ? ' self' : ''}${item.role === 'teacher' ? ' teacher' : ''}`;
    const head = document.createElement('div');
    head.className = 'msg-head';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = self ? 'Siz' : item.name;
    head.appendChild(name);
    if (item.role === 'teacher') {
      const badge = document.createElement('span');
      badge.className = 'badge teacher';
      badge.textContent = 'Öğretmen';
      head.appendChild(badge);
    }
    const time = document.createElement('time');
    const d = new Date(item.ts || Date.now());
    time.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    head.appendChild(time);
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = item.text;
    el.append(head, body);
  }
  box.appendChild(el);
  if (nearBottom || self || quiet) box.scrollTop = box.scrollHeight;
  if (!quiet && !item.sys && !self && !(S.sideOpen && S.tab === 'chat')) {
    S.unread += 1;
    scheduleRender();
  }
}

function tickElapsed() {
  if (!S?.active || !S.startedAt) return;
  const total = Math.max(0, Math.floor((Date.now() - S.startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  ui.elapsedText.textContent = h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function heartbeat() {
  if (!S?.active) return;
  const now = Date.now();
  for (const link of [...S.links.values()]) {
    if (!link.conn.open) continue;
    if (now - link.lastSeen > 30000) {
      onLinkClosed(link);
      continue;
    }
    send(link, { t: 'ping' });
  }
}

function openSide(tab) {
  if (S.sideOpen && S.tab === tab) S.sideOpen = false;
  else {
    S.sideOpen = true;
    S.tab = tab;
  }
  scheduleRender();
}

async function copyInvite() {
  const url = inviteUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); } catch {}
    input.remove();
  }
  toast('Davet linki kopyalandı.', { tone: 'ok' });
}

function selectedRole() {
  return ui.joinForm.querySelector('input[name="role"]:checked')?.value || 'student';
}

function setRole(role) {
  const input = ui.joinForm.querySelector(`input[name="role"][value="${role}"]`);
  if (input) input.checked = true;
}

function updateLobby() {
  const teacher = selectedRole() === 'teacher';
  ui.joinBtnText.textContent = teacher ? 'Dersi başlat' : 'Derse gir';
  ui.newRoomBtn.hidden = !teacher;
  if (teacher && !ui.roomInput.value.trim()) ui.roomInput.value = randomCode();
}

function lobbyError(text) {
  ui.joinError.textContent = text;
  ui.joinError.classList.toggle('show', !!text);
}

ui.joinForm.addEventListener('change', (e) => {
  if (e.target.name === 'role') {
    lobbyError('');
    updateLobby();
  }
});

ui.newRoomBtn.addEventListener('click', () => {
  ui.roomInput.value = randomCode();
  lobbyError('');
});

ui.roomInput.addEventListener('blur', () => {
  const value = slug(ui.roomInput.value);
  if (ui.roomInput.value.trim()) ui.roomInput.value = value;
});

ui.joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const role = selectedRole();
  const name = cleanName(ui.nameInput.value);
  const room = slug(ui.roomInput.value);
  if (!name) {
    lobbyError('Lütfen adınızı yazın.');
    ui.nameInput.focus();
    return;
  }
  if (room.length < 3) {
    lobbyError('Oda kodu en az 3 karakter olmalı. Harf, rakam ve tire kullanabilirsiniz.');
    ui.roomInput.focus();
    return;
  }
  if (!window.RTCPeerConnection) {
    lobbyError('Tarayıcınız canlı dersi desteklemiyor. Chrome, Edge, Safari veya Firefox\'un güncel sürümünü kullanın.');
    return;
  }
  if (typeof window.Peer !== 'function') {
    lobbyError('Bağlantı bileşeni yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
    return;
  }
  lobbyError('');
  ui.roomInput.value = room;
  store.set('cd-name', name);
  store.set('cd-role', role);
  store.set('cd-last', `${role}:${room}`, true);
  join(role, name, room);
});

ui.micBtn.addEventListener('click', toggleMic);
ui.camBtn.addEventListener('click', toggleCam);
ui.screenBtn.addEventListener('click', toggleScreen);
ui.handBtn.addEventListener('click', toggleHand);
ui.copyLinkBtn.addEventListener('click', copyInvite);
ui.chatToggleBtn.addEventListener('click', () => openSide('chat'));
ui.peopleToggleBtn.addEventListener('click', () => openSide('people'));
ui.sideCloseBtn.addEventListener('click', () => {
  S.sideOpen = false;
  scheduleRender();
});

document.querySelectorAll('.side-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    S.tab = tab.dataset.tab;
    S.sideOpen = true;
    scheduleRender();
  });
});

ui.leaveBtn.addEventListener('click', async () => {
  if (!S?.active) return;
  const teacher = S.role === 'teacher';
  const ok = await confirmDialog(teacher
    ? { title: 'Dersi bitir', text: 'Ders sona erecek ve tüm öğrencilerin bağlantısı kapanacak.', ok: 'Dersi bitir' }
    : { title: 'Dersten ayrıl', text: 'Dersten ayrılmak istediğinize emin misiniz?', ok: 'Ayrıl' });
  if (!ok || !S?.active) return;
  shutdown(teacher);
  goLobby();
});

ui.peopleList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || S?.role !== 'teacher') return;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'grant') setFloor(id, true);
  else if (btn.dataset.act === 'revoke') setFloor(id, false);
  else if (btn.dataset.act === 'kick') kick(id);
});

ui.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!S?.active) return;
  const text = ui.chatInput.value.trim().slice(0, 500);
  if (!text) return;
  const msg = { id: uid(), from: S.selfId, name: S.name, role: S.role, text, ts: Date.now() };
  if (S.role === 'teacher') {
    pushHistory(msg);
    broadcast({ t: 'chat', msg });
  } else if (!S.welcomed || !send(teacherLink(), { t: 'chat', id: msg.id, text })) {
    toast('Mesaj gönderilemedi. Öğretmen bağlantısı bekleniyor.', { tone: 'danger' });
    return;
  }
  renderChatItem(msg);
  ui.chatInput.value = '';
});

ui.fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  if (ui.stage.requestFullscreen) ui.stage.requestFullscreen().catch(() => {});
  else if (ui.mainVideo.webkitEnterFullscreen && ui.mainVideo.srcObject) ui.mainVideo.webkitEnterFullscreen();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ui.notice.hidden) ui.noticeActions.firstElementChild?.click();
});

window.addEventListener('pagehide', () => {
  if (S?.active) {
    try { S.peer?.destroy(); } catch {}
  }
});

setInterval(heartbeat, 5000);
setInterval(tickElapsed, 1000);
setInterval(tickMeters, 200);

(function initLobby() {
  const params = new URLSearchParams(location.search);
  const room = slug(params.get('oda') || '');
  const name = store.get('cd-name');
  if (name) ui.nameInput.value = name;
  if (room) {
    ui.roomInput.value = room;
    setRole(store.get('cd-last', true) === `teacher:${room}` ? 'teacher' : 'student');
  } else if (store.get('cd-role') === 'teacher') {
    setRole('teacher');
  }
  updateLobby();
})();
