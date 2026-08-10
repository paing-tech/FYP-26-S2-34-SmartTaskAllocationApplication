-- Images can't be attached to a Foundry vector store (file_search rejects
-- them — confirmed live), so they skip that step entirely and have no
-- foundry_file_id; mime_type lets the messages route find them to attach as
-- real vision input instead.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.agent_knowledge_file add column if not exists mime_type text;
alter table public.agent_knowledge_file alter column foundry_file_id drop not null;
