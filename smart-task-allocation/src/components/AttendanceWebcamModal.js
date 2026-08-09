"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const MODEL_URL = "/models";
// face-api.js's own docs recommend 0.6 as the euclidean-distance cutoff for
// the face recognition net (based on the Labeled Faces in the Wild benchmark).
const MATCH_THRESHOLD = 0.6;

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

// The DB server's own "today" can disagree with the user's local calendar
// day near a timezone boundary — send the browser's local date explicitly
// so clock-ins are always grouped under the day the user actually sees.
function localDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// "2 hrs 10 mins" — computed from the actual timestamps rather than the
// server's rounded total_hours decimal.
function formatWorkedDuration(clockInAt, clockOutAt) {
  if (!clockInAt || !clockOutAt) return "";
  const totalMinutes = Math.max(
    0,
    Math.round((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} min${minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

async function authHeaders() {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AttendanceWebcamModal({ profile, isClockedIn, onClose, onSuccess }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const referenceDescriptorRef = useRef(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const faceapi = await import("face-api.js");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) {
          faceapiRef.current = faceapi;
          setModelsReady(true);
        }
      } catch {
        if (!cancelled) setLoadError("Could not load the face verification models.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!modelsReady) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) setCameraError("Could not access your camera. Allow camera permission and try again.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [modelsReady]);

  async function getReferenceDescriptor() {
    if (referenceDescriptorRef.current) return referenceDescriptorRef.current;
    if (!profile?.profile_picture_url) {
      throw new Error("No profile picture on file. Add one from your profile card before using face clock-in.");
    }

    const faceapi = faceapiRef.current;
    const img = await faceapi.fetchImage(profile.profile_picture_url);
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      throw new Error("Could not detect a face in your profile picture. Update it and try again.");
    }

    referenceDescriptorRef.current = detection.descriptor;
    return detection.descriptor;
  }

  async function handleCapture() {
    if (!videoRef.current || isProcessing || !cameraReady) return;
    setIsProcessing(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      const faceapi = faceapiRef.current;
      const referenceDescriptor = await getReferenceDescriptor();

      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatusTone("error");
        setStatusMessage("No face detected. Center your face in the frame.");
        return;
      }

      const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
      const verified = distance < MATCH_THRESHOLD;

      if (!verified) {
        setStatusTone("error");
        setStatusMessage("Face verification failed.");
        return;
      }

      const action = isClockedIn ? "clock_out" : "clock_in";
      const headers = await authHeaders();
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, verified, distance, workDate: localDateStr() }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save your attendance.");
      }

      setStatusTone("success");
      if (action === "clock_in") {
        const name = profile?.full_name || profile?.username || "there";
        setStatusMessage(`Verified — ${greetingForNow()}, ${name}!`);
      } else {
        const worked = formatWorkedDuration(result.record.clock_in_at, result.record.clock_out_at);
        setStatusMessage(`Verified — clocked out. Total: ${worked}`);
      }

      onSuccess?.(result.record);
      setTimeout(() => onClose?.(), 1200);
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error.message);
    } finally {
      setIsProcessing(false);
    }
  }

  const isBusy = !modelsReady || !cameraReady;
  const buttonLabel = isClockedIn ? "Clock Out" : "Clock In";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative aspect-square w-full max-w-md overflow-hidden rounded-[32px] bg-black"
        onClick={(event) => event.stopPropagation()}
      >
        {loadError ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-white">
            {loadError}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full -scale-x-100 rounded-[32px] object-cover"
            />
            {isBusy && !cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm font-bold text-white">
                {modelsReady ? "Starting camera…" : "Loading face verification models…"}
              </div>
            ) : null}
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm font-bold text-white">
                {cameraError}
              </div>
            ) : null}
          </>
        )}

        <div className="absolute inset-x-0 top-4 flex justify-center px-4">
          <span className="rounded-full border border-white/65 bg-white/20 px-4 py-2 text-sm font-black text-white backdrop-blur-md">
            Face Verification
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/65 bg-white/20 text-white backdrop-blur-md transition hover:scale-110"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            close
          </span>
        </button>

        {!loadError ? (
          <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-6">
            {statusMessage ? (
              <p
                className={`w-full rounded-full border px-4 py-2 text-center text-sm font-bold backdrop-blur-md ${
                  statusTone === "success"
                    ? "border-emerald-300/60 bg-emerald-500/30 text-white"
                    : statusTone === "error"
                      ? "border-red-300/60 bg-red-500/30 text-white"
                      : "border-white/40 bg-black/30 text-white"
                }`}
              >
                {statusMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleCapture}
              disabled={isBusy || isProcessing}
              className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isClockedIn ? "bg-red-600 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-800"
              }`}
            >
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                familiar_face_and_zone
              </span>
              {isProcessing ? "Verifying…" : buttonLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
