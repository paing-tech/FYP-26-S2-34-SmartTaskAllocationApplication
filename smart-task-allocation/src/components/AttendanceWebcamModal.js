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
        setStatusMessage("No face detected. Center your face in the frame and try again.");
        return;
      }

      const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
      const verified = distance < MATCH_THRESHOLD;

      if (!verified) {
        setStatusTone("error");
        setStatusMessage("Face not verified — this doesn't match your profile picture.");
        return;
      }

      const action = isClockedIn ? "clock_out" : "clock_in";
      const headers = await authHeaders();
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, verified, distance }),
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
        setStatusMessage(`Verified — clocked out. Total hours: ${result.record.total_hours}`);
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-[0_28px_80px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm font-black text-[#0D1E4C]">Face Verification</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#0D1E4C] transition hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        {loadError ? (
          <p className="mx-5 mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </p>
        ) : (
          <>
            <div className="relative mx-5 aspect-square overflow-hidden rounded-[24px] bg-black/80">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
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
            </div>

            <div className="p-5">
              <button
                type="button"
                onClick={handleCapture}
                disabled={isBusy || isProcessing}
                className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isClockedIn ? "bg-red-600 hover:bg-red-700" : "bg-[#0D1E4C] hover:bg-[#0a1638]"
                }`}
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                  familiar_face_and_zone
                </span>
                {isProcessing ? "Verifying…" : buttonLabel}
              </button>

              {statusMessage ? (
                <p
                  className={`mt-3 rounded-md border px-3 py-2 text-center text-sm font-bold ${
                    statusTone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : statusTone === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-transparent text-[#52627a]"
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
