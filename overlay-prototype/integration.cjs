'use strict';
// Integration v1: bounded, authenticated NDJSON over IPv4 loopback only.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const PRIORITY = Object.freeze({idle:0, active:1, notification:2, speaking:3, thinking:4, scanning:5, error:6});
const MAX_BYTES = 4096;
const LEASE_MS = 4000;
const COMMANDS = Object.freeze(['ask_ai','ask_region','open_documents','open_settings']);
const ERRORS = Object.freeze(['unavailable','busy','invalid','failed','timeout','disconnected','duplicate']);
const validId = id => Number.isInteger(id) && id > 0 && id <= 2147483647;
function endpointPath() {
  return process.env.NOVA_OVERLAY_ENDPOINT || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'UniversityAI', 'nova-overlay.json');
}
function equalSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
    Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function validPacket(p) {
  if (!p || Array.isArray(p) || p.v !== 1 || typeof p.token !== 'string') return false;
  const keys = {state:['v','op','token','state','message'], shutdown:['v','op','token','owner'],
    register_commands:['v','op','token','commands'], command_result:['v','op','token','request_id','command','ok','error']}[p.op];
  if (!Array.isArray(keys) || Object.keys(p).some(k => !keys.includes(k))) return false;
  if (p.op === 'register_commands') return Array.isArray(p.commands) && p.commands.length <= COMMANDS.length &&
    new Set(p.commands).size === p.commands.length && p.commands.every(c => COMMANDS.includes(c));
  if (p.op === 'command_result') return validId(p.request_id) && COMMANDS.includes(p.command) &&
    (p.ok === true ? p.error === undefined : p.ok === false && ERRORS.includes(p.error));
  if (p.op === 'shutdown') return p.owner === null || (typeof p.owner === 'string' && /^[a-f0-9]{64}$/.test(p.owner));
  return Object.hasOwn(PRIORITY, p.state) && typeof p.state === 'string' &&
    (p.message === undefined || (typeof p.message === 'string' && p.message.length <= 512));
}
async function startIntegration({file = endpointPath(), onState = () => {}, onCommands = () => {}, onShutdown = () => {}, owner = process.env.NOVA_OVERLAY_OWNER_TOKEN || null, leaseMs = LEASE_MS, commandTimeoutMs = 4000} = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const peers = new Map();
  let current = 'idle', closed = false;
  let available = [], pending = null, lastCommand = -Infinity;
  function commandPeers() { return [...peers.entries()].filter(([, p]) => p.commands && Date.now() - p.seen < leaseMs); }
  function settle(error) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const {resolve} = pending; pending = null;
    resolve(error ? {ok:false,error} : {ok:true});
  }
  function publish() {
    let next = 'idle';
    for (const peer of peers.values()) {
      if (Date.now() - peer.seen < leaseMs && PRIORITY[peer.state] > PRIORITY[next]) next = peer.state;
    }
    if (next !== current) { current = next; onState(next); }
    const candidates = commandPeers();
    const commands = candidates.length === 1 ? candidates[0][1].commands : [];
    if (JSON.stringify(commands) !== JSON.stringify(available)) { available = commands; onCommands([...available]); }
    if (pending && (!peers.has(pending.socket) || candidates.length !== 1 || candidates[0][0] !== pending.socket)) settle('disconnected');
  }
  const server = net.createServer(socket => {
    if (peers.size >= 16) { socket.destroy(); return; }
    const peer = {state:'idle', seen:0, buffer:Buffer.alloc(0), commands:null, sequence:0};
    peers.set(socket, peer);
    socket.setTimeout(leaseMs + 1000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('close', () => { peers.delete(socket); publish(); });
    socket.on('data', chunk => {
      peer.buffer = Buffer.concat([peer.buffer, chunk]);
      if (peer.buffer.length > MAX_BYTES) { socket.destroy(); return; }
      let index;
      while ((index = peer.buffer.indexOf(10)) !== -1) {
        const line = peer.buffer.subarray(0, index); peer.buffer = peer.buffer.subarray(index + 1);
        let packet;
        try { packet = JSON.parse(line.toString('utf8')); } catch { socket.destroy(); return; }
        if (!validPacket(packet) || !equalSecret(packet.token, token)) { socket.destroy(); return; }
        if (packet.op === 'shutdown') {
          peer.state = 'idle'; peer.commands = null; publish();
          const terminate = owner !== null && equalSecret(packet.owner, owner);
          socket.end(JSON.stringify({v:1, ok:true}) + '\n', () => { if (terminate) onShutdown(); });
          return;
        }
        if (packet.op === 'state') peer.state = packet.state;
        else if (packet.op === 'register_commands') peer.commands = packet.commands;
        else if (packet.op === 'command_result') {
          if (pending && pending.socket === socket && pending.id === packet.request_id && pending.command === packet.command) settle(packet.ok ? null : packet.error);
        }
        peer.seen = Date.now(); publish();
        if (!socket.write('{"v":1,"ok":true}\n')) { socket.destroy(); return; }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  server.on('error', error => console.error('NOVA local IPC unavailable:', error.code));
  const timer = setInterval(publish, Math.min(500, leaseMs)); timer.unref();
  const descriptor = {v:1, port:server.address().port, token, capabilities:['commands-v1']};
  try {
    fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
    fs.writeFileSync(file, JSON.stringify(descriptor), {mode:0o600});
  } catch (error) {
    clearInterval(timer); server.close(); throw error;
  }
  return {
    descriptor,
    requestCommand(command) {
      if (!COMMANDS.includes(command)) return Promise.resolve({ok:false,error:'invalid'});
      publish();
      const candidates = commandPeers();
      if (closed || candidates.length !== 1 || !available.includes(command)) return Promise.resolve({ok:false,error:'unavailable'});
      if (pending || Date.now() - lastCommand < 400) return Promise.resolve({ok:false,error:'busy'});
      const [socket, peer] = candidates[0];
      if (!validId(peer.sequence + 1)) { socket.destroy(); return Promise.resolve({ok:false,error:'unavailable'}); }
      const id = ++peer.sequence; lastCommand = Date.now();
      return new Promise(resolve => {
        pending = {socket,id,command,resolve,timer:setTimeout(() => {settle('timeout');socket.destroy();},commandTimeoutMs)};
        // Intents have no retry queue. A disconnect makes this result uncertain.
        if (!socket.write(JSON.stringify({v:1,op:'command',token,request_id:id,command}) + '\n')) { settle('disconnected'); socket.destroy(); }
      });
    },
    close() {
      if (closed) return; closed = true; clearInterval(timer);
      settle('disconnected');
      for (const socket of peers.keys()) socket.destroy();
      server.close();
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file); } catch {}
    }
  };
}
module.exports = {startIntegration, validPacket, PRIORITY, endpointPath, COMMANDS, ERRORS};
