do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settlement_periods',
    'settlement_reports',
    'settlement_items',
    'payouts'
  ]
  loop
    execute format('drop policy if exists %I_select_accessible on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_manage_contract on public.%I', table_name, table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format(
      'comment on table public.%I is %L',
      table_name,
      'Reserved for future marketplace settlement features. Not exposed to advertisers, influencers, anon, or authenticated clients in the contract-only launch.'
    );
  end loop;
end $$;
