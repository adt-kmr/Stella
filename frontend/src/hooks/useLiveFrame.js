import { useEffect, useState } from "react";
import { connectLive } from "../api/client.js";

export function useLiveFrame(initial = {}) {
  const [frame, setFrame] = useState(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const close = connectLive(
      (f) => {
        setFrame(f);
        setConnected(true);
      },
      () => setConnected(false)
    );
    return close;
  }, []);

  return { frame, connected };
}