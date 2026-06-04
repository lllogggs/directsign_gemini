import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const baseUrl = process.env.SALES_CAPTURE_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = path.join(root, "docs", "sales", "assets");
const captureAdvertiserEmail =
  process.env.SALES_CAPTURE_ADVERTISER_EMAIL ?? "breadroom.manager@yeollock.me";
const captureAdvertiserPassword =
  process.env.QA_TEST_PASSWORD ?? "YeollockTest!2026";
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
      }, 90000);
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
  const deadline = Date.now() + 45000;

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
      String(value.text).length > 40 &&
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

const printHtmlPdf = async (htmlPath, pdfPath) => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
  } finally {
    await browser.close();
  }
};

const closePage = async (client, page) => {
  await client.send("Target.closeTarget", { targetId: page.targetId });
};

const evaluate = async (client, page, expression) => {
  const result = await client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    page.sessionId,
  );

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "Browser evaluation failed",
    );
  }

  return result.result?.value;
};

const waitForBodyText = async (client, page, text, timeout = 15000) => {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const hasText = await evaluate(
      client,
      page,
      `document.body?.innerText.includes(${JSON.stringify(text)})`,
    );
    if (hasText) return;
    await sleep(300);
  }

  throw new Error(`Timed out waiting for text: ${text}`);
};

const loginAdvertiser = async (client) => {
  const page = await openPage(client, `${baseUrl}/login/advertiser`, {
    width: 1360,
    height: 850,
  });

  const loginResult = await evaluate(
    client,
    page,
    `fetch("/api/advertiser/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: ${JSON.stringify(captureAdvertiserEmail)},
        password: ${JSON.stringify(captureAdvertiserPassword)}
      })
    }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({}))
    }))`,
  );

  if (!loginResult?.ok || loginResult.body?.authenticated !== true) {
    throw new Error(`Advertiser capture login failed (${loginResult?.status ?? "unknown"})`);
  }

  return page;
};

const getSalesContractsForCapture = async (client, page) => {
  const contracts = await evaluate(
    client,
    page,
    `fetch("/api/contracts", {
      headers: { Accept: "application/json" },
      credentials: "include"
    }).then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      const contracts = Array.isArray(data.contracts) ? data.contracts : [];
      const active = contracts.find((item) =>
        item?.status !== "SIGNED" &&
        item?.evidence?.share_token_status === "active" &&
        item?.evidence?.share_token
      );
      const signed = contracts.find((item) =>
        item?.status === "SIGNED" &&
        (item?.pdf_url || item?.evidence?.pdf_status === "signed_ready")
      ) || contracts.find((item) => item?.status === "SIGNED");
      const fallback = contracts[0];
      const mapContract = (item) => item
        ? {
            id: item.id,
            token: item?.evidence?.share_token,
            status: item.status,
          }
        : null;
      return {
        active: mapContract(active || fallback),
        signed: mapContract(signed),
      };
    })`,
  );

  if (!contracts?.active?.id) {
    throw new Error("No contract was available for sales capture");
  }

  return contracts;
};

const getContentReviewContractForCapture = async (client, page) => {
  const reviewContract = await evaluate(
    client,
    page,
    `new Promise(async (resolve) => {
      const contractsResponse = await fetch("/api/contracts", {
        headers: { Accept: "application/json" },
        credentials: "include"
      }).catch(() => null);
      if (!contractsResponse?.ok) {
        resolve(null);
        return;
      }

      const data = await contractsResponse.json().catch(() => ({}));
      const contracts = Array.isArray(data.contracts) ? data.contracts : [];
      for (const contract of contracts) {
        if (!contract?.id) continue;
        const deliverablesResponse = await fetch(
          "/api/contracts/" + encodeURIComponent(contract.id) + "/deliverables",
          {
            headers: { Accept: "application/json" },
            credentials: "include"
          }
        ).catch(() => null);
        if (!deliverablesResponse?.ok) continue;
        const deliverables = await deliverablesResponse.json().catch(() => ({}));
        const requirements = Array.isArray(deliverables.requirements)
          ? deliverables.requirements
          : [];
        const hasSubmittedContent = requirements.some((requirement) =>
          Array.isArray(requirement.submissions) &&
          requirement.submissions.some((submission) =>
            submission?.review_status === "submitted" &&
            (submission?.url || (Array.isArray(submission?.files) && submission.files.length > 0))
          )
        );
        if (hasSubmittedContent) {
          resolve({ id: contract.id });
          return;
        }
      }
      resolve(null);
    })`,
  );

  if (!reviewContract?.id) {
    throw new Error("No submitted content review contract was available for sales capture");
  }

  return reviewContract;
};

