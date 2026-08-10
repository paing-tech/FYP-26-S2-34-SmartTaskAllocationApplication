"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function OrganizationProfileForm() {
  const [form, setForm] = useState({
    organizationName: "",
    organizationCode: "",
    organizationEmail: "",
    organizationType: "",
    logoUrl: "",
  });
  const [hasProfile, setHasProfile] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  useEffect(() => {
    async function loadOrganization() {
      try {
        const response = await fetch("/api/my-organization", {
          headers: await authHeaders(),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load organization.");
        }

        if (result.organization) {
          setHasProfile(true);
          setForm({
            organizationName: result.organization.organization_name ?? "",
            organizationCode: result.organization.organization_code ?? "",
            organizationEmail: result.organization.organization_email ?? "",
            organizationType: result.organization.organization_type ?? "",
            logoUrl: result.organization.logo_url ?? "",
          });
        }
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadOrganization();
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/my-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save organization.");
      }

      setHasProfile(true);
      setMessage("Organization profile saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-[#07183b]">
          {hasProfile ? "Update Organization Profile" : "Create Organization Profile"}
        </h2>
        <p className="mt-2 text-sm text-[#52627a]">
          Each User Admin can create one organization profile and update it later.
        </p>
      </div>

      {isLoading ? <p className="mt-6 text-sm text-[#52627a]">Loading organization...</p> : null}

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5 lg:grid-cols-2">
        {[
          ["organizationName", "Organization Name", "text", true],
          ["organizationCode", "Organization Code", "text", false],
          ["organizationEmail", "Organization Email", "email", false],
          ["organizationType", "Organization Type", "text", false],
          ["logoUrl", "Logo URL", "url", false],
        ].map(([field, label, type, required]) => (
          <div key={field} className="space-y-2">
            <label htmlFor={field} className="block text-sm font-medium text-[#061a40]">
              {label}
            </label>
            <input
              id={field}
              type={type}
              value={form[field]}
              onChange={(event) => updateField(field, event.target.value)}
              required={required}
              className="h-11 w-full rounded-md border border-[#b8c4d8] px-3 text-sm outline-none focus:border-[#0a2a66] focus:ring-2 focus:ring-[#0a2a66]/20"
            />
          </div>
        ))}

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 lg:col-span-2">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-[#0a2a66] lg:col-span-2">
            {message}
          </p>
        ) : null}

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 rounded-md bg-[#0a2a66] px-5 text-sm font-bold text-white transition-colors hover:bg-[#061a40] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Saving..." : hasProfile ? "Update Profile" : "Create Profile"}
          </button>
        </div>
      </form>
    </section>
  );
}
