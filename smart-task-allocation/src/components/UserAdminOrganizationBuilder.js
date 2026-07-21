"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import OrganizationCanvas from "@/components/OrganizationCanvas";
import ProfileDetailCard from "@/components/ProfileDetailCard";

const emptyForm = {
  organizationName: "",
  organizationCode: "",
  organizationEmail: "",
  organizationType: "",
  logoUrl: "",
};

function fieldClass() {
  return "h-10 rounded-full border border-black/60 bg-white/40 px-4 text-sm text-[#061a40] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";
}

export default function UserAdminOrganizationBuilder() {
  const [organization, setOrganization] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function authHeaders() {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();

    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  function applyPayload(payload) {
    setOrganization(payload.organization ?? null);
  }

  async function loadOrganization() {
    setError("");

    try {
      const response = await fetch("/api/my-organization", {
        headers: await authHeaders(),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load organization.");
      }

      applyPayload(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(loadOrganization, 0);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function updateOrganizationField(patch) {
    if (!organization) return;

    setError("");

    try {
      const response = await fetch("/api/my-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          organizationName: patch.organization_name ?? organization.organization_name,
          organizationCode: patch.organization_code ?? organization.organization_code,
          organizationEmail: patch.organization_email ?? organization.organization_email,
          organizationType: patch.organization_type ?? organization.organization_type,
          logoUrl: patch.logo_url ?? organization.logo_url,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not update organization.");
      }

      applyPayload(result);
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function submitOrganization(event) {
    event.preventDefault();
    setError("");
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

      applyPayload(result);
      setIsSetupOpen(false);
      setForm(emptyForm);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      {error ? (
        <p className="mx-6 mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#52627a]">
          Loading organization...
        </div>
      ) : organization ? (
        <div className="min-h-0 flex-1">
          <OrganizationCanvas
            organization={organization}
            onAccountClick={setSelectedAccount}
            onUpdateOrganization={updateOrganizationField}
          />
        </div>
      ) : (
        <div className="flex h-full min-h-[520px] items-center justify-center rounded-[32px] bg-[#fffafa]">
          <div className="text-center">
            <h1 className="text-4xl font-medium text-black">Organization</h1>
            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              className="mt-8 rounded-full bg-black/10 px-6 py-2 text-sm font-semibold text-black transition hover:bg-black/15"
            >
              Set up
            </button>
          </div>
        </div>
      )}

      {isSetupOpen ? (
        <OrganizationSetupModal
          form={form}
          isEditing={Boolean(organization)}
          isSubmitting={isSubmitting}
          onClose={() => setIsSetupOpen(false)}
          onSubmit={submitOrganization}
          onUpdateForm={updateForm}
        />
      ) : null}

      {selectedAccount ? (
        <ProfileDetailCard
          userId={selectedAccount.user_id}
          viewOnly
          onClose={() => setSelectedAccount(null)}
        />
      ) : null}
    </div>
  );
}

function OrganizationSetupModal({
  form,
  isEditing,
  isSubmitting,
  onClose,
  onSubmit,
  onUpdateForm,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xl rounded-[36px] bg-[#d9d9d9] px-10 py-8 shadow-2xl"
      >
        <h2 className="text-center text-xl font-medium text-black">
          {isEditing ? "Edit your organization" : "Set up your organization"}
        </h2>

        <div className="mt-6 grid grid-cols-[1fr_110px] gap-2">
          <input
            value={form.organizationName}
            onChange={(event) => onUpdateForm("organizationName", event.target.value)}
            placeholder="Name"
            required
            className={fieldClass()}
          />
          <input
            value={form.organizationCode}
            onChange={(event) => onUpdateForm("organizationCode", event.target.value)}
            placeholder="Code"
            className={fieldClass()}
          />
        </div>

        <input
          value={form.organizationEmail}
          onChange={(event) => onUpdateForm("organizationEmail", event.target.value)}
          placeholder="Email optional"
          type="email"
          className={`mt-3 w-full ${fieldClass()}`}
        />

        <input
          value={form.organizationType}
          onChange={(event) => onUpdateForm("organizationType", event.target.value)}
          placeholder="Industry"
          className={`mt-3 w-full ${fieldClass()}`}
        />

        <input
          value={form.logoUrl}
          onChange={(event) => onUpdateForm("logoUrl", event.target.value)}
          placeholder="Logo URL optional"
          className={`mt-3 w-full ${fieldClass()}`}
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full bg-white/60 px-5 text-sm font-bold text-[#061a40] hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-full bg-[#2563EB] px-5 text-sm font-bold text-white hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

