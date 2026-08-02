create or replace function public.apply_discovered_naver_blog_visitor_metrics_v2(
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  with parsed_updates as (
    select *
    from jsonb_to_recordset(p_updates) as item(
      id uuid,
      visitor_status text,
      visitor_average_4d bigint,
      visitor_counts jsonb,
      checked_at timestamptz,
      error_message text
    )
  ),
  updates as (
    select
      id,
      visitor_status,
      case
        when visitor_status = 'available' then visitor_average_4d
        else null
      end as visitor_average_4d,
      case
        when visitor_status = 'available' then coalesce(visitor_counts, '[]'::jsonb)
        else '[]'::jsonb
      end as visitor_counts,
      checked_at,
      nullif(btrim(error_message), '') as error_message
    from parsed_updates
    where
      checked_at is not null
      and visitor_status in ('available', 'unavailable', 'failed')
  )
  update public.discovered_influencer_profiles as profile
  set
    naver_blog_visitor_status = updates.visitor_status,
    naver_blog_visitor_average_4d = updates.visitor_average_4d,
    naver_blog_visitor_counts = updates.visitor_counts,
    naver_blog_visitor_checked_at = updates.checked_at,
    naver_blog_visitor_error = updates.error_message,
    updated_at = greatest(profile.updated_at, updates.checked_at)
  from updates
  where
    profile.id = updates.id
    and profile.platform = 'naver_blog'
    and (
      profile.naver_blog_visitor_checked_at is null
      or updates.checked_at > profile.naver_blog_visitor_checked_at
      or (
        updates.checked_at = profile.naver_blog_visitor_checked_at
        and (
          profile.naver_blog_visitor_status is distinct from updates.visitor_status
          or profile.naver_blog_visitor_average_4d is distinct from updates.visitor_average_4d
          or profile.naver_blog_visitor_counts is distinct from updates.visitor_counts
          or profile.naver_blog_visitor_error is distinct from updates.error_message
        )
      )
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb)
  to service_role;

-- The batch worker uses only v2. Revoking the old unconditional updater makes
-- accidental retries fail closed once this migration is deployed.
revoke execute on function public.apply_discovered_naver_blog_visitor_metrics(jsonb)
  from service_role;

comment on function public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb) is
  'Service-role-only, monotonic and idempotent batch update for public Naver Blog visitor metrics.';
