"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8900;
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let file = req.url.split("?")[0];
  if (file === "/") file = "/platform.html";
  const fp = path.join(ROOT, path.normalize(decodeURIComponent(file)).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`platform server on http://localhost:${PORT}`));
