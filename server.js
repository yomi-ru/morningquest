const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "MorningQuestPrototype/1.0" } }, (upstream) => {
      let body = "";

      upstream.setEncoding("utf8");
      upstream.on("data", (chunk) => {
        body += chunk;
      });
      upstream.on("end", () => {
        if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
          reject(new Error(`Google Calendar returned HTTP ${upstream.statusCode}`));
          return;
        }
        resolve(body);
      });
    });

    request.on("error", reject);
    request.setTimeout(10000, () => {
      request.destroy(new Error("Google Calendar request timed out"));
    });
  });
}

function isAllowedCalendarUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "calendar.google.com" && url.pathname.startsWith("/calendar/ical/");
  } catch {
    return false;
  }
}

async function handleCalendarProxy(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const targetUrl = requestUrl.searchParams.get("url");

  if (!targetUrl || !isAllowedCalendarUrl(targetUrl)) {
    send(response, 400, "Invalid calendar URL", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const body = await fetchText(targetUrl);
    send(response, 200, body, {
      "Cache-Control": "no-store",
      "Content-Type": "text/calendar; charset=utf-8",
    });
  } catch (error) {
    send(response, 502, error.message, { "Content-Type": "text/plain; charset=utf-8" });
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    send(response, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    send(response, 200, body, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
  });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/calendar")) {
    handleCalendarProxy(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Morning Quest prototype: http://localhost:${PORT}`);
});
