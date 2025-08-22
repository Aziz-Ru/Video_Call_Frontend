import { BrowserRouter, Route, Routes } from "react-router-dom";

import HomePage from "./components/HomePage";
import RoomPage from "./components/RoomPage";
import { PeerProvider } from "./providers/Peer";
import { SocketProvider } from "./providers/Socket";

function App() {
  return (
    <>
      <BrowserRouter>
        <SocketProvider>
          <PeerProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </PeerProvider>
        </SocketProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
