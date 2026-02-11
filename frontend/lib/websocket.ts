export class WSClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private onMessage: (msg: Record<string, unknown>) => void;
  private onError: (err: Event) => void;
  private onConnect: (() => void) | null;
  private intentionalClose = false;

  constructor(
    sessionId: string,
    onMessage: (msg: Record<string, unknown>) => void,
    onError?: (err: Event) => void,
    onConnect?: () => void
  ) {
    this.sessionId = sessionId;
    this.onMessage = onMessage;
    this.onError = onError || (() => {});
    this.onConnect = onConnect || null;
  }

  connect() {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    this.ws = new WebSocket(`${wsUrl}/ws/${this.sessionId}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch {
        console.error('Failed to parse message');
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      this.onError(err);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      // Don't auto-reconnect — the component will handle lifecycle
    };
  }

  send(message: {
    type: string;
    content?: string;
    questionId?: string;
    selections?: string[];
    trialIds?: string[];
  }) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }
}
