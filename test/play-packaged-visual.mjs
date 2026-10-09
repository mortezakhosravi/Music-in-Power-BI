import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const visualGuid = "songPlayerED067EDB172C4618852C870330D69695";

const pbiviz = await readFile(new URL("../dist/songPlayer.pbiviz", import.meta.url));
const resource = JSON.parse(readZipEntry(pbiviz, `resources/${visualGuid}.pbiviz.json`).toString("utf8"));
const root = await mkdtemp(join(tmpdir(), "song-player-"));
const toneA = join(root, "a.wav");
const toneB = join(root, "b.wav");
await writeFile(toneA, wav(440, 0.35));
await writeFile(toneB, wav(880, 0.35));
await writeFile(join(root, "visual.js"), resource.content.js);
await writeFile(join(root, "visual.css"), resource.content.css);
await writeFile(join(root, "harness.html"), harness());

const server = createServer(async (request, response) => {
    const file = new URL(request.url ?? "/", "http://127.0.0.1").pathname.slice(1) || "harness.html";
    const path = join(root, file);
    try {
        const body = await readFile(path);
        response.writeHead(200, { "content-type": contentType(file) });
        response.end(body);
    }
    catch {
        response.writeHead(404);
        response.end();
    }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const chrome = spawn("google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1400,1200",
    "--remote-debugging-port=9333",
    "--user-data-dir=" + join(root, "chrome"),
    `http://127.0.0.1:${port}/harness.html`
], { stdio: ["ignore", "pipe", "pipe"] });

let debuggerUrl = "";
chrome.stderr.setEncoding("utf8");
chrome.stderr.on("data", (chunk) => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
        debuggerUrl = match[1];
    }
});

try {
    const pageSocket = await waitForPageSocket(chrome);
    const result = await drive(pageSocket, port);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
        process.exitCode = 1;
    }
}
finally {
    chrome.kill("SIGKILL");
    await new Promise((resolve) => {
        if (chrome.exitCode !== null) {
            resolve();
            return;
        }
        chrome.once("exit", resolve);
    });
    server.close();
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            await rm(root, { recursive: true, force: true });
            break;
        }
        catch {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
}

