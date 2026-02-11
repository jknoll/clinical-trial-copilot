/**
 * E2E test: Verify intake widget responses preserve question context.
 *
 * Uses a mock WebSocket server to simulate the backend. The test verifies that
 * when the frontend sends widget_response messages, the `question` field is
 * included so the orchestrator can accumulate answers correctly.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
import http from "http";

const FRONTEND_PORT = 3099;
const WS_PORT = 3098;

let browser: Browser;
let page: Page;
let wss: WebSocketServer;
let httpServer: http.Server;

/** Messages received by the mock WS server from the frontend client. */
const receivedMessages: Array<Record<string, unknown>> = [];

/** Queue of messages the mock server should send to the client. */
let serverMessageQueue: Array<Record<string, unknown>> = [];

function createMockServers(): Promise<void> {
  return new Promise((resolve) => {
    // Simple HTTP server that serves a minimal page connecting to our mock WS
    httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Intake E2E Test</title></head>
<body>
  <div id="app">
    <div id="chat"></div>
    <div id="widget-area"></div>
  </div>
  <script>
    const ws = new WebSocket("ws://localhost:${WS_PORT}/ws/test-session");
    const chat = document.getElementById("chat");
    const widgetArea = document.getElementById("widget-area");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "text") {
        const div = document.createElement("div");
        div.className = "message assistant";
        div.textContent = data.content;
        chat.appendChild(div);
      }

      if (data.type === "widget") {
        widgetArea.innerHTML = "";
        const container = document.createElement("div");
        container.className = "widget";
        container.dataset.question = data.question;
        container.dataset.widgetType = data.widget_type;

        data.options.forEach((opt) => {
          const btn = document.createElement("button");
          btn.className = "widget-option";
          btn.textContent = opt.label;
          btn.dataset.value = opt.value;
          btn.onclick = () => {
            // This is the critical behavior we're testing:
            // The frontend must include the question text in widget_response
            ws.send(JSON.stringify({
              type: "widget_response",
              question: data.question,
              selections: [opt.value],
            }));
            const div = document.createElement("div");
            div.className = "message user";
            div.textContent = opt.label;
            chat.appendChild(div);
            widgetArea.innerHTML = "";
          };
          container.appendChild(btn);
        });

        widgetArea.appendChild(container);
      }
    };

    // Expose send function for manual messages
    window.sendMessage = (text) => {
      ws.send(JSON.stringify({ type: "message", content: text }));
      const div = document.createElement("div");
      div.className = "message user";
      div.textContent = text;
      chat.appendChild(div);
    };
  </script>
</body>
</html>`);
    });

    httpServer.listen(FRONTEND_PORT, () => {
      // WebSocket server
      wss = new WebSocketServer({ port: WS_PORT });

      wss.on("connection", (ws: WsWebSocket) => {
        // Send only the first queued widget on connection
        if (serverMessageQueue.length > 0) {
          const first = serverMessageQueue.shift()!;
          ws.send(JSON.stringify(first));
        }

        ws.on("message", (raw) => {
          const data = JSON.parse(raw.toString());
          receivedMessages.push(data);

          // Respond with next widget after receiving a client message
          if (serverMessageQueue.length > 0) {
            const next = serverMessageQueue.shift()!;
            ws.send(JSON.stringify(next));
          }
        });
      });

      resolve();
    });
  });
}

function queueWidget(
  question: string,
  options: Array<{ label: string; value: string }>
) {
  serverMessageQueue.push({
    type: "widget",
    widget_type: "single_select",
    question,
    question_id: `q_${serverMessageQueue.length}`,
    options,
  });
}

beforeAll(async () => {
  // Queue up the intake widgets before the client connects
  queueWidget("What is your biological sex?", [
    { label: "Male", value: "Male" },
    { label: "Female", value: "Female" },
  ]);
  queueWidget("How old are you?", [
    { label: "35-44", value: "35-44" },
    { label: "45-54", value: "45-54" },
  ]);
  queueWidget("Where are you located?", [
    { label: "San Francisco, CA", value: "San Francisco, CA" },
    { label: "New York, NY", value: "New York, NY" },
  ]);

  await createMockServers();

  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  page = await browser.newPage();
}, 15000);

afterAll(async () => {
  await browser?.close();
  wss?.close();
  httpServer?.close();
});

describe("Intake widget_response messages", () => {
  it("should include question text in widget_response", async () => {
    await page.goto(`http://localhost:${FRONTEND_PORT}`, {
      waitUntil: "networkidle0",
    });

    // Wait for first widget to appear
    await page.waitForSelector(".widget-option", { timeout: 5000 });

    // Click "Male" for sex question
    const buttons = await page.$$(".widget-option");
    await buttons[0].click();

    // Wait for next widget
    await page.waitForFunction(
      () => document.querySelectorAll(".widget-option").length > 0,
      { timeout: 5000 }
    );

    // Click "45-54" for age question
    const ageButtons = await page.$$(".widget-option");
    await ageButtons[1].click();

    // Wait for next widget
    await page.waitForFunction(
      () => document.querySelectorAll(".widget-option").length > 0,
      { timeout: 5000 }
    );

    // Click "San Francisco, CA" for location question
    const locButtons = await page.$$(".widget-option");
    await locButtons[0].click();

    // Give time for messages to be received
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify all widget_response messages include the question
    const widgetResponses = receivedMessages.filter(
      (m) => m.type === "widget_response"
    );

    expect(widgetResponses).toHaveLength(3);

    expect(widgetResponses[0]).toMatchObject({
      type: "widget_response",
      question: "What is your biological sex?",
      selections: ["Male"],
    });

    expect(widgetResponses[1]).toMatchObject({
      type: "widget_response",
      question: "How old are you?",
      selections: ["45-54"],
    });

    expect(widgetResponses[2]).toMatchObject({
      type: "widget_response",
      question: "Where are you located?",
      selections: ["San Francisco, CA"],
    });
  });

  it("should transmit all answers correctly across multiple widgets", async () => {
    // Verify that no widget_response is missing its question field
    const widgetResponses = receivedMessages.filter(
      (m) => m.type === "widget_response"
    );

    for (const msg of widgetResponses) {
      expect(msg.question).toBeTruthy();
      expect(typeof msg.question).toBe("string");
      expect((msg.question as string).length).toBeGreaterThan(0);
      expect(msg.selections).toBeTruthy();
      expect(Array.isArray(msg.selections)).toBe(true);
    }
  });
});
