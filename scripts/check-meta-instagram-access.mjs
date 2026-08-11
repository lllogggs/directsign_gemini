const graphVersion =
  process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
const appId = process.env.META_APP_ID?.trim() || "";
const appSecret = process.env.META_APP_SECRET?.trim() || "";
const dmAccessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN?.trim() || "";
const businessAccessToken =
  process.env.META_GRAPH_ACCESS_TOKEN?.trim() || dmAccessToken;
const igUserId = process.env.META_IG_USER_ID?.trim() || "";
const officialHandle = (process.env.VITE_INSTAGRAM_OFFICIAL_HANDLE?.trim() || "")
  .replace(/^@+/, "")
  .toLowerCase();

const configured = {
  app_id: Boolean(appId),
  app_secret: Boolean(appSecret),
  dm_token: Boolean(dmAccessToken),
  business_discovery_token: Boolean(businessAccessToken),
  ig_user_id: Boolean(igUserId),
  token_expiry: Boolean(
    process.env.META_INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT?.trim(),
  ),
  official_handle: Boolean(officialHandle),
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const graphError = (payload) => ({
  graph_error_code: payload?.error?.code ?? null,
  graph_error_subcode: payload?.error?.error_subcode ?? null,
});

const checkToken = async () => {
  try {
    const url = new URL(
      `https://graph.facebook.com/${graphVersion}/debug_token`,
    );
    url.searchParams.set("input_token", businessAccessToken);
    url.searchParams.set("access_token", `${appId}|${appSecret}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response);
    return {
      request_ok: response.ok,
      http_status: response.status,
      is_valid: payload?.data?.is_valid === true,
      app_matches: String(payload?.data?.app_id || "") === appId,
      token_type: String(payload?.data?.type || ""),
      expires_at: payload?.data?.expires_at
        ? new Date(Number(payload.data.expires_at) * 1_000).toISOString()
        : null,
      data_access_expires_at: payload?.data?.data_access_expires_at
        ? new Date(
            Number(payload.data.data_access_expires_at) * 1_000,
          ).toISOString()
        : null,
      scopes: Array.isArray(payload?.data?.scopes)
        ? [...payload.data.scopes].sort()
        : [],
      granular_scope_names: Array.isArray(payload?.data?.granular_scopes)
        ? payload.data.granular_scopes
            .map((item) => item?.scope)
            .filter(Boolean)
            .sort()
        : [],
      ...graphError(payload),
    };
  } catch {
    return { request_ok: false, transport_error: true };
  }
};

const checkOwnProfile = async () => {
  try {
    const url = new URL(
      `https://graph.instagram.com/${graphVersion}/${encodeURIComponent(igUserId)}`,
    );
    url.searchParams.set("fields", "id,username,follower_count");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${dmAccessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response);
    return {
      request_ok: response.ok,
      http_status: response.status,
      identity_present: Boolean(payload?.id),
      username_matches_official:
        String(payload?.username || "")
          .replace(/^@+/, "")
          .toLowerCase() === officialHandle,
      follower_count_available:
        Number.isSafeInteger(Number(payload?.follower_count)) &&
        Number(payload?.follower_count) >= 0,
      ...graphError(payload),
    };
  } catch {
    return { request_ok: false, transport_error: true };
  }
};

const checkBusinessDiscovery = async () => {
  try {
    const fields =
      `business_discovery.username(${officialHandle})` +
      "{id,username,followers_count,media_count}";
    const url = new URL(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(igUserId)}`,
    );
    url.searchParams.set("fields", fields);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${businessAccessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(response);
    const profile = payload?.business_discovery;
    return {
      request_ok: response.ok,
      http_status: response.status,
      profile_present: Boolean(profile?.id),
      username_matches_official:
        String(profile?.username || "")
          .replace(/^@+/, "")
          .toLowerCase() === officialHandle,
      follower_count_available:
        Number.isSafeInteger(Number(profile?.followers_count)) &&
        Number(profile?.followers_count) >= 0,
      ...graphError(payload),
    };
  } catch {
    return { request_ok: false, transport_error: true };
  }
};

const result = {
  configured,
  dm_token_debug: await checkToken(),
  own_profile_api: await checkOwnProfile(),
  business_discovery: await checkBusinessDiscovery(),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

const allConfigured = Object.values(configured).every(Boolean);
const reusableForBusinessDiscovery =
  result.dm_token_debug.is_valid === true &&
  result.dm_token_debug.app_matches === true &&
  result.own_profile_api.request_ok === true &&
  result.business_discovery.request_ok === true &&
  result.business_discovery.username_matches_official === true &&
  result.business_discovery.follower_count_available === true;

if (!allConfigured || !reusableForBusinessDiscovery) {
  process.exitCode = 1;
}
