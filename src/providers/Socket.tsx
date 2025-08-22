import React, { useMemo } from "react";
import { io, Socket } from "socket.io-client";

const SocketContext = React.createContext<Socket | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => {
  const socket = React.useContext(SocketContext);
  if (!socket) {
    throw new Error("Socket Is intialize");
  }
  return socket;
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const socket = useMemo(
    () =>
      io("wss://videocallbackend-production-77cb.up.railway.app", {
        transports: ["websocket"],
      }),
    []
  );
  return (
    <SocketContext.Provider value={socket!}>{children}</SocketContext.Provider>
  );
};
