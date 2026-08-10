-- Metadata for documents uploaded to an agent's knowledge base. The file
-- content itself lives in the "agent-knowledge" storage bucket (raw backup)
-- and in Foundry's vector store (chunked/embedded for retrieval) — this row
-- just links the two together for the Agent page's Knowledge section.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
create table if not exists public.agent_knowledge_file (
  agent_knowledge_file_id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agent (agent_id) on delete cascade,
  foundry_file_id text not null,
  filename text not null,
  storage_path text not null,
  file_size_bytes bigint,
  uploaded_by uuid not null references public.user_account (user_id),
  created_at timestamptz not null default now()
);

create index if not exists agent_knowledge_file_agent_id_idx on public.agent_knowledge_file (agent_id);
