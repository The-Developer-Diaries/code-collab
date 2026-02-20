var PEER_PREFIX = 'codecollab-';
var JOIN_TIMEOUT_MS = 8000;
var LANG_EXTENSIONS = {
'javascript': 'js', 'text/typescript': 'ts', 'python': 'py',
'htmlmixed': 'html', 'css': 'css', 'text/x-java': 'java',
'text/x-csrc': 'c', 'text/x-c++src': 'cpp', 'text/x-csharp': 'cs',
'go': 'go', 'rust': 'rs', 'sql': 'sql', 'shell': 'sh',
'php': 'php', 'ruby': 'rb', 'markdown': 'md', 'xml': 'xml',
'yaml': 'yaml', 'application/json': 'json', 'text/plain': 'txt'
};
var peer = null;
var connections = [];
var isHost = false;
var roomId = null;
var suppressChange = false;
// ─── Editor ───
var editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
mode: 'javascript',
theme: 'material-darker',
lineNumbers: true,
lineWrapping: true,
tabSize: 4,
indentWithTabs: false,
indentUnit: 4,
matchBrackets: true,
autoCloseBrackets: true,
styleActiveLine: { nonEmpty: true },
scrollbarStyle: 'native'
});
editor.on('cursorActivity', function () {
var pos = editor.getCursor();
document.getElementById('cursorPos').textContent =
'Ln ' + (pos.line + 1) + ', Col ' + (pos.ch + 1);
});
var changeTimeout = null;
editor.on('change', function () {
if (suppressChange) return;
clearTimeout(changeTimeout);
changeTimeout = setTimeout(function () {
var msg = { type: 'code', content: editor.getValue() };
if (isHost) {
broadcast(msg);
} else if (connections[0] && connections[0].open) {
connections[0].send(msg);
}
}, 50);
});
// ─── Room Management ───
function generateRoomId() {
var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
var id = '';
for (var i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
return id;
}
function extractRoomId(input) {
try {
var url = new URL(input);
var room = url.searchParams.get('room');
if (room) return room.replace(/[^a-zA-Z0–9]/g, '').toLowerCase();
} catch (e) {}
return input.replace(/[^a-zA-Z0–9]/g, '').toLowerCase();
}
function enterRoom() {
var url = new URL(window.location);
url.searchParams.set('room', roomId);
window.history.replaceState({}, '', url);
document.getElementById('roomIdDisplay').textContent = roomId;
document.getElementById('welcomeOverlay').classList.add('hidden');
editor.focus();
}
function setRole(host) {
var badge = document.getElementById('roleBadge');
badge.textContent = host ? 'Host' : 'Guest';
badge.className = 'role-badge ' + (host ? 'host' : 'guest');
}
// ─── Create Room (become Host) ───
function createRoom() {
roomId = generateRoomId();
initAsHost();
}
function initAsHost() {
isHost = true;
setStatus('connecting');
peer = new Peer(PEER_PREFIX + roomId, { debug: 0 });
peer.on('open', function () {
enterRoom();
setStatus('connected');
setRole(true);
updateUserCount();
showToast('Room created - share the link to collaborate', 'success');
});
peer.on('connection', onGuestConnected);
peer.on('error', function (err) {
if (err.type === 'unavailable-id') {
showToast('Room ID taken, generating new one…', 'warning');
roomId = generateRoomId();
if (peer && !peer.destroyed) peer.destroy();
initAsHost();
} else {
setStatus('disconnected');
showToast('Connection error: ' + err.type, 'warning');
}
});
peer.on('disconnected', function () {
setStatus('connecting');
if (peer && !peer.destroyed) peer.reconnect();
});
}
function onGuestConnected(conn) {
conn.on('open', function () {
connections.push(conn);
conn.send({
type: 'init',
content: editor.getValue(),
language: document.getElementById('languageSelect').value
});
broadcastUserCount();
showToast('A user joined the room', 'info');
});
conn.on('data', function (msg) { onMessage(msg, conn); });
conn.on('close', function () {
connections = connections.filter(function (c) { return c !== conn; });
broadcastUserCount();
showToast('A user left the room', 'info');
});
conn.on('error', function () {
connections = connections.filter(function (c) { return c !== conn; });
});
}
// ─── Join Room (become Guest) ───
function joinRoom() {
var raw = document.getElementById('joinRoomInput').value.trim();
if (!raw) {
showToast('Please enter a room code or link', 'warning');
return;
}
roomId = extractRoomId(raw);
if (!roomId) {
showToast('Invalid room code', 'warning');
return;
}
initAsGuest();
}
function initAsGuest() {
isHost = false;
setStatus('connecting');
document.getElementById('roomIdDisplay').textContent = roomId;
document.getElementById('welcomeOverlay').classList.add('hidden');
peer = new Peer(undefined, { debug: 0 });
peer.on('open', function () {
connectToHost();
});
peer.on('error', function (err) {
if (err.type === 'peer-unavailable') {
showToast('Room is empty - you are now the host', 'info');
peer.destroy();
initAsHost();
} else {
setStatus('disconnected');
showToast('Connection error: ' + err.type, 'warning');
}
});
}
function connectToHost() {
var conn = peer.connect(PEER_PREFIX + roomId);
var timeout = setTimeout(function () {
if (!conn.open) {
showToast('Timed out - you are now the host', 'info');
conn.close();
peer.destroy();
initAsHost();
}
}, JOIN_TIMEOUT_MS);
conn.on('open', function () {
clearTimeout(timeout);
connections = [conn];
enterRoom();
setStatus('connected');
setRole(false);
showToast('Connected to room', 'success');
});
conn.on('data', function (msg) { onMessage(msg, conn); });
conn.on('close', function () {
connections = [];
setStatus('disconnected');
showToast('Host disconnected', 'warning');
});
conn.on('error', function () {
clearTimeout(timeout);
setStatus('disconnected');
});
}
// ─── Message Handling ───
function onMessage(msg, fromConn) {
switch (msg.type) {
case 'init':
suppressChange = true;
editor.setValue(msg.content || '');
suppressChange = false;
if (msg.language) {
document.getElementById('languageSelect').value = msg.language;
editor.setOption('mode', msg.language);
}
break;
case 'code':
suppressChange = true;
var cursor = editor.getCursor();
var scroll = editor.getScrollInfo();
editor.setValue(msg.content);
editor.setCursor(cursor);
editor.scrollTo(scroll.left, scroll.top);
suppressChange = false;
if (isHost) broadcast(msg, fromConn);
break;
case 'language':
document.getElementById('languageSelect').value = msg.language;
editor.setOption('mode', msg.language);
if (isHost) broadcast(msg, fromConn);
break;
case 'users':
document.getElementById('userCount').textContent = msg.count;
break;
}
}
// ─── Broadcasting ───
function broadcast(msg, exclude) {
for (var i = 0; i < connections.length; i++) {
var conn = connections[i];
if (conn !== exclude && conn.open) {
try { conn.send(msg); } catch (e) {}
}
}
}
function broadcastUserCount() {
var count = connections.length + 1;
document.getElementById('userCount').textContent = count;
broadcast({ type: 'users', count: count });
}
function updateUserCount() {
document.getElementById('userCount').textContent = connections.length + 1;
}
// ─── UI Actions ───
function setStatus(state) {
var dot = document.getElementById('statusDot');
var text = document.getElementById('statusText');
dot.className = 'status-indicator ' + state;
var labels = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected' };
text.textContent = labels[state] || state;
}
function changeLanguage() {
var lang = document.getElementById('languageSelect').value;
editor.setOption('mode', lang);
var msg = { type: 'language', language: lang };
if (isHost) {
broadcast(msg);
} else if (connections[0] && connections[0].open) {
connections[0].send(msg);
}
}
function copyLink() {
var url = location.origin + location.pathname + '?room=' + roomId;
navigator.clipboard.writeText(url).then(function () {
showToast('Link copied to clipboard', 'success');
}).catch(function () {
var el = document.createElement('textarea');
el.value = url;
document.body.appendChild(el);
el.select();
document.execCommand('copy');
document.body.removeChild(el);
showToast('Link copied to clipboard', 'success');
});
}
function downloadCode() {
var lang = document.getElementById('languageSelect').value;
var ext = LANG_EXTENSIONS[lang] || 'txt';
var blob = new Blob([editor.getValue()], { type: 'text/plain' });
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'code-collab.' + ext;
a.click();
URL.revokeObjectURL(a.href);
showToast('File downloaded', 'success');
}
function showToast(message, type) {
var container = document.getElementById('toastContainer');
var toast = document.createElement('div');
toast.className = 'toast ' + (type || 'info');
toast.textContent = message;
container.appendChild(toast);
setTimeout(function () { toast.remove(); }, 3000);
}
// ─── Cleanup ───
window.addEventListener('beforeunload', function () {
if (peer && !peer.destroyed) peer.destroy();
});
// ─── Init ───
(function init() {
var params = new URLSearchParams(location.search);
var existing = params.get('room');
if (existing) {
roomId = existing;
initAsGuest();
}
document.getElementById('joinRoomInput').addEventListener('keydown', function (e) {
if (e.key === 'Enter') joinRoom();
});
})();