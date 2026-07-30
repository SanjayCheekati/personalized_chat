"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// Web Audio API Ringtone Synthesizer (0 external mp3 asset dependencies)
function startSyntheticRingtone(type = "incoming") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    let intervalId;

    const playPulse = () => {
      if (ctx.state === "suspended") ctx.resume();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq1 = type === "incoming" ? 440 : 480;
      const freq2 = type === "incoming" ? 480 : 520;

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
      osc2.frequency.setValueAtTime(freq2, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (type === "incoming" ? 1.5 : 1.0));

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + (type === "incoming" ? 1.5 : 1.0));
      osc2.stop(ctx.currentTime + (type === "incoming" ? 1.5 : 1.0));
    };

    playPulse();
    intervalId = setInterval(playPulse, type === "incoming" ? 2500 : 3000);

    return () => {
      clearInterval(intervalId);
      ctx.close().catch(() => {});
    };
  } catch (e) {
    return () => {};
  }
}

export default function VoiceCallModal({ socket, activeRoomId, peerName, currentUserId, onCallStateChange }) {
  const [callState, setCallState] = useState("idle"); // idle | calling | incoming | connected
  const [callerName, setCallerName] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  const pendingCandidates = useRef([]);

  // Cleanup helper
  const endCallCleanly = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidates.current = [];
    setCallState("idle");
    setCallDuration(0);
    setIsMuted(false);
    onCallStateChange?.("idle");
  }, [onCallStateChange]);

  // Start Call Duration Timer
  const startTimer = useCallback(() => {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // Format Duration string
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Create RTCPeerConnection instance
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc_signal", {
          signal: { type: "candidate", candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pcRef.current = pc;
    return pc;
  }, [socket]);

  // Initiate a Call
  const initiateCall = useCallback(async () => {
    if (!socket || !activeRoomId) return;

    try {
      setCallState("calling");
      onCallStateChange?.("calling");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call_user", { signal: { type: "offer", sdp: offer.sdp } });
    } catch (err) {
      console.error("Failed to start voice call:", err);
      alert("Could not access microphone.");
      endCallCleanly();
    }
  }, [socket, activeRoomId, createPeerConnection, endCallCleanly, onCallStateChange]);

  // Accept Incoming Call
  const acceptCall = async () => {
    if (!socket || !activeRoomId) return;

    try {
      setCallState("connected");
      onCallStateChange?.("connected");
      startTimer();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Process queued candidates if any
      while (pendingCandidates.current.length > 0) {
        const candidate = pendingCandidates.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("accept_call", { signal: { type: "answer", sdp: answer.sdp } });
    } catch (err) {
      console.error("Failed to accept call:", err);
      alert("Could not access microphone.");
      socket.emit("reject_call");
      endCallCleanly();
    }
  };

  // Decline/Reject Incoming Call
  const rejectCall = () => {
    socket?.emit("reject_call");
    endCallCleanly();
  };

  // Hangup Active Call
  const terminateCall = () => {
    socket?.emit("end_call");
    endCallCleanly();
  };

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  // Ringtone sound effect
  useEffect(() => {
    if (callState === "incoming") {
      const stopRingtone = startSyntheticRingtone("incoming");
      return () => stopRingtone();
    }
    if (callState === "calling") {
      const stopRingtone = startSyntheticRingtone("outgoing");
      return () => stopRingtone();
    }
  }, [callState]);

  // Handle Socket Events
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = async (data) => {
      setCallerName(data.callerName || peerName || "Someone");
      setCallState("incoming");
      onCallStateChange?.("incoming");

      // Save SDP Offer in peer connection
      const pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    };

    const handleCallAccepted = async (data) => {
      if (pcRef.current && data.signal) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.signal));
        setCallState("connected");
        onCallStateChange?.("connected");
        startTimer();
      }
    };

    const handleCallRejected = () => {
      alert("Call declined.");
      endCallCleanly();
    };

    const handleCallEnded = () => {
      endCallCleanly();
    };

    const handleWebRTCSignal = async (data) => {
      const { signal } = data;
      if (!signal) return;

      if (signal.type === "candidate") {
        if (pcRef.current && pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingCandidates.current.push(signal.candidate);
        }
      }
    };

    socket.on("incoming_call", handleIncomingCall);
    socket.on("call_accepted", handleCallAccepted);
    socket.on("call_rejected", handleCallRejected);
    socket.on("call_ended", handleCallEnded);
    socket.on("webrtc_signal", handleWebRTCSignal);

    return () => {
      socket.off("incoming_call", handleIncomingCall);
      socket.off("call_accepted", handleCallAccepted);
      socket.off("call_rejected", handleCallRejected);
      socket.off("call_ended", handleCallEnded);
      socket.off("webrtc_signal", handleWebRTCSignal);
    };
  }, [socket, peerName, createPeerConnection, startTimer, endCallCleanly, onCallStateChange]);

  // Expose call trigger to window
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__triggerVoiceCall = initiateCall;
    }
  }, [initiateCall]);

  return (
    <>
      {/* Remote Audio Element */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Calling / Outgoing State Modal */}
      {callState === "calling" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4">
          <div className="glass-card flex w-full max-w-sm flex-col items-center rounded-3xl p-6 text-center shadow-2xl">
            <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#00a884] to-[#005c4b] text-2xl font-bold text-white shadow-lg">
              {(peerName || "User").slice(0, 2).toUpperCase()}
              <span className="absolute inset-0 rounded-full border-2 border-[var(--accent)] animate-ping opacity-75" />
            </div>
            <h3 className="text-lg font-bold text-[var(--ink)]">{peerName || "User"}</h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)] animate-pulse">Calling…</p>

            <button
              type="button"
              onClick={terminateCall}
              className="mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110 active:scale-95"
            >
              <PhoneEndIcon />
            </button>
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {callState === "incoming" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in p-4">
          <div className="glass-card flex w-full max-w-sm flex-col items-center rounded-3xl p-6 text-center shadow-2xl border border-[var(--accent)]/30">
            <div className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#00a884] to-[#005c4b] text-2xl font-bold text-white shadow-lg">
              {(callerName || "User").slice(0, 2).toUpperCase()}
              <span className="absolute -inset-2 rounded-full border-2 border-emerald-400 animate-ping opacity-60" />
            </div>
            <h3 className="text-lg font-bold text-[var(--ink)]">{callerName}</h3>
            <p className="mt-1 text-xs font-semibold text-emerald-400">Incoming Voice Call 📞</p>

            <div className="mt-8 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={rejectCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110 active:scale-95"
                title="Decline"
              >
                <PhoneEndIcon />
              </button>

              <button
                type="button"
                onClick={acceptCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-110 active:scale-95 animate-bounce"
                title="Accept"
              >
                <PhoneCallIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ongoing Connected Call Floating Bar */}
      {callState === "connected" && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="glass-card flex items-center gap-4 rounded-full px-5 py-2.5 shadow-2xl border border-emerald-500/40 bg-[var(--panel-dark)]/90">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-[var(--ink)]">{peerName || "Call"}</span>
              <span className="text-xs text-[var(--ink-soft)] font-mono">{formatDuration(callDuration)}</span>
            </div>

            <div className="h-4 w-[1px] bg-[var(--panel-border)]" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                  isMuted ? "bg-amber-500/20 text-amber-400" : "bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--panel-border)]"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOffIcon /> : <MicIcon />}
              </button>

              <button
                type="button"
                onClick={terminateCall}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:scale-105 active:scale-95"
                title="End Call"
              >
                <PhoneEndIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PhoneCallIcon({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden="true">
      <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function PhoneEndIcon({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} fill-current`} aria-hidden="true">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72a1 1 0 0 0-.7.97v3.25a1 1 0 0 0 .59.91c1.5.7 3.15 1.15 4.71 1.15 1.56 0 3.21-.45 4.71-1.15a1 1 0 0 0 .59-.91V10.69a1 1 0 0 0-.7-.97A14.6 14.6 0 0 0 12 9z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l-1.98-1.98c.03-.06.03-.12.03-.19V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.17L4.27 3 3 4.27l18 18L22.27 21l-7.29-7.29-1.98-1.98-.02-.56zM12 14c-1.66 0-3-1.34-3-3V9.17l6 6V11c0 1.66-1.34 3-3 3z" />
    </svg>
  );
}