function harness() {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="visual.css">
  <style>
    body { margin: 0; background: #f4f4f5; font-family: sans-serif; }
    #host { width: 320px; height: 240px; margin: 24px; background: transparent; }
  </style>
</head>
<body>
  <div id="host"></div>
  <script>window.powerbi = {};</script>
  <script src="visual.js"></script>
  <script>
    const plugin = window.powerbi.visuals.plugins["${visualGuid}"];
    const host = document.getElementById("host");
    const failures = [];
    const visual = plugin.create({
      element: host,
      host: {
        eventService: {
          renderingStarted() {},
          renderingFinished() {},
          renderingFailed(_options, message) { failures.push(String(message)); }
        }
      }
    });
    const button = () => host.querySelector(".song-player__button--main");
    const audio = () => host.querySelector("audio");
    const dataView = (urls, color, playback) => {
      const objects = {};
      if (color) objects.circle = { color: { solid: { color } } };
      if (playback) objects.playback = playback;
      return {
        metadata: {
          columns: [{ roles: { url: true } }],
          objects: Object.keys(objects).length ? objects : undefined
        },
        categorical: {
          categories: [{
            source: { roles: { url: true }, displayName: "Song URL" },
            values: urls
          }]
        }
      };
    };
    window.render = (urls, color) => {
      window.lastUrls = urls;
      visual.update({
        viewport: { width: host.clientWidth, height: host.clientHeight },
        dataViews: [dataView(urls, color)]
      });
    };
    window.resizeTo = (width, height) => {
      host.style.width = width + "px";
      host.style.height = height + "px";
      visual.update({
        type: 4,
        viewport: { width, height },
        dataViews: [{ metadata: {} }]
      });
      return window.state();
    };
    window.showKeys = (width, height) => {
      host.style.width = width + "px";
      host.style.height = height + "px";
      visual.update({
        viewport: { width, height },
        dataViews: [dataView(window.lastUrls, "#18181b", { extraButtons: true })]
      });
      return window.transport();
    };
    window.transport = () => {
      const hostRect = host.getBoundingClientRect();
      const sides = ["previous", "next", "stop"].map((name) => host.querySelector(".song-player__button--" + name));
      const visible = sides.filter((item) => getComputedStyle(item).display !== "none");
      const boxes = [button(), ...visible].map((item) => item.getBoundingClientRect());
      return {
        visible: visible.length,
        direction: host.querySelector(".song-player__controls").classList.contains("is-column") ? "column" : "row",
        main: Math.round(button().getBoundingClientRect().width),
        side: visible.length ? Math.round(visible[0].getBoundingClientRect().width) : 0,
        labels: sides.map((item) => item.getAttribute("aria-label")).join(","),
        inside: boxes.every((box) => box.width > 0 && box.left >= hostRect.left - 1 && box.right <= hostRect.right + 1 && box.top >= hostRect.top - 1 && box.bottom <= hostRect.bottom + 1)
      };
    };
    window.bootAutoplay = (first, second) => {
      const box = document.createElement("div");
      box.id = "auto-host";
      box.style.cssText = "width:180px;height:180px";
      document.body.append(box);
      const autoVisual = plugin.create({
        element: box,
        host: {
          eventService: {
            renderingStarted() {},
            renderingFinished() {},
            renderingFailed(_options, message) { failures.push(String(message)); }
          }
        }
      });
      autoVisual.update({
        viewport: { width: 180, height: 180 },
        dataViews: [dataView([first, second], "#18181b", { autoplay: true })]
      });
    };
    window.keepSongs = (color) => {
      visual.update({
        type: 16,
        viewport: { width: 320, height: 240 },
        dataViews: [{
          metadata: {
            objects: color ? { circle: { color: { solid: { color } } } } : undefined
          }
        }]
      });
      return window.state();
    };
    window.state = () => {
      const circle = host.querySelector("circle");
      const formatting = JSON.stringify(visual.getFormattingModel());
      const player = host.querySelector(".song-player");
      return {
        failures,
        label: button().getAttribute("aria-label"),
        pressed: button().getAttribute("aria-pressed"),
        disabled: button().disabled,
        fill: circle ? circle.getAttribute("fill") : "",
        ink: getComputedStyle(host.querySelector(".song-player__button--main .song-player__glyph-shape")).fill,
        width: button().style.width,
        height: button().style.height,
        shape: circle ? circle.tagName : "",
        buttonBackground: getComputedStyle(button()).backgroundColor,
        frameBackground: player ? getComputedStyle(player).backgroundColor : "",
        shadow: getComputedStyle(button()).boxShadow,
        colorInFormatPane: formatting.includes("circle") && formatting.includes("Color") && formatting.includes("Auto play") && formatting.includes("Previous, next, and stop"),
        musicHidden: getComputedStyle(host.querySelector(".song-player__button--main .song-player__glyph--music")).display === "none",
        muteHidden: getComputedStyle(host.querySelector(".song-player__button--main .song-player__glyph--mute")).display === "none",
        extraHidden: getComputedStyle(host.querySelector(".song-player__button--stop")).display === "none",
        paused: audio().paused,
        time: audio().currentTime,
        src: audio().currentSrc || audio().src || ""
      };
    };
  </script>
</body>
</html>`;
}

async function drive(webSocketUrl, port) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve);
        socket.addEventListener("error", reject);
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
    });
    const send = (method, params = {}) => new Promise((resolve) => {
        const messageId = ++id;
        pending.set(messageId, resolve);
        socket.send(JSON.stringify({ id: messageId, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    await waitForFunction(send, "typeof window.state === 'function'");

    const empty = await evaluate(send, `window.render([], undefined); window.state()`);
    const colored = await evaluate(send, `window.render(["http://127.0.0.1:${port}/a.wav","http://127.0.0.1:${port}/b.wav"], "#f8fafc"); window.state()`);
    const forced = await evaluate(send, `(() => { const style = document.createElement("style"); style.textContent = "path{fill:rgb(255,0,0)!important}"; document.head.append(style); return window.state(); })()`);
    const blue = await evaluate(send, `window.render(["http://127.0.0.1:${port}/a.wav","http://127.0.0.1:${port}/b.wav"], "#2563eb"); window.state()`);
    await clickButton(send);
    const playing = await waitForFunction(send, `window.state().label === "Pause" && window.state().paused === false`);
    const advanced = await waitForFunction(send, `window.state().src.includes("/b.wav")`);
    const kept = await evaluate(send, `window.keepSongs("#facc15")`);
    await clickButton(send);
    const paused = await waitForFunction(send, `window.state().label === "Play" && window.state().paused === true`);
    const wide = await evaluate(send, `window.resizeTo(500, 80)`);
    const tall = await evaluate(send, `window.resizeTo(70, 360)`);
    const row = await evaluate(send, `window.showKeys(640, 150)`);
    const column = await evaluate(send, `window.showKeys(150, 640)`);
    const beforeSkip = await evaluate(send, `window.state().src`);
    await clickControl(send, ".song-player__button--next");
    const skipped = await waitForFunction(send, `window.state().src && window.state().src !== ${JSON.stringify(beforeSkip)} && window.state().paused === true`);
    await clickControl(send, ".song-player__button--stop");
    const stopped = await waitForFunction(send, `window.state().paused === true && window.state().time === 0 && window.state().label === "Play"`);
    await evaluate(send, `window.bootAutoplay("http://127.0.0.1:${port}/a.wav","http://127.0.0.1:${port}/b.wav")`);
    const started = await waitForValue(send, `(() => { const box = document.querySelector("#auto-host"); if (!box) return null; const song = box.querySelector("audio"); const music = box.querySelector(".song-player__glyph--music"); if (!song || song.paused || !music || getComputedStyle(music).display === "none") return null; return { paused: song.paused, music: getComputedStyle(music).display }; })()`);
    socket.close();

    const checks = {
        emptyDisabled: empty.disabled === true && empty.label === "Play",
        colorApplied: colored.fill === "#f8fafc" && colored.ink === "rgb(24, 24, 27)",
        iconSurvivesHostFill: forced.ink === "rgb(24, 24, 27)" && forced.fill === "#f8fafc",
        blueIconIsWhite: blue.fill === "#2563eb" && blue.ink === "rgb(255, 255, 255)",
        styleUpdateKeepsSongs: kept.disabled === false && kept.fill === "#facc15" && kept.ink === "rgb(24, 24, 27)" && kept.src.includes("/b.wav") && kept.paused === false,
        sized: colored.width === "240px" && colored.height === "240px" && colored.extraHidden === true,
        respondsToWidth: wide.width === "80px" && wide.height === "80px" && wide.extraHidden === true,
        respondsToHeight: tall.width === "70px" && tall.height === "70px",
        circleOnly: colored.shape === "circle" && colored.buttonBackground === "rgba(0, 0, 0, 0)" && colored.frameBackground === "rgba(0, 0, 0, 0)" && colored.shadow === "none",
        colorInFormatPane: colored.colorInFormatPane === true,
        noRenderFailure: colored.failures.length === 0,
        played: playing.label === "Pause" && playing.paused === false && playing.musicHidden === false && playing.muteHidden === true,
        advancedToNextSong: advanced.src.includes("/b.wav"),
        paused: paused.label === "Play" && paused.paused === true && paused.musicHidden === true && paused.muteHidden === false,
        rowFits: row.visible === 3 && row.direction === "row" && row.inside === true && row.main >= row.side && row.labels === "Previous,Next,Stop",
        columnFits: column.visible === 3 && column.direction === "column" && column.inside === true && column.main >= column.side,
        nextSkips: skipped.src !== beforeSkip && skipped.paused === true,
        stopped: stopped.paused === true && stopped.time === 0 && stopped.musicHidden === true && stopped.muteHidden === false,
        autoplayOnLoad: started.paused === false && started.music !== "none"
    };
    return { ok: Object.values(checks).every(Boolean), checks, empty, colored, forced, blue, playing, advanced, kept, paused, wide, tall, row, column, skipped, stopped, started };
}

async function waitForValue(send, expression) {
    const started = Date.now();
    let latest;
    while (Date.now() - started < 8000) {
        try {
            latest = await evaluate(send, expression);
            if (latest) {
                return latest;
            }
        }
        catch {
            // The page is still loading.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expression}. Last: ${JSON.stringify(latest)}`);
}

