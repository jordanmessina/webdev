import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { TERMINAL, UI } from "@/lib/constants";
import { getWsUrl } from "@/lib/ws";
import { getTheme, type ThemeId } from "@/lib/themes";
import styles from "./Terminal.module.css";

interface TerminalProps {
  sessionId: string;
  themeId: ThemeId;
}

export interface TerminalHandle {
  focus: () => void;
}

// Control characters that don't exist on mobile keyboards
const CONTROL_KEYS = [
  { label: "ESC", code: "\x1b", desc: "Escape" },
  { label: "Ctrl+C", code: "\x03", desc: "Interrupt" },
  { label: "Ctrl+D", code: "\x04", desc: "EOF" },
  { label: "Ctrl+Z", code: "\x1a", desc: "Suspend" },
  { label: "Ctrl+L", code: "\x0c", desc: "Clear" },
  { label: "Ctrl+\\", code: "\x1c", desc: "Quit" },
];

const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ sessionId, themeId }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [mouseEnabled, setMouseEnabled] = useState(true);
  const [showCtrlPicker, setShowCtrlPicker] = useState(false);
  const activeTheme = getTheme(themeId);

  useEffect(() => {
    // Non-critical: fetch initial tmux mouse state, use default if unavailable
    fetch("/api/tmux/mouse")
      .then((res) => res.json())
      .then((data) => setMouseEnabled(data.mouse))
      .catch(() => {});
  }, []);

  const toggleMouseMode = async () => {
    try {
      const res = await fetch("/api/tmux/mouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !mouseEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setMouseEnabled(data.mouse);
      }
    } catch {
      // Non-critical: toggle failed, user can retry
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      terminalInstance.current?.focus();
    },
  }));

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }
  }, []);

  const handlePaste = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("Terminal not connected");
      return;
    }

    let text: string | null = null;

    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        // Fall through to prompt
      }
    }

    if (!text) {
      text = prompt("Paste your text here:");
    }

    if (text) {
      wsRef.current.send(JSON.stringify({ type: "input", data: text }));
    }
  };

  const sendControlKey = (code: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: code }));
    }
    setShowCtrlPicker(false);
    terminalInstance.current?.focus();
  };

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    cleanup();

    const isMobile = window.innerWidth <= TERMINAL.MOBILE_BREAKPOINT;
    const term = new XTerm({
      cursorBlink: true,
      fontSize: isMobile ? TERMINAL.FONT_SIZE_MOBILE : TERMINAL.FONT_SIZE_DESKTOP,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: TERMINAL.SCROLLBACK_LINES,
      theme: activeTheme.terminal,
    });

    fitAddon.current = new FitAddon();
    term.loadAddon(fitAddon.current);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fitAddon.current.fit();

    terminalInstance.current = term;

    // iOS keyboard handling - scroll into view when terminal gets focus
    if (isMobile && terminalRef.current) {
      const xtermTextarea = terminalRef.current.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
      if (xtermTextarea) {
        let hasFocus = false;

        const scrollToTextarea = () => {
          if (hasFocus) {
            xtermTextarea.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        };

        xtermTextarea.addEventListener("focus", () => {
          hasFocus = true;
          // Use Visual Viewport API if available (fires when keyboard actually appears)
          if (window.visualViewport) {
            const onViewportResize = () => {
              scrollToTextarea();
              window.visualViewport!.removeEventListener("resize", onViewportResize);
            };
            window.visualViewport.addEventListener("resize", onViewportResize);
            // Fallback timeout in case resize doesn't fire (e.g., keyboard already open)
            setTimeout(scrollToTextarea, UI.IOS_KEYBOARD_DELAY_MS);
          } else {
            // Fallback for older browsers
            setTimeout(scrollToTextarea, UI.IOS_KEYBOARD_DELAY_MS);
          }
        });

        xtermTextarea.addEventListener("blur", () => {
          hasFocus = false;
        });
      }
    }

    // Connect WebSocket
    const ws = new WebSocket(getWsUrl(`/ws/terminal/${sessionId}`));
    wsRef.current = ws;

    // Mobile touch scrolling - convert touch gestures to mouse scroll events
    // These escape sequences simulate mouse wheel events that tmux understands:
    // \x1b[<65;1;1M = scroll up (mouse button 65 at position 1,1)
    // \x1b[<64;1;1M = scroll down (mouse button 64 at position 1,1)
    if (isMobile && terminalRef.current) {
      let lastTouchY = 0;
      let accumulatedDelta = 0;
      const container = terminalRef.current;

      const onTouchStart = (e: TouchEvent) => {
        lastTouchY = e.touches[0].clientY;
        accumulatedDelta = 0;
      };

      const onTouchMove = (e: TouchEvent) => {
        const touchY = e.touches[0].clientY;
        const deltaY = lastTouchY - touchY;
        lastTouchY = touchY;
        accumulatedDelta += deltaY;

        while (Math.abs(accumulatedDelta) >= TERMINAL.TOUCH_SCROLL_THRESHOLD) {
          if (accumulatedDelta > 0) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", data: "\x1b[<65;1;1M" }));
            }
            accumulatedDelta -= TERMINAL.TOUCH_SCROLL_THRESHOLD;
          } else {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "input", data: "\x1b[<64;1;1M" }));
            }
            accumulatedDelta += TERMINAL.TOUCH_SCROLL_THRESHOLD;
          }
        }
        e.preventDefault();
      };

      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: false });

      const originalDispose = term.dispose.bind(term);
      term.dispose = () => {
        container.removeEventListener("touchstart", onTouchStart);
        container.removeEventListener("touchmove", onTouchMove);
        originalDispose();
      };
    }

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN || !terminalInstance.current) return;
      if (fitAddon.current) {
        const dims = fitAddon.current.proposeDimensions();
        if (dims) {
          const isMobile = window.innerWidth <= TERMINAL.MOBILE_BREAKPOINT;
          const rowBuffer = isMobile ? TERMINAL.MOBILE_ROW_BUFFER : TERMINAL.DESKTOP_ROW_BUFFER;
          const safeRows = Math.max(dims.rows - rowBuffer, TERMINAL.MIN_ROWS);
          terminalInstance.current.resize(dims.cols, safeRows);
        } else {
          fitAddon.current.fit();
        }
      }
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: terminalInstance.current.cols,
          rows: terminalInstance.current.rows,
        })
      );
      term.focus();
    };

    let resizeRaf: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    if (terminalRef.current && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        if (resizeRaf !== null) return;
        resizeRaf = window.requestAnimationFrame(() => {
          resizeRaf = null;
          sendResize();
        });
      });
      resizeObserver.observe(terminalRef.current);
    }

    ws.onopen = () => {
      // Ensure layout has settled before sizing on initial connect.
      requestAnimationFrame(() => sendResize());
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          term.write(msg.data);
        } else if (msg.type === "exit") {
          term.write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
        } else if (msg.type === "error") {
          term.write(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m\r\n`);
        }
      } catch (err) {
        console.error("Error parsing message:", err);
      }
    };

    ws.onerror = () => {
      term.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current && terminalRef.current) {
        const dims = fitAddon.current.proposeDimensions();
        if (dims) {
          const isMobile = window.innerWidth <= TERMINAL.MOBILE_BREAKPOINT;
          const rowBuffer = isMobile ? TERMINAL.MOBILE_ROW_BUFFER : TERMINAL.DESKTOP_ROW_BUFFER;
          const safeRows = Math.max(dims.rows - rowBuffer, TERMINAL.MIN_ROWS);
          terminalInstance.current.resize(dims.cols, safeRows);
        }
      }
      sendResize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf);
      }
      cleanup();
    };
  }, [sessionId, cleanup]);

  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.theme = activeTheme.terminal;
      terminalInstance.current.refresh(0, terminalInstance.current.rows - 1);
    }
  }, [activeTheme.terminal]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <div className={styles.ctrlPickerWrapper}>
          <button
            className={styles.ctrlBtn}
            onClick={() => setShowCtrlPicker(!showCtrlPicker)}
            title="Send control character"
          >
            Ctrl
          </button>
          {showCtrlPicker && (
            <div className={styles.ctrlPicker}>
              {CONTROL_KEYS.map((key) => (
                <button
                  key={key.label}
                  className={styles.ctrlPickerItem}
                  onClick={() => sendControlKey(key.code)}
                >
                  <span className={styles.ctrlPickerLabel}>{key.label}</span>
                  <span className={styles.ctrlPickerDesc}>{key.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={styles.ctrlBtn} onClick={handlePaste} title="Paste from clipboard">
          Paste
        </button>
        <button
          className={styles.ctrlBtn}
          onClick={toggleMouseMode}
          title={mouseEnabled ? "Click to enable text selection" : "Click to enable scroll mode"}
        >
          {mouseEnabled ? "Select" : "Scroll"}
        </button>
      </div>
      <div className={styles.container} ref={terminalRef} />
    </div>
  );
});

export default Terminal;