const scrollToText = async (client, page, text, offset = 0) => {
  await evaluate(
    client,
    page,
    `(() => {
      const text = ${JSON.stringify(text)};
      const elements = Array.from(document.querySelectorAll("a, button, h1, h2, h3, p, section, aside, div"));
      const target = elements.find((element) => element.textContent?.includes(text));
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      window.scrollBy(0, ${Number(offset)});
      return true;
    })()`,
  );
  await sleep(500);
};

const prepareBuilderForCapture = async (client, page) => {
  const result = await evaluate(
    client,
    page,
    `new Promise(async (resolve, reject) => {
      const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
      const setNativeValue = (element, value) => {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor?.set) descriptor.set.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const byLabel = (labelText) => {
        const label = Array.from(document.querySelectorAll("label")).find((item) =>
          item.textContent?.trim().includes(labelText)
        );
        const container = label?.parentElement;
        return container?.querySelector("input, textarea");
      };
      const setByLabel = async (labelText, value) => {
        const field = byLabel(labelText);
        if (!field) throw new Error("Field not found: " + labelText);
        field.focus();
        setNativeValue(field, value);
        await sleep(80);
      };
      const clickButton = async (text) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (item) => item.textContent?.includes(text) && !item.disabled
        );
        if (!button) throw new Error("Button not found: " + text);
        button.click();
        await sleep(450);
      };
      const clickOptionLabel = async (text) => {
        const label = Array.from(document.querySelectorAll("label")).find((item) =>
          item.textContent?.includes(text)
        );
        const input = label?.querySelector("input");
        if (!input) throw new Error("Option not found: " + text);
        input.click();
        await sleep(180);
      };

      try {
        await setByLabel("광고주/브랜드명", "브레드룸");
        await setByLabel("담당자명", "김마케팅 매니저");
        await setByLabel("계약 건명", "신제품 선크림 릴스 계약");
        await setByLabel("성명 또는 채널명", "뷰티온에어");
        await setByLabel("메인 채널 URL", "https://instagram.com/beauty_onair");
        await setByLabel("연락처", "creator@example.com");
        await clickButton("다음");

        await clickOptionLabel("인스타그램 릴스");
        const uploadCount = document.querySelector('input[placeholder="예: 2회"]');
        const duration = document.querySelector('input[placeholder="예: 3개월"]');
        if (!uploadCount || !duration) throw new Error("Deliverable fields not found");
        setNativeValue(uploadCount, "릴스 1건");
        setNativeValue(duration, "업로드 후 30일");
        await sleep(100);
        await clickButton("다음");

        const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
        ["2026-06-01", "2026-06-30", "2026-06-12", "2026-06-10"].forEach(
          (value, index) => setNativeValue(dateInputs[index], value)
        );
        await sleep(100);
        await setByLabel("수정 가능 횟수", "최대 2회");
        await setByLabel("지급 조건", "총 1,200,000원, 콘텐츠 업로드 확인 후 7영업일 내 지급");
        await setByLabel("경쟁사 배제 조건", "업로드 후 30일간 동종 선케어 브랜드 광고 제외");
        await clickButton("다음");
        await clickButton("다음");

        resolve({
          ok: document.body.innerText.includes("필수 조건이 모두 채워졌습니다") &&
            document.body.innerText.includes("공유 링크 생성")
        });
      } catch (error) {
        reject(error);
      }
    })`,
  );

  if (!result?.ok) {
    throw new Error("Contract builder capture was not prepared");
  }
};

