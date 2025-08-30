import React, { useCallback, useEffect, useMemo, useState } from "react";

interface PeerType {
  peer: RTCPeerConnection;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  acceptOffer: (
    offer: RTCSessionDescriptionInit
  ) => Promise<RTCSessionDescriptionInit>;

  sendStream: (stream: MediaStream) => Promise<void>;
  setFinalAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  remoteStream: MediaStream | null;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
}
const PeerContext = React.createContext<PeerType | null>(null);

export const usePeer = () => {
  const peer = React.useContext(PeerContext);
  if (!peer) {
    throw new Error("User peer must be in a provider");
  }
  return peer;
};

export const PeerProvider = ({ children }: { children: React.ReactNode }) => {
  const [remoteStream, setremoteStream] = useState<null | MediaStream>(null);

  const peer = useMemo(
    () =>
      new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      }),
    []
  );

  const createOffer = async (): Promise<RTCSessionDescriptionInit> => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(new RTCSessionDescription(offer));
    return offer;
  };

  const acceptOffer = async (
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> => {
    await peer.setRemoteDescription(offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(new RTCSessionDescription(answer));
    return answer;
  };

  const sendStream = async (stream: MediaStream): Promise<void> => {
    const tracks = stream.getTracks();
    tracks.forEach((track) => {
      peer.addTrack(track, stream);
    });
  };

  const setFinalAnswer = async (answer: RTCSessionDescriptionInit) => {
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
  };
  const handleTrackEvent = useCallback((ev: RTCTrackEvent) => {
    const streams = ev.streams;
    setremoteStream(streams[0]);
  }, []);

  const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    await peer.addIceCandidate(new RTCIceCandidate(candidate));
  };

  useEffect(() => {
    peer.addEventListener("track", handleTrackEvent);

    return () => {
      peer.removeEventListener("track", handleTrackEvent);
    };
  }, [peer, handleTrackEvent]);

  return (
    <PeerContext.Provider
      value={{
        peer,
        createOffer,
        acceptOffer,
        sendStream,
        remoteStream,
        setFinalAnswer,
        addIceCandidate,
      }}
    >
      {children}
    </PeerContext.Provider>
  );
};
