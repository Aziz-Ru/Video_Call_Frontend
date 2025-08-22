import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../providers/Socket";

const HomePage = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  if (!socket) {
    throw new Error("Socket is not initialized");
  }
  const handleJoinRoom = useCallback(
    (roomId: string) => {
      console.log(`Your RoomId:${roomId}`);
      navigate(`/room/${roomId}`);
    },
    [navigate]
  );

  useEffect(() => {
    socket.on("joined-room", handleJoinRoom);
    return () => {
      socket.off("joined-room", handleJoinRoom);
    };
  }, [socket, handleJoinRoom]);

  const submitHandler = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    socket.emit("join-room", {
      roomId: formData.get("roomId"),
      userId: formData.get("userId"),
    });
  };

  return (
    <div>
      <div className="h-screen flex items-center justify-center">
        <form className="flex flex-col gap-3" onSubmit={submitHandler}>
          <input
            type="text"
            name="userId"
            required
            placeholder="Enter Your Username"
            className="border border-gray-500 px-4 py-2 rounded"
          />
          <input
            type="text"
            name="roomId"
            required
            placeholder="Enter Room your Code"
            className="border border-gray-500 px-4 py-2 rounded"
          />
          <input
            type="submit"
            value="Join"
            className="bg-blue-900 px-4 py-2 text-white rounded"
          />
        </form>
      </div>
    </div>
  );
};

export default HomePage;
