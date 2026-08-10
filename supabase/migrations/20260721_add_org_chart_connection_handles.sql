-- Persists which side of each avatar a connection was drawn from/to (top,
-- right, bottom, left) so a manually-drawn left/right connection doesn't
-- snap back to the default top/bottom anchors on reload.
-- Run this in the Supabase SQL editor (Database > SQL Editor) for your project.
alter table public.org_chart_connection
  add column if not exists from_handle text,
  add column if not exists to_handle text;
