"use client";

import { useMemo, useState } from "react";

function Selector({ label, options, value, onChange, placeholder, searchable = false, dark = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => String(option.value) === String(value));
  const visibleOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options;
  }, [options, search]);

  return (
    <div className="relative">
      <p className={`mb-1.5 text-sm font-medium ${dark ? "text-white/90" : "text-[#94a3b8] uppercase tracking-wide"}`}>{label}</p>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex w-full items-center justify-between border px-5 py-3 text-left text-sm font-medium transition ${dark
          ? `rounded-md bg-black/40 text-white ${isOpen ? "border-white/60 ring-2 ring-white/20" : "border-white/40"}`
          : `rounded-full bg-white/60 text-[#0D1E4C] ${isOpen ? "border-[#0D1E4C]" : "border-slate-200"}`
        }`}
      >
        <span className={selected ? "" : dark ? "text-white/40" : "text-[#94a3b8]"}>{selected?.label ?? placeholder}</span>
        <span className="material-symbols-outlined" style={{ fontSize: "22px" }} aria-hidden="true">
          {isOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-3xl border border-white/60 bg-white/90 p-3 shadow-[0_20px_50px_rgba(13,30,76,0.18)] backdrop-blur-xl">
          {searchable ? (
            <div className="relative mb-2">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" style={{ fontSize: "19px" }} aria-hidden="true">search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search organizations"
                autoFocus
                className="h-10 w-full rounded-full border border-slate-200 bg-white/70 pl-10 pr-4 text-sm text-[#0D1E4C] outline-none placeholder:text-[#94a3b8] focus:border-[#2563EB]"
              />
            </div>
          ) : null}
          <div className="max-h-48 overflow-y-auto">
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(String(option.value));
                  setIsOpen(false);
                  setSearch("");
                }}
                className={`flex w-full items-center justify-between rounded-full px-4 py-2.5 text-left text-sm font-bold transition hover:bg-white ${String(option.value) === String(value) ? "text-[#2563EB]" : "text-[#0D1E4C]"}`}
              >
                {option.label}
                {String(option.value) === String(value) ? <span className="material-symbols-outlined text-lg">check</span> : null}
              </button>
            ))}
            {!visibleOptions.length ? <p className="px-4 py-3 text-sm text-[#94a3b8]">No matching organizations.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AssignmentSelectors({ roleId, setRoleId, organizationId, setOrganizationId, roles, organizations, dark = false }) {
  return (
    <div className="space-y-4">
      <Selector
        label="Role"
        options={roles.map((role) => ({ value: role.role_id, label: role.role_name }))}
        value={roleId}
        onChange={setRoleId}
        placeholder="Select a role"
        dark={dark}
      />
      <Selector
        label="Organization"
        options={organizations.map((organization) => ({ value: organization.organization_id, label: organization.organization_name }))}
        value={organizationId}
        onChange={setOrganizationId}
        placeholder="Select an organization"
        searchable
        dark={dark}
      />
    </div>
  );
}