async function evaluate(send, expression) {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (response.result.exceptionDetails) {
        throw new Error(JSON.stringify(response.result.exceptionDetails));
    }
    return response.result.result.value;
}

async function clickButton(send) {
    await clickControl(send, ".song-player__button--main");
}

async function clickControl(send, selector) {
    const point = await evaluate(send, `(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function waitForFunction(send, expression) {
    const started = Date.now();
    let latest;
    while (Date.now() - started < 8000) {
        try {
            if (expression.startsWith("typeof")) {
                if (await evaluate(send, expression) === true) {
                    return true;
                }
            }
            else {
                latest = await evaluate(send, `(${expression}) ? window.state() : null`);
                if (latest) {
                    return latest;
                }
            }
        }
        catch {
            // The page is still loading.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expression}. Last: ${JSON.stringify(latest)}`);
}

async function waitForPageSocket(chrome) {
    const started = Date.now();
    while (Date.now() - started < 15000) {
        if (chrome.exitCode !== null) {
            throw new Error("Chrome exited before DevTools was ready");
        }
        try {
            const pages = await fetch("http://127.0.0.1:9333/json/list").then((response) => response.json());
            const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
            if (page) {
                return page.webSocketDebuggerUrl;
            }
        }
        catch {
            // Chrome is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for Chrome");
}

function contentType(file) {
    if (file.endsWith(".js")) return "text/javascript";
    if (file.endsWith(".css")) return "text/css";
    if (file.endsWith(".wav")) return "audio/wav";
    return "text/html";
}

function wav(frequency, seconds) {
    const sampleRate = 8000;
    const samples = Math.floor(sampleRate * seconds);
    const data = Buffer.alloc(samples * 2);
    for (let index = 0; index < samples; index++) {
        const envelope = Math.min(1, index / 200, (samples - index) / 200);
        const value = Math.sin(2 * Math.PI * frequency * index / sampleRate) * envelope * 0.4;
        data.writeInt16LE(Math.round(value * 32767), index * 2);
    }
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

function readZipEntry(buffer, name) {
    let offset = 0;
    while (offset + 30 < buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) {
            break;
        }
        const method = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const nameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const entryName = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
        const start = offset + 30 + nameLength + extraLength;
        const compressed = buffer.subarray(start, start + compressedSize);
        if (entryName === name) {
            if (method === 0) return compressed;
            if (method === 8) return inflateRawSync(compressed);
            throw new Error(`Unsupported zip method ${method}`);
        }
        offset = start + compressedSize;
    }
    throw new Error(`Missing ${name}`);
}
