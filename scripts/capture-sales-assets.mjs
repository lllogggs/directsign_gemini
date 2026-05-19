import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const baseUrl = process.env.SALES_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = path.join(root, "docs", "sales", "assets");
const profileDir = path.join(
  root,
  ".tmp",
  `sales-chrome-profile-${Date.now()}`,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findBrowserExecutable = async () => {
  const configured = process.env.CHROME_PATH || process.env.BROWSER_PATH;
  const candidates = [
    configured,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"],
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"],
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : null,
    os.platform() === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : null,
    os.platform() === "linux" ? "google-chrome" : null,
    os.platform() === "linux" ? "chromium" : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      if (!path.isAbsolute(candidate)) return candidate;
    }
  }

  throw new Error("Chrome or Edge executable was not found");
};

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(
        typeof event.data === "string"
          ? event.data
          : Buffer.from(event.data).toString("utf8"),
      );
      if (!message.id || !this.pending.has(message.id)) return;

      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }

      resolve(message.result);
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("DevTools WebSocket connection timed out")),
        10000,
      );
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("DevTools WebSocket connection failed"));
      });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    this.socket?.close();
  }
}

const readDevToolsEndpoint = async () => {
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    try {
      const content = await fs.readFile(activePortFile, "utf8");
      const [port, webSocketPath] = content.trim().split(/\r?\n/);
      if (port && webSocketPath) {
        return `ws://127.0.0.1:${port}${webSocketPath}`;
      }
    } catch {
      // Chrome writes this file after the DevTools endpoint is ready.
    }
    await sleep(250);
  }

  throw new Error("DevTools endpoint was not published");
};

const openPage = async (client, url, viewport) => {
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
      mobile: Boolean(viewport.mobile),
    },
    sessionId,
  );
  await client.send(
    "Emulation.setTouchEmulationEnabled",
    { enabled: Boolean(viewport.mobile) },
    sessionId,
  );
  await client.send("Page.navigate", { url }, sessionId);

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await client.send(
      "Runtime.evaluate",
      {
        expression: `(() => ({
          ready: document.readyState,
          text: document.body?.innerText || "",
          height: document.documentElement.scrollHeight,
          hasViteError: Boolean(document.querySelector("vite-error-overlay"))
        }))()`,
        returnByValue: true,
      },
      sessionId,
    );
    const value = result.result?.value ?? {};
    if (
      value.ready === "complete" &&
      String(value.text).length > 120 &&
      !value.hasViteError
    ) {
      await client.send(
        "Runtime.evaluate",
        {
          expression:
            "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
      await sleep(500);
      return { targetId: target.targetId, sessionId };
    }
    await sleep(300);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const capturePng = async (client, page, fileName) => {
  const screenshot = await client.send(
    "Page.captureScreenshot",
    {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    },
    page.sessionId,
  );
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(screenshot.data, "base64"));
};

const printPdf = async (client, page, filePath) => {
  const pdf = await client.send(
    "Page.printToPDF",
    {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
    },
    page.sessionId,
  );
  await fs.writeFile(filePath, Buffer.from(pdf.data, "base64"));
};

const closePage = async (client, page) => {
  await client.send("Target.closeTarget", { targetId: page.targetId });
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(profileDir, { recursive: true });

const browserExecutable = await findBrowserExecutable();
const browserProcess = spawn(
  browserExecutable,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  },
);

let client;
try {
  const endpoint = await readDevToolsEndpoint();
  client = new CdpClient(endpoint);
  await client.connect();

  const advertiserPage = await openPage(
    client,
    `${baseUrl}/intro/advertiser`,
    { width: 1360, height: 850 },
  );
  await capturePng(client, advertiserPage, "yeollock-advertiser-screen.png");
  await closePage(client, advertiserPage);

  const influencerPage = await openPage(
    client,
    `${baseUrl}/intro/influencer`,
    { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
  );
  await capturePng(client, influencerPage, "yeollock-influencer-screen.png");
  await closePage(client, influencerPage);

  const advertiserDoc = await openPage(
    client,
    pathToFileURL(path.join(root, "docs", "sales", "advertiser-introduction.html")).href,
    { width: 1240, height: 900 },
  );
  await printPdf(
    client,
    advertiserDoc,
    path.join(root, "docs", "sales", "advertiser-introduction.pdf"),
  );
  await closePage(client, advertiserDoc);

  const influencerDoc = await openPage(
    client,
    pathToFileURL(path.join(root, "docs", "sales", "influencer-introduction.html")).href,
    { width: 1240, height: 900 },
  );
  await printPdf(
    client,
    influencerDoc,
    path.join(root, "docs", "sales", "influencer-introduction.pdf"),
  );
  await closePage(client, influencerDoc);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        outputs: [
          "docs/sales/assets/yeollock-advertiser-screen.png",
          "docs/sales/assets/yeollock-influencer-screen.png",
          "docs/sales/advertiser-introduction.pdf",
          "docs/sales/influencer-introduction.pdf",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  browserProcess.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1200);
    browserProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  try {
    await fs.rm(profileDir, { recursive: true, force: true });
  } catch {
    // Chrome can keep Crashpad files locked briefly on Windows. The next run uses a fresh profile.
  }
}
