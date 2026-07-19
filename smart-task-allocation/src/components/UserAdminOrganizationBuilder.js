"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import OrganizationCanvas from "@/components/OrganizationCanvas";

const emptyForm = {
  organizationName: "",
  organizationCode: "",
  organizationEmail: "",
  organizationType: "",
  logoUrl: "",
  departments: [{ id: null, name: "" }],
};

function initialFromName(name) {
  return (name || "User").trim().charAt(0).toUpperCase() || "U";
}

function displayName(account) {
  return account.full_name || account.username || account.email || "User";
}

function fieldClass() {
  return "h-10 rounded-full border border-black/60 bg-white/40 px-4 text-sm text-[#061a40] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";
}

function AccountAvatar({ account, size = "h-10 w-10", textSize = "text-sm" }) {
  const name = displayName(account);

  return (
    <span
      className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#6b7280] ${textSize} font-bold text-white`}
    >
      {account.profile_picture_url ? (
        <Image
          src={account.profile_picture_url}
          alt={`${name} profile`}
          fill
          sizes="48px"
          className="object-cover"
        />
      ) : (
        initialFromName(name)
      )}
    </span>
  );
}

export default function UserAdminOrganizationBuilder() {
  const [organization, setOrganization] = useState(null);
  const [departments, setDepartments] = useState([]);
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
    setDepartments(payload.departments ?? []);
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

  function updateDepartment(index, value) {
    setForm((current) => ({
      ...current,
      departments: current.departments.map((department, departmentIndex) =>
        departmentIndex === index ? { ...department, name: value } : department
      ),
    }));
  }

  function addDepartmentField() {
    setForm((current) => ({
      ...current,
      departments: [...current.departments, { id: null, name: "" }],
    }));
  }

  function openOrganizationEditor() {
    setForm({
      organizationName: organization?.organization_name ?? "",
      organizationCode: organization?.organization_code ?? "",
      organizationEmail: organization?.organization_email ?? "",
      organizationType: organization?.organization_type ?? "",
      logoUrl: organization?.logo_url ?? "",
      departments: departments.length
        ? [
            ...departments.map((department) => ({
              id: department.department_id,
              name: department.department_name,
            })),
            { id: null, name: "" },
          ]
        : [{ id: null, name: "" }],
    });
    setIsSetupOpen(true);
  }

  function removeDepartmentField(index) {
    setForm((current) => ({
      ...current,
      departments:
        current.departments.length === 1
          ? [{ id: null, name: "" }]
          : current.departments.filter((_, departmentIndex) => departmentIndex !== index),
    }));
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
        <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
          <div className="shrink-0 text-center">
            <button
              type="button"
              onClick={openOrganizationEditor}
              className="inline-flex items-center gap-2 rounded-md px-2 text-4xl font-semibold text-black transition hover:bg-[#e8f3ff]"
            >
              {organization.organization_name}
              <span className="text-2xl text-[#667085]">⌄</span>
            </button>
            <p className="mt-2 text-sm text-[#667085]">
              Drag people to reposition them, drag from a dot to connect two people freely.
            </p>
          </div>

          <div className="mt-6 min-h-0 flex-1">
            <OrganizationCanvas onAccountClick={setSelectedAccount} />
          </div>
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
          onAddDepartment={addDepartmentField}
          onClose={() => setIsSetupOpen(false)}
          onRemoveDepartment={removeDepartmentField}
          onSubmit={submitOrganization}
          onUpdateDepartment={updateDepartment}
          onUpdateForm={updateForm}
        />
      ) : null}

      {selectedAccount ? (
        <AccountDetailModal
          account={selectedAccount}
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
  onAddDepartment,
  onClose,
  onRemoveDepartment,
  onSubmit,
  onUpdateDepartment,
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

        <div className="mt-3 space-y-2">
          {form.departments.map((department, index) => (
            <div key={`department-${index}`} className="flex gap-2">
              <input
                value={department.name}
                onChange={(event) => onUpdateDepartment(index, event.target.value)}
                placeholder="Department optional"
                className={`min-w-0 flex-1 ${fieldClass()}`}
              />
              <button
                type="button"
                onClick={() => onRemoveDepartment(index)}
                className="h-10 w-10 rounded-full bg-white text-lg font-bold text-[#061a40] hover:bg-[#eef6ff]"
                aria-label="Remove department"
              >
                -
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onAddDepartment}
            className="h-10 rounded-full bg-white px-4 text-xl font-bold text-[#061a40] hover:bg-[#eef6ff]"
            aria-label="Add department"
          >
            +
          </button>
          <div className="flex gap-2">
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
        </div>
      </form>
    </div>
  );
}

function AccountDetailModal({ account, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AccountAvatar account={account} size="h-16 w-16" textSize="text-xl" />
            <div>
              <h2 className="text-2xl font-bold text-[#061a40]">{displayName(account)}</h2>
              <p className="text-sm text-[#667085]">{account.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xl font-bold text-[#667085] hover:bg-[#eef6ff]"
            aria-label="Close profile"
          >
            x
          </button>
        </div>

        <dl className="mt-6 grid gap-4 text-sm">
          <div>
            <dt className="font-bold uppercase tracking-wide text-[#667085]">Role</dt>
            <dd className="mt-1 text-[#061a40]">{account.role?.role_name ?? "User"}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wide text-[#667085]">Department</dt>
            <dd className="mt-1 text-[#061a40]">
              {account.department?.department_name ?? "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase tracking-wide text-[#667085]">Status</dt>
            <dd className="mt-1 text-[#061a40]">
              {account.account_status ?? "Unknown"}
            </dd>
          </div>
          {account.bio ? (
            <div>
              <dt className="font-bold uppercase tracking-wide text-[#667085]">Bio</dt>
              <dd className="mt-1 text-[#061a40]">{account.bio}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
