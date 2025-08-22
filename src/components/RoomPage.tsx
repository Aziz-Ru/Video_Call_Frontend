import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { usePeer } from "../providers/Peer";
import { useSocket } from "../providers/Socket";

const RoomPage = () => {
  const [myStream, setMyStream] = useState<null | MediaStream>(null);
  const [remoteSocketId, setRemoteSocketId] = useState("");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStreamsSent, setIsStreamsSent] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isGettingMedia, setIsGettingMedia] = useState(false);

  const socket = useSocket();
  const { peer, createOffer, acceptOffer, setFinalAnswer } = usePeer();
  const streamInitialized = useRef(false);

  // Function to get user media with proper error handling
  const getUserMedia = useCallback(
    async (retryCount = 0): Promise<MediaStream | null> => {
      if (isGettingMedia) {
        console.log("Already getting media, waiting...");
        return null;
      }

      setIsGettingMedia(true);
      setMediaError(null);

      try {
        // First try with video and audio
        console.log(`Attempting to get media (attempt ${retryCount + 1})`);

        const constraints: MediaStreamConstraints = {
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Successfully got media stream");
        setIsGettingMedia(false);
        return stream;
      } catch (error: any) {
        console.error(
          `Error getting media (attempt ${retryCount + 1}):`,
          error
        );
        setIsGettingMedia(false);

        if (error.name === "NotReadableError" && retryCount < 2) {
          console.log("Camera might be in use, waiting and retrying...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return getUserMedia(retryCount + 1);
        }

        if (error.name === "NotAllowedError") {
          setMediaError(
            "Camera/microphone access denied. Please allow permissions and refresh the page."
          );
          return null;
        }

        if (error.name === "NotFoundError") {
          setMediaError(
            "No camera or microphone found. Please connect a camera and microphone."
          );
          return null;
        }

        if (error.name === "NotReadableError") {
          // Try audio-only as fallback
          try {
            console.log("Trying audio-only fallback...");
            const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            setMediaError(
              "Camera unavailable (might be in use). Using audio-only mode."
            );
            return audioOnlyStream;
          } catch (audioError) {
            setMediaError(
              "Camera is in use by another application. Please close other applications using the camera."
            );
            return null;
          }
        }

        setMediaError(`Media error: ${error.message}`);
        return null;
      }
    },
    [isGettingMedia]
  );

  // Initialize media stream once when component mounts
  useEffect(() => {
    const initializeStream = async () => {
      if (streamInitialized.current || myStream) {
        return;
      }

      streamInitialized.current = true;
      console.log("Initializing media stream...");

      const stream = await getUserMedia();
      if (stream) {
        setMyStream(stream);
        setMediaError(null);

        // Add tracks immediately when we have both peer and stream
        if (peer) {
          console.log("Adding local tracks to peer connection");
          stream.getTracks().forEach((track) => {
            console.log(`Adding ${track.kind} track:`, track.label);
            peer.addTrack(track, stream);
          });
          setIsStreamsSent(true);
        }
      }
    };

    initializeStream();
  }, [peer, myStream, getUserMedia]);

  const handleNewUserJoin = useCallback(
    async ({ userId, socketId }: { userId: string; socketId: string }) => {
      console.log(`New user joined - userId:${userId} & socketId:${socketId}`);
      setRemoteSocketId(socketId);
    },
    []
  );

  const handleCreateOffer = useCallback(async () => {
    try {
      if (!myStream) {
        console.error("No local stream available, trying to get media...");
        const stream = await getUserMedia();
        if (!stream) {
          console.error("Failed to get media stream");
          return;
        }
        setMyStream(stream);

        // Add tracks
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });
        setIsStreamsSent(true);
      }

      // Ensure tracks are added before creating offer
      if (!isStreamsSent && myStream) {
        console.log("Adding tracks before creating offer");
        myStream.getTracks().forEach((track) => {
          peer.addTrack(track, myStream);
        });
        setIsStreamsSent(true);
      }

      const offer = await createOffer();
      socket.emit("create-offer", {
        offer,
        to: remoteSocketId,
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }, [
    myStream,
    remoteSocketId,
    socket,
    createOffer,
    peer,
    isStreamsSent,
    getUserMedia,
  ]);

  const handleIncomingOffer = useCallback(
    async ({
      offer,
      from,
    }: {
      offer: RTCSessionDescriptionInit;
      from: string;
    }) => {
      try {
        setRemoteSocketId(from);
        console.log(`Accepting offer and creating answer for ${from}`);

        // Ensure we have local stream before accepting offer
        let currentStream = myStream;
        if (!currentStream) {
          console.log(
            "No existing stream, getting new one for incoming offer..."
          );
          currentStream = await getUserMedia();
          if (!currentStream) {
            console.error("Failed to get media stream for incoming offer");
            return;
          }
          setMyStream(currentStream);
        }

        // Add tracks if not already sent
        if (!isStreamsSent && currentStream) {
          console.log("Adding tracks for incoming offer");
          currentStream.getTracks().forEach((track) => {
            console.log(`Adding ${track.kind} track for incoming offer`);
            peer.addTrack(track, currentStream!);
          });
          setIsStreamsSent(true);
        }

        const answer = await acceptOffer(offer);
        socket.emit("answer", { answer, to: from });
      } catch (error) {
        console.error("Error handling incoming offer:", error);
      }
    },
    [socket, acceptOffer, myStream, peer, isStreamsSent, getUserMedia]
  );

  const handleAcceptedAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      try {
        console.log("Setting final answer");
        await setFinalAnswer(answer);

        // Double-check that streams are sent
        if (myStream && !isStreamsSent) {
          myStream.getTracks().forEach((track) => {
            peer.addTrack(track, myStream);
          });
          setIsStreamsSent(true);
        }
      } catch (error) {
        console.error("Error setting final answer:", error);
      }
    },
    [setFinalAnswer, myStream, peer, isStreamsSent]
  );

  const handleNegotiation = useCallback(async () => {
    try {
      console.log("Negotiation needed");
      const offer = await createOffer();
      socket.emit("negotiation-needed", {
        offer: offer,
        to: remoteSocketId,
      });
    } catch (error) {
      console.error("Error during negotiation:", error);
    }
  }, [createOffer, remoteSocketId, socket]);

  useEffect(() => {
    peer.addEventListener("negotiationneeded", handleNegotiation);
    return () => {
      peer.removeEventListener("negotiationneeded", handleNegotiation);
    };
  }, [handleNegotiation, peer]);

  const handleNegotiationNeededIncoming = useCallback(
    async ({
      offer,
      from,
    }: {
      offer: RTCSessionDescriptionInit;
      from: string;
    }) => {
      try {
        console.log("Handling incoming negotiation");
        const answer = await acceptOffer(offer);
        socket.emit("nego-done", { answer, to: from });
      } catch (error) {
        console.error("Error handling negotiation:", error);
      }
    },
    [socket, acceptOffer]
  );

  const handleFinalNegotiation = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      try {
        console.log("Handling final negotiation");
        await setFinalAnswer(answer);
      } catch (error) {
        console.error("Error in final negotiation:", error);
      }
    },
    [setFinalAnswer]
  );

  useEffect(() => {
    socket.on("user-joined", handleNewUserJoin);
    socket.on("incoming-offer", handleIncomingOffer);
    socket.on("accepted-answer", handleAcceptedAnswer);
    socket.on("negotiation-accept", handleNegotiationNeededIncoming);
    socket.on("nego-final", handleFinalNegotiation);

    return () => {
      socket.off("user-joined", handleNewUserJoin);
      socket.off("incoming-offer", handleIncomingOffer);
      socket.off("accepted-answer", handleAcceptedAnswer);
      socket.off("negotiation-accept", handleNegotiationNeededIncoming);
      socket.off("nego-final", handleFinalNegotiation);
    };
  }, [
    socket,
    handleNewUserJoin,
    handleIncomingOffer,
    handleAcceptedAnswer,
    handleNegotiationNeededIncoming,
    handleFinalNegotiation,
  ]);

  const handleRemoteStream = useCallback((ev: RTCTrackEvent) => {
    console.log("Received remote track:", ev.track.kind);
    const remoteStreams = ev.streams;
    if (remoteStreams && remoteStreams.length > 0) {
      console.log("Setting remote stream");
      setRemoteStream(remoteStreams[0]);
    }
  }, []);

  useEffect(() => {
    peer.addEventListener("track", handleRemoteStream);
    return () => {
      peer.removeEventListener("track", handleRemoteStream);
    };
  }, [peer, handleRemoteStream]);

  // Debug function to check peer connection state
  const debugPeerConnection = () => {
    console.log("Peer connection state:", peer.connectionState);
    console.log("ICE connection state:", peer.iceConnectionState);
    console.log("ICE gathering state:", peer.iceGatheringState);
    console.log("Signaling state:", peer.signalingState);

    const senders = peer.getSenders();
    console.log("Local senders:", senders.length);
    senders.forEach((sender, index) => {
      console.log(
        `Sender ${index}:`,
        sender.track?.kind,
        sender.track?.enabled
      );
    });
  };

  // Function to retry media access
  const retryMediaAccess = async () => {
    streamInitialized.current = false;
    setMediaError(null);
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
      setMyStream(null);
    }
    setIsStreamsSent(false);

    const stream = await getUserMedia();
    if (stream) {
      setMyStream(stream);
      if (peer) {
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });
        setIsStreamsSent(true);
      }
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (myStream) {
        myStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [myStream]);

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">
          Room ID: 1234 -{" "}
          {remoteSocketId
            ? `Connected to: ${remoteSocketId}`
            : "No one in room"}
        </h2>

        {mediaError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Media Error:</strong> {mediaError}
            <button
              onClick={retryMediaAccess}
              className="ml-2 bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div className="space-x-2 mb-4">
          {remoteSocketId && myStream && (
            <button
              onClick={handleCreateOffer}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              disabled={isGettingMedia}
            >
              {isGettingMedia ? "Getting Media..." : "Start Call"}
            </button>
          )}

          <button
            onClick={debugPeerConnection}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
          >
            Debug Connection
          </button>

          <button
            onClick={retryMediaAccess}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            disabled={isGettingMedia}
          >
            {isGettingMedia ? "Getting Media..." : "Retry Camera"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">My Video</h3>
            <div
              className="bg-black rounded-lg overflow-hidden"
              style={{ aspectRatio: "16/9" }}
            >
              {myStream ? (
                <ReactPlayer
                  url={myStream}
                  playing
                  muted
                  width="100%"
                  height="100%"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white">
                  {isGettingMedia
                    ? "Getting camera access..."
                    : "Camera not available"}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Remote Video</h3>
            <div
              className="bg-black rounded-lg overflow-hidden"
              style={{ aspectRatio: "16/9" }}
            >
              {remoteStream ? (
                <ReactPlayer
                  url={remoteStream}
                  playing
                  width="100%"
                  height="100%"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white">
                  {remoteSocketId
                    ? "Waiting for remote video..."
                    : "No remote user"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <p>Streams sent: {isStreamsSent ? "Yes" : "No"}</p>
          <p>Local stream: {myStream ? "Ready" : "Not ready"}</p>
          <p>Remote stream: {remoteStream ? "Connected" : "Not connected"}</p>
          <p>Getting media: {isGettingMedia ? "Yes" : "No"}</p>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
