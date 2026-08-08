"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const GENDER_OPTIONS = ["Male", "Female", "Prefer not to say"];

function initialFromName(name) {
  return (name || "User").trim().charAt(0).toUpperCase() || "U";
}

function draftFromProfile(profile) {
  return {
    username: profile.username ?? "",
    email: profile.email ?? "",
    full_name: profile.full_name ?? "",
    job_title: profile.job_title ?? "",
    phone_number: profile.phone_number ?? "",
    address: profile.address ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    gender: profile.gender ?? "",
  };
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function InfoRow({ icon, placeholder, value, isEditMode, onChange, type = "text", options, displayValue }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="material-symbols-outlined shrink-0 text-[#0D1E4C]"
        style={{ fontSize: "22px" }}
        aria-hidden="true"
      >
        {icon}
      </span>
      {isEditMode ? (
        type === "select" ? (
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-2 text-base font-bold text-[#061a40] outline-none"
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-2 text-base font-bold text-[#061a40] outline-none"
          />
        )
      ) : (
        <span className="min-w-0 flex-1 truncate text-base font-medium text-[#061a40]">
          {value ? (displayValue ?? value) : <span className="text-[#94a3b8]">{placeholder}</span>}
        </span>
      )}
    </div>
  );
}

const EMPTY_PROFILE = {
  username: "",
  email: "",
  full_name: "",
  job_title: "",
  phone_number: "",
  address: "",
  date_of_birth: "",
  gender: "",
  profile_picture_url: "",
  role_name: "",
  department_name: "",
  skills: [],
  qualifications: [],
};

export default function ProfileDetailCard({ onClose, userId, viewOnly = false }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [draft, setDraft] = useState(null);
  const [skillDraft, setSkillDraft] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  const [skillCatalog, setSkillCatalog] = useState([]);
  const [qualificationDraft, setQualificationDraft] = useState([]);
  const [qualificationInput, setQualificationInput] = useState("");
  const fileInputRef = useRef(null);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  }

  async function loadProfile() {
    setLoadError("");
    try {
      const url = userId ? `/api/my-profile?userId=${encodeURIComponent(userId)}` : "/api/my-profile";
      const response = await fetch(url, { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not load this profile.");
      }
      setProfile(result.profile);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadProfile, 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isEditMode) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/skills", { headers: await authHeaders() });
        const result = await response.json();
        if (!cancelled && response.ok) {
          setSkillCatalog(result.skills ?? []);
        }
      } catch {
        // best-effort; the skill input still works without suggestions
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode]);

  function enterEditMode() {
    setDraft(draftFromProfile(profile));
    setSkillDraft(profile.skills.map((skill) => skill.skill_name));
    setSkillInput("");
    setQualificationDraft([...profile.qualifications]);
    setQualificationInput("");
    setIsEditMode(true);
  }

  function updateDraftField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function addSkill(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (skillDraft.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      setSkillInput("");
      return;
    }
    setSkillDraft((current) => [...current, trimmed]);
    setSkillInput("");
  }

  function removeSkill(name) {
    setSkillDraft((current) => current.filter((existing) => existing !== name));
  }

  function addQualification(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (qualificationDraft.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      setQualificationInput("");
      return;
    }
    setQualificationDraft((current) => [...current, trimmed]);
    setQualificationInput("");
  }

  function removeQualification(index) {
    setQualificationDraft((current) => current.filter((_, i) => i !== index));
  }

  async function saveAndExitEditMode() {
    setIsSaving(true);
    setActionError("");
    try {
      const response = await fetch("/api/my-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          username: draft.username,
          email: draft.email,
          fullName: draft.full_name,
          jobTitle: draft.job_title,
          phoneNumber: draft.phone_number,
          address: draft.address,
          dateOfBirth: draft.date_of_birth,
          gender: draft.gender,
          skillNames: skillDraft,
          qualifications: qualificationDraft,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save your profile.");
      }
      setProfile(result.profile);
      setIsEditMode(false);
      setDraft(null);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploadingAvatar(true);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/my-profile/avatar", {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not upload your photo.");
      }
      setProfile((current) => ({ ...current, profile_picture_url: result.profile_picture_url }));
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const name = profile?.full_name || profile?.username || profile?.email || "Profile";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center 0 bg-white/60 px-4">
      <div className="relative w-full max-w-sm max-h-[90vh] overflow-hidden rounded-[40px] shadow-2xl">
        {loadError ? (
          <div className="bg-white p-6">
            <div className="py-6 text-center">
              <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {loadError}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-full bg-black/10 px-5 py-2 text-sm font-bold text-black hover:bg-black/15"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="pointer-events-none absolute inset-0 z-0 rounded-[40px] border border-white/65 backdrop-blur-xs"
              style={{
                background: "linear-gradient(to bottom, #ffffff 0px, #ffffff 240px, rgba(255,255,255,0) 440px)",
              }}
            />

            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-120 hover:bg-white/70"
              aria-label="Close profile"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                close
              </span>
            </button>

            {viewOnly ? null : (
              <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSaving || isLoading}
                  onClick={isEditMode ? saveAndExitEditMode : enterEditMode}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#0D1E4C] backdrop-blur-sm transition hover:scale-120 hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  aria-label={isEditMode ? "Save profile" : "Edit profile"}
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    {isEditMode ? "edit_off" : "edit"}
                  </span>
                </button>
              </div>
            )}

            <div className="relative z-10 max-h-[90vh] overflow-y-auto rounded-[40px]">
              <div className="flex flex-col items-center px-6 pt-10">
                <button
                  type="button"
                  onClick={() => (isEditMode ? fileInputRef.current?.click() : null)}
                  disabled={!isEditMode || isUploadingAvatar}
                  className="group relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#6b7280] text-3xl font-bold text-white"
                  aria-label={isEditMode ? "Change profile photo" : undefined}
                >
                  {profile.profile_picture_url ? (
                    <Image
                      src={profile.profile_picture_url}
                      alt={`${name} profile`}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                  ) : (
                    initialFromName(name)
                  )}
                  {isEditMode ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold opacity-0 transition group-hover:opacity-100">
                      {isUploadingAvatar ? "Uploading..." : "Change"}
                    </span>
                  ) : null}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />

                {isEditMode ? (
                  <input
                    value={draft.full_name}
                    onChange={(event) => updateDraftField("full_name", event.target.value)}
                    placeholder="Full name"
                    className="mt-4 w-full rounded-full border border-black/10 bg-white px-3 py-1.5 text-center text-lg font-bold text-[#061a40] outline-none"
                  />
                ) : (
                  <h2 className="mt-4 truncate text-center text-2xl font-bold text-[#061a40]">{name}</h2>
                )}

                {isEditMode ? (
                  <div className="mt-2 flex w-full items-center gap-3 px-2">
                    <span
                      className="material-symbols-outlined shrink-0 text-[#0D1E4C]"
                      style={{ fontSize: "22px" }}
                      aria-hidden="true"
                    >
                      business_center
                    </span>
                    <input
                      value={draft.job_title}
                      onChange={(event) => updateDraftField("job_title", event.target.value)}
                      placeholder="Job title"
                      className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-1.5 text-base font-bold text-[#061a40] outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-base font-medium text-[#667085]">
                    <span className="material-symbols-outlined text-[#0D1E4C]" style={{ fontSize: "22px" }} aria-hidden="true">
                      business_center
                    </span>
                    <span>{profile.job_title || "No job title"}</span>
                  </div>
                )}
              </div>

              {actionError ? (
                <p className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                  {actionError}
                </p>
              ) : null}

              <div className="mt-6 space-y-4 pl-12 pr-6">
                <InfoRow
                  icon="alternate_email"
                  placeholder="Username"
                  value={isEditMode ? draft.username : profile.username}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("username", value)}
                />
                <InfoRow
                  icon="mail"
                  placeholder="Email"
                  type="email"
                  value={isEditMode ? draft.email : profile.email}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("email", value)}
                />
                <InfoRow
                  icon="mobile_3"
                  placeholder="Phone number"
                  type="tel"
                  value={isEditMode ? draft.phone_number : profile.phone_number}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("phone_number", value)}
                />
                <InfoRow
                  icon="cake"
                  placeholder="Date of birth"
                  type="date"
                  value={isEditMode ? draft.date_of_birth : profile.date_of_birth}
                  displayValue={formatDate(profile.date_of_birth)}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("date_of_birth", value)}
                />
                <InfoRow
                  icon="wc"
                  placeholder="Gender"
                  type="select"
                  options={GENDER_OPTIONS}
                  value={isEditMode ? draft.gender : profile.gender}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("gender", value)}
                />
                <InfoRow
                  icon="home_pin"
                  placeholder="Address"
                  value={isEditMode ? draft.address : profile.address}
                  isEditMode={isEditMode}
                  onChange={(value) => updateDraftField("address", value)}
                />
              </div>

              <div className="mt-7">
                <div className="flex items-center justify-center gap-2 px-6 text-base font-bold text-[#0D1E4C]">
                  <span className="material-symbols-outlined" style={{ fontSize: "22px" }} aria-hidden="true">
                    school
                  </span>
                  Qualifications
                </div>
                <ul className="mt-2 flex flex-col items-center space-y-1.5 px-6">
                  {(isEditMode ? qualificationDraft : profile.qualifications).map((entry, index) => (
                    <li
                      key={`${entry}-${index}`}
                      className="inline-flex max-w-full items-center gap-2 text-base font-medium text-[#0D1E4C]"
                    >
                      <span className="min-w-0 truncate">{entry}</span>
                      {isEditMode ? (
                        <button
                          type="button"
                          onClick={() => removeQualification(index)}
                          className="shrink-0 text-[#94a3b8] hover:text-[#475569]"
                          aria-label={`Remove ${entry}`}
                        >
                          x
                        </button>
                      ) : null}
                    </li>
                  ))}
                  {!isEditMode && !profile.qualifications.length ? (
                    <li className="text-base font-bold text-[#94a3b8]">No qualifications added yet.</li>
                  ) : null}
                </ul>

                {isEditMode ? (
                  <div className="relative mt-2 px-6">
                    <input
                      value={qualificationInput}
                      onChange={(event) => setQualificationInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addQualification(qualificationInput);
                        }
                      }}
                      placeholder="Add a qualification"
                      className="w-full rounded-full border border-white/65 bg-white/40 py-2 pl-4 pr-12 text-base font-medium text-[#061a40] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addQualification(qualificationInput)}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl font-bold text-black/80 transition hover:scale-110 hover:bg-white"
                      aria-label="Add qualification"
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-7 pb-8">
                <div className="flex items-center justify-center gap-2 px-6 text-base font-bold text-[#0D1E4C]">
                  <span className="material-symbols-outlined" style={{ fontSize: "22px" }} aria-hidden="true">
                    interests
                  </span>
                  Skills
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-2 px-6">
                  {(isEditMode ? skillDraft : profile.skills.map((skill) => skill.skill_name)).map((skillName) => (
                    <span
                      key={skillName}
                      className="flex items-center gap-1.5 rounded-full border-2 border-[#cbd5e1] bg-[#f1f5f9] px-3 py-1.5 text-sm font-bold text-[#475569]"
                    >
                      {skillName}
                      {isEditMode ? (
                        <button
                          type="button"
                          onClick={() => removeSkill(skillName)}
                          className="text-[#94a3b8] hover:text-[#475569]"
                          aria-label={`Remove ${skillName}`}
                        >
                          x
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {!isEditMode && !profile.skills.length ? (
                    <p className="text-base font-bold text-[#94a3b8]">No skills added yet.</p>
                  ) : null}
                </div>

                {isEditMode ? (
                  <div className="relative mt-3 px-6">
                    <input
                      list="profile-skill-catalog"
                      value={skillInput}
                      onChange={(event) => setSkillInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill(skillInput);
                        }
                      }}
                      placeholder="Add a skill"
                      className="w-full rounded-full border border-white/65 bg-white/40 py-2 pl-4 pr-12 text-base font-medium text-[#061a40] outline-none"
                    />
                    <datalist id="profile-skill-catalog">
                      {skillCatalog.map((skill) => (
                        <option key={skill.skill_id} value={skill.skill_name} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => addSkill(skillInput)}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl font-bold text-black/80 transition hover:scale-110 hover:bg-white"
                      aria-label="Add skill"
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