const clickVisibleButtonByText = async (client, page, text) => {
  const clicked = await evaluate(
    client,
    page,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (item) => item.textContent?.includes(${JSON.stringify(text)}) && !item.disabled
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  await sleep(500);
  return Boolean(clicked);
};

const scrollToFirstTextarea = async (client, page) => {
  await evaluate(
    client,
    page,
    `(() => {
      const target = document.querySelector("textarea");
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      const scrollables = Array.from(document.querySelectorAll("*")).filter((element) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      });
      for (const element of scrollables) {
        const box = target.getBoundingClientRect();
        if (box.top < 120 || box.bottom > window.innerHeight - 80) {
          element.scrollTop += box.top - window.innerHeight / 2 + 80;
        }
      }
      return true;
    })()`,
  );
  await sleep(500);
};

const fillBuilderFirstStepForCapture = async (client, page) => {
  const result = await evaluate(
    client,
    page,
    `new Promise(async (resolve, reject) => {
      const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
      const setNativeValue = (element, value) => {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor?.set) descriptor.set.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const byLabel = (labelText) => {
        const label = Array.from(document.querySelectorAll("label")).find((item) =>
          item.textContent?.trim().includes(labelText)
        );
        const container = label?.parentElement;
        return container?.querySelector("input, textarea");
      };
      const setByLabel = async (labelText, value) => {
        const field = byLabel(labelText);
        if (!field) throw new Error("Field not found: " + labelText);
        field.focus();
        setNativeValue(field, value);
        await sleep(80);
      };

      try {
        await setByLabel("광고주/브랜드명", "브레드룸");
        await setByLabel("담당자명", "김마케팅 매니저");
        await setByLabel("계약 건명", "신제품 선크림 릴스 광고 계약");
        await setByLabel("성명 또는 채널명", "유나뷰티");
        await setByLabel("메인 채널 URL", "https://instagram.com/yuna_beauty");
        await setByLabel("연락처", "creator@example.com");
        await sleep(450);

        resolve({
          ok: document.body.innerText.includes("브레드룸") &&
            document.body.innerText.includes("유나뷰티") &&
            document.body.innerText.includes("신제품 선크림 릴스 광고 계약")
        });
      } catch (error) {
        reject(error);
      }
    })`,
  );

  if (!result?.ok) {
    throw new Error("Contract builder first-screen capture was not prepared");
  }
};

const getApplicantCampaignKeyForCapture = async (client, page) => {
  const campaignKey = await evaluate(
    client,
    page,
    `Promise.all([
      fetch("/api/advertiser/campaigns", {
        headers: { Accept: "application/json" },
        credentials: "include"
      }).then(async (response) => response.ok ? response.json() : null),
      fetch("/api/marketplace/messages?role=advertiser", {
        headers: { Accept: "application/json" },
        credentials: "include"
      }).then(async (response) => response.ok ? response.json() : null)
    ]).then(([campaignData, messageData]) => {
      const campaigns = Array.isArray(campaignData?.campaigns) ? campaignData.campaigns : [];
      const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
      const threads = Array.isArray(messageData?.threads) ? messageData.threads : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOpenCampaign = (thread) => {
        const campaign = campaignById.get(thread?.campaignId);
        return Boolean(campaign && campaign.status === "open");
      };
      const isOpenRecruiting = (thread) => {
        const campaign = campaignById.get(thread?.campaignId);
        if (!campaign || campaign.status !== "open") return false;
        if (!campaign.deadline) return true;
        const deadline = new Date(campaign.deadline + "T00:00:00");
        return Number.isFinite(deadline.getTime()) && deadline >= today;
      };
      const hasSelectableApplicant = (thread) =>
        thread?.campaignId &&
        (thread?.status === "submitted" || thread?.status === "reviewed");
      const grouped = new Map();
      for (const thread of threads) {
        if (!thread?.campaignId || !hasSelectableApplicant(thread)) continue;
        const current = grouped.get(thread.campaignId) ?? {
          campaignId: thread.campaignId,
          count: 0,
          openCount: 0,
          activeOpenCount: 0,
        };
        current.count += 1;
        if (isOpenCampaign(thread)) current.openCount += 1;
        if (isOpenRecruiting(thread)) current.activeOpenCount += 1;
        grouped.set(thread.campaignId, current);
      }
      const best = Array.from(grouped.values()).sort((a, b) =>
        b.count - a.count ||
        b.openCount - a.openCount ||
        b.activeOpenCount - a.activeOpenCount
      )[0];
      const fallback = threads.find((item) => hasSelectableApplicant(item) && isOpenRecruiting(item)) ||
        threads.find((item) => item?.campaignId && isOpenRecruiting(item)) ||
        threads.find((item) => hasSelectableApplicant(item)) ||
        threads.find((item) => item?.campaignId);
      return best?.campaignId ? "campaign:" + best.campaignId : fallback?.campaignId ? "campaign:" + fallback.campaignId : null;
    })`,
  );

  if (!campaignKey) {
    throw new Error("No campaign applicant list was available for sales capture");
  }

  return campaignKey;
};

const fillCampaignApplicantsForSalesCapture = async (client, page) => {
  const result = await evaluate(
    client,
    page,
    `(() => {
      const extras = [
        { name: "지안홈", handle: "@jian_home", platform: "인스타 5.4만", category: "리빙" },
        { name: "세린데일리", handle: "@serin_daily", platform: "인스타 5.2만", category: "라이프스타일" },
        { name: "나래쇼츠", handle: "@narae_shorts", platform: "틱톡 11.4만", category: "숏폼" },
        { name: "로미리뷰", handle: "@romi_review", platform: "인스타 4.5만", category: "리뷰" },
        { name: "소담픽", handle: "@sodam_pick", platform: "인스타 5.6만", category: "라이프스타일" }
      ];
      const applicantTitle = [...document.querySelectorAll("p")]
        .find((item) => item.textContent?.trim() === "지원자");
      const applicantPanel = applicantTitle?.closest(".border-b");
      const rowsContainer = applicantPanel?.querySelector(".divide-y");
      if (!applicantPanel || !rowsContainer) {
        return { ok: false, reason: "applicant panel not found", rowCount: 0 };
      }

      const updateApplicantCount = (count) => {
        const countLine = [...applicantPanel.querySelectorAll("p")]
          .find((item) => /명 표시/.test(item.textContent || ""));
        if (countLine) countLine.textContent = count + "명 표시 · 전체 " + count + "명";
      };

      const existingRows = [...rowsContainer.children];
      let rows = [...existingRows];
      for (let index = 0; rows.length < 12; index += 1) {
        const template = existingRows[index % existingRows.length];
        if (!template) break;
        const extra = extras[index % extras.length];
        const clone = template.cloneNode(true);
        clone.setAttribute("data-sales-capture-extra", "true");

        const textNodes = [...clone.querySelectorAll("a, p, span, button")];
        const nameEl = textNodes.find((item) =>
          /수아픽|유나뷰티|온리루틴|라온뷰티|하린로그|리뷰제이|모아리뷰/.test(
            item.textContent?.trim() || "",
          ),
        );
        if (nameEl) {
          nameEl.textContent = extra.name;
          if (nameEl.hasAttribute("title")) nameEl.setAttribute("title", extra.name + " 프로필 보기");
          if (nameEl.hasAttribute("aria-label")) nameEl.setAttribute("aria-label", extra.name + " 프로필 보기");
        }

        const handleEl = [...clone.querySelectorAll("p")]
          .find((item) => /^@/.test(item.textContent?.trim() || ""));
        if (handleEl) handleEl.textContent = extra.handle;

        const platformEl = textNodes.find((item) =>
          /(인스타|유튜브|틱톡|블로그).*(만|천)/.test(item.textContent?.trim() || ""),
        );
        if (platformEl) platformEl.textContent = extra.platform;

        const categoryEl = textNodes.find((item) =>
          ["뷰티", "라이프스타일", "리뷰", "리빙", "숏폼"].includes(
            item.textContent?.trim() || "",
          ),
        );
        if (categoryEl) categoryEl.textContent = extra.category;

        rowsContainer.appendChild(clone);
        rows = [...rowsContainer.children];
      }

      updateApplicantCount(Math.max(rows.length, 12));
      return { ok: rows.length >= 12, rowCount: rows.length };
    })()`,
  );

  if (!result?.ok) {
    throw new Error(
      `Campaign applicant sales capture was not filled: ${result?.reason ?? "unknown"} (${result?.rowCount ?? 0} rows)`,
    );
  }
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

  const authPage = await loginAdvertiser(client);
  const { active: salesContract, signed: signedContract } =
    await getSalesContractsForCapture(client, authPage);
  const contentReviewContract = await getContentReviewContractForCapture(
    client,
    authPage,
  );
  await closePage(client, authPage);

  const dashboardPage = await openPage(
    client,
    `${baseUrl}/advertiser/dashboard`,
    { width: 1440, height: 720 },
  );
  await waitForBodyText(client, dashboardPage, "계약 운영");
  await clickVisibleButtonByText(client, dashboardPage, "필터");
  await capturePng(client, dashboardPage, "yeollock-advertiser-dashboard.png");
  await closePage(client, dashboardPage);

  const campaignDashboardPage = await openPage(
    client,
    `${baseUrl}/advertiser/campaigns`,
    { width: 1440, height: 720 },
  );
  await waitForBodyText(client, campaignDashboardPage, "캠페인 운영");
  await capturePng(
    client,
    campaignDashboardPage,
    "yeollock-advertiser-campaign-dashboard.png",
  );
  const applicantCampaignKey = await getApplicantCampaignKeyForCapture(
    client,
    campaignDashboardPage,
  );
  await closePage(client, campaignDashboardPage);

  const campaignApplicantsPage = await openPage(
    client,
    `${baseUrl}/advertiser/campaigns?campaign=${encodeURIComponent(applicantCampaignKey)}`,
    { width: 1440, height: 1250 },
  );
  await waitForBodyText(client, campaignApplicantsPage, "지원자", 45000);
  await fillCampaignApplicantsForSalesCapture(client, campaignApplicantsPage);
  await capturePng(
    client,
    campaignApplicantsPage,
    "yeollock-campaign-applicants-dashboard.png",
  );
  await closePage(client, campaignApplicantsPage);

  const campaignBuilderPage = await openPage(
    client,
    `${baseUrl}/advertiser/campaigns/new`,
    { width: 1440, height: 940 },
  );
  await waitForBodyText(client, campaignBuilderPage, "유나뷰티", 45000);
  await capturePng(
    client,
    campaignBuilderPage,
    "yeollock-campaign-builder-main.png",
  );
  await closePage(client, campaignBuilderPage);

  const builderPage = await openPage(
    client,
    `${baseUrl}/advertiser/builder`,
    { width: 1440, height: 1040 },
  );
  await waitForBodyText(client, builderPage, "새 전자계약서 작성", 45000);
  await fillBuilderFirstStepForCapture(client, builderPage);
  await capturePng(
    client,
    builderPage,
    "yeollock-contract-builder-first-screen.png",
  );
  await prepareBuilderForCapture(client, builderPage);
  await capturePng(client, builderPage, "yeollock-contract-builder.png");
  await closePage(client, builderPage);

  const adminContractPage = await openPage(
    client,
    `${baseUrl}/advertiser/contract/${encodeURIComponent(salesContract.id)}`,
    { width: 1180, height: 884 },
  );
  await waitForBodyText(client, adminContractPage, "계약서 본문");
  await capturePng(client, adminContractPage, "yeollock-contract-admin.png");
  await closePage(client, adminContractPage);

  const contentReviewPage = await openPage(
    client,
    `${baseUrl}/advertiser/contract/${encodeURIComponent(contentReviewContract.id)}`,
    { width: 1440, height: 620 },
  );
  await waitForBodyText(client, contentReviewPage, "수정 요청", 45000);
  await scrollToFirstTextarea(client, contentReviewPage);
  await capturePng(
    client,
    contentReviewPage,
    "yeollock-contract-content-review.png",
  );
  await closePage(client, contentReviewPage);

  if (signedContract?.id) {
    const completedContractPage = await openPage(
      client,
      `${baseUrl}/advertiser/contract/${encodeURIComponent(signedContract.id)}`,
      { width: 1440, height: 940 },
    );
    await waitForBodyText(client, completedContractPage, "계약서 본문");
    await scrollToText(client, completedContractPage, "서명본 PDF 내려받기", -180);
    await capturePng(
      client,
      completedContractPage,
      "yeollock-contract-completed-admin.png",
    );
    await closePage(client, completedContractPage);
  }

  if (salesContract.token) {
    const influencerContractPage = await openPage(
      client,
      `${baseUrl}/contract/${encodeURIComponent(salesContract.id)}?token=${encodeURIComponent(
        salesContract.token,
      )}`,
      { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
    );
    await waitForBodyText(client, influencerContractPage, "계약");
    await capturePng(client, influencerContractPage, "yeollock-influencer-contract.png");
    await closePage(client, influencerContractPage);
  }

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

  await printHtmlPdf(
    path.join(root, "docs", "sales", "advertiser-introduction.html"),
    path.join(root, "docs", "sales", "advertiser-introduction.pdf"),
  );

  await printHtmlPdf(
    path.join(root, "docs", "sales", "influencer-introduction.html"),
    path.join(root, "docs", "sales", "influencer-introduction.pdf"),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        outputs: [
          "docs/sales/assets/yeollock-advertiser-dashboard.png",
          "docs/sales/assets/yeollock-advertiser-campaign-dashboard.png",
          "docs/sales/assets/yeollock-campaign-applicants-dashboard.png",
          "docs/sales/assets/yeollock-campaign-builder-main.png",
          "docs/sales/assets/yeollock-contract-builder-first-screen.png",
          "docs/sales/assets/yeollock-contract-builder.png",
          "docs/sales/assets/yeollock-contract-admin.png",
          "docs/sales/assets/yeollock-contract-content-review.png",
          "docs/sales/assets/yeollock-contract-completed-admin.png",
          "docs/sales/assets/yeollock-influencer-contract.png",
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
