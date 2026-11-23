#!/usr/bin/env node
/*
 * ADHdeer sync server — zero dependencies, Node 18+.
 *
 * A tiny private sync server for the ADHdeer planner app. Users sign in with
 * a plain username + password (hashed with scrypt); each user's planner lives
 * in one JSON file under data/. Bearer tokens are HMAC-signed and expire
 * after 180 days.
 *
 * Run:        node adhdeer-server.js          (PORT env var, default 8787)
 * Or Docker:  see Dockerfile in this folder.
 */
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = path.join(__dirname, "data");
const KEY_FILE = path.join(DATA_DIR, "secret.key");
const TOKEN_DAYS = 180;
const MAX_BODY = 2 * 1024 * 1024; // 2 MB — a planner backup is a few KB

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSecret() {
  try {
    const s = fs.readFileSync(KEY_FILE, "utf8").trim();
    if (s) return s;
  } catch (e) {}
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(KEY_FILE, s + "\n", { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

function userFile(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(DATA_DIR, safe + ".json");
}
function readUser(name) {
  try { return JSON.parse(fs.readFileSync(userFile(name), "utf8")); }
  catch (e) { return null; }
}
function writeUser(rec) {
  fs.writeFileSync(userFile(rec.user), JSON.stringify(rec, null, 2), { mode: 0o600 });
}

function scryptHash(pass) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(pass, salt, 64, (err, key) =>
      err ? reject(err) : resolve({ salt: salt.toString("hex"), hash: key.toString("hex") }));
  });
}
function scryptVerify(pass, saltHex, hashHex) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pass, Buffer.from(saltHex, "hex"), 64, (err, key) =>
      err ? reject(err) : resolve(key.toString("hex") === hashHex));
  });
}

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, t: Date.now() })).toString("base64url");
  return payload + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}
function checkToken(token) {
  if (typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const want = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let d;
  try { d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch (e) { return null; }
  if (!d || !d.u || !d.t) return null;
  if (Date.now() - d.t > TOKEN_DAYS * 24 * 3600 * 1000) return null;
  return d.u;
}

const COMMON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({}, COMMON_HEADERS, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  }));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const USER_RE = /^[a-zA-Z0-9._-]{1,32}$/;

// Optional invite code: set INVITE_CODE (e.g. -e INVITE_CODE=share-the-cheese)
// to require it on /api/register; unset means anyone may sign up.
const INVITE_CODE = String(process.env.INVITE_CODE || "").trim();

// Simple per-client throttle for sign-in / sign-up attempts (memory only).
const attempts = new Map();
let lastSweep = Date.now();
function clientIp(req) {
  return String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?").split(",")[0].trim();
}
function tooFast(req, max, windowMs) {
  const now = Date.now();
  if (now - lastSweep > 300000) {
    lastSweep = now;
    for (const [k, arr] of attempts) {
      const alive = arr.filter(t => now - t < windowMs);
      if (alive.length) attempts.set(k, alive); else attempts.delete(k);
    }
  }
  const ip = clientIp(req);
  const arr = (attempts.get(ip) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { attempts.set(ip, arr); return true; }
  arr.push(now);
  attempts.set(ip, arr);
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, COMMON_HEADERS);
      return res.end();
    }

    if (req.method === "GET" && (url === "/" || url === "/healthz")) {
      return send(res, 200, { ok: true, app: "ADHdeer sync server", endpoints: ["/api/register", "/api/login", "/api/data"] });
    }

    if (req.method === "POST" && (url === "/api/register" || url === "/api/login")) {
      let body;
      try { body = JSON.parse(await readBody(req, MAX_BODY) || "{}"); }
      catch (e) { return send(res, 400, { error: "Bad JSON body" }); }
      if (tooFast(req, 10, 600000)) return send(res, 429, { error: "Too many attempts - wait a few minutes and try again.", code: "slow-down" });
      const user = String(body.user || "").trim(), pass = String(body.pass || "");
      if (!USER_RE.test(user)) return send(res, 400, { error: "Usernames can use letters, numbers, dots, dashes and underscores." });
      if (pass.length < 6) return send(res, 400, { error: "Passwords need at least 6 characters." });
      const existing = readUser(user);

      if (url === "/api/register") {
        if (existing) return send(res, 409, { error: "That name is already taken.", code: "taken" });
        if (INVITE_CODE && String(body.invite || "").trim() !== INVITE_CODE)
          return send(res, 403, { error: "This server needs an invite code to make an account.", code: "invite-failed" });
        const { salt, hash } = await scryptHash(pass);
        writeUser({ user, salt, hash, data: null, savedAt: null });
        return send(res, 200, { token: issueToken(user) });
      }

      if (!existing) return send(res, 404, { error: "No account with that name yet.", code: "no-user" });
      const ok = await scryptVerify(pass, existing.salt, existing.hash);
      if (!ok) return send(res, 401, { error: "Wrong password.", code: "bad-pass" });
      return send(res, 200, { token: issueToken(user) });
    }

    if ((req.method === "GET" || req.method === "PUT") && url === "/api/data") {
      const auth = String(req.headers["authorization"] || "");
      if (!/^Bearer /.test(auth)) return send(res, 401, { error: "Sign in first.", code: "no-token" });
      const user = checkToken(auth.slice(7).trim());
      const rec = user && readUser(user);
      if (!user || !rec) return send(res, 401, { error: "Your sign-in is not valid any more \u2014 sign in again.", code: "bad-token" });

      if (req.method === "GET") {
        if (!rec.data) return send(res, 404, { error: "Nothing saved on your account yet.", code: "empty" });
        return send(res, 200, rec.data);
      }

      let body;
      try { body = JSON.parse(await readBody(req, MAX_BODY) || "{}"); }
      catch (e) { return send(res, 400, { error: "Bad JSON body" }); }
      if (typeof body.planner !== "string" || !body.planner) {
        return send(res, 400, { error: "That doesn't look like an ADHdeer planner." });
      }
      rec.data = {
        planner: body.planner,
        habits: typeof body.habits === "string" ? body.habits : "[]",
        theme: typeof body.theme === "string" ? body.theme : undefined,
        device: typeof body.device === "string" ? body.device : undefined,
        savedAt: new Date().toISOString(),
      };
      writeUser(rec);
      return send(res, 200, { ok: true, savedAt: rec.data.savedAt });
    }

    return send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(new Date().toISOString(), req.method, url, e.message);
    return send(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log("ADHdeer sync server listening on port " + PORT + " (data in " + DATA_DIR + ")");
});
