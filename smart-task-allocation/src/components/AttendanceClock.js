"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import GlassSurface from "@/components/ui/glass-surface";

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

function formatClockTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function AttendanceClock() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceapiRef = useRef(null);
  const referenceDescriptorRef = useRef(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState(null);
  const [record, setRecord] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [profileResponse, attendanceResponse] = await Promise.all([
        fetch("/api/my-profile", { headers }),
        fetch("/api/attendance", { headers }),
      ]);
      const profileResult = await profileResponse.json();
      const attendanceResult = await attendanceResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileResult.error || "Could not load your profile.");
      }
      if (!attendanceResponse.ok) {
        throw new Error(attendanceResult.error || "Could not load attendance status.");
      }
      setProfile(profileResult.profile);
      setRecord(attendanceResult.record);
    } catch (error) {
      setLoadError(error.message);
    }
  }, [authHeaders]);

  useEffect(() => {
    const timeout = setTimeout(loadData, 0);
    return () => clearTimeout(timeout);
  }, [loadData]);

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
        if (!cancelled) {
          setLoadError("Could not load the face verification models.");
        }
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
        if (!cancelled) {
          setCameraError("Could not access your camera. Allow camera permission and reload this page.");
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [modelsReady]);

  async function getReferenceDescriptor() {
    if (referenceDescriptorRef.current) {
      return referenceDescriptorRef.current;
    }
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

  const isClockedIn = Boolean(record && !record.clock_out_at);

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
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action, verified, distance }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save your attendance.");
      }

      setRecord(result.record);
      setStatusTone("success");
      if (action === "clock_in") {
        const name = profile?.full_name || profile?.username || "there";
        setStatusMessage(`Verified — ${greetingForNow()}, ${name}!`);
      } else {
        setStatusMessage(`Verified — clocked out. Total hours: ${result.record.total_hours}`);
      }
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
    <section className="h-full min-h-0 overflow-hidden">
      <div className="h-full overflow-y-auto pb-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#5d7290]">Team</p>
        <h1 className="mt-2 text-4xl font-black text-[#07183b]">Attendance</h1>
        <p className="mt-3 max-w-2xl text-base font-medium text-[#52627a]">
          Verify your face against your profile picture to clock in and out.
        </p>

        {loadError ? (
          <p className="mt-6 max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {loadError}
          </p>
        ) : (
          <div className="mt-8 grid max-w-4xl gap-6 md:grid-cols-[1fr_320px]">
            <GlassSurface className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black/80">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full -scale-x-100 object-cover"
              />
              {isBusy && !cameraError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-white">
                  {modelsReady ? "Starting camera…" : "Loading face verification models…"}
                </div>
              ) : null}
              {cameraError ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm font-bold text-white">
                  {cameraError}
                </div>
              ) : null}
            </GlassSurface>

            <GlassSurface className="flex flex-col gap-4 bg-white/40 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#5d7290]">Status</p>
                <p className="mt-1 text-lg font-black text-[#07183b]">
                  {isClockedIn ? "Clocked In" : "Not Clocked In"}
                </p>
                {record?.clock_in_at ? (
                  <p className="mt-1 text-sm font-bold text-[#52627a]">
                    In: {formatClockTime(record.clock_in_at)}
                    {record.clock_out_at ? ` · Out: ${formatClockTime(record.clock_out_at)}` : ""}
                  </p>
                ) : null}
                {record?.total_hours != null ? (
                  <p className="mt-1 text-sm font-bold text-[#52627a]">Total hours: {record.total_hours}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleCapture}
                disabled={isBusy || isProcessing}
                className="flex items-center justify-center gap-2 rounded-full bg-[#0D1E4C] px-5 py-3 text-base font-bold text-white transition hover:bg-[#0a1638] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  photo_camera
                </span>
                {isProcessing ? "Verifying…" : buttonLabel}
              </button>

              {statusMessage ? (
                <p
                  className={
                    statusTone === "success"
                      ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
                      : statusTone === "error"
                        ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                        : "text-sm font-bold text-[#52627a]"
                  }
                >
                  {statusMessage}
                </p>
              ) : null}
            </GlassSurface>
          </div>
        )}
      </div>
    </section>
  );
}
