const operationalTestEmailLocals = new Set([
  "breadroom.manager",
  "test.influencer",
  "creator.sora",
  "breadroom",
  "breadroom-partner",
  "obre-beauty",
  "housefit",
  "brewinglab",
  "nightcare",
  "minseo.home",
  "today.taste",
  "haru.fit",
  "ziyu.log",
  "luna.day",
  "yuna.beauty",
  "review.j",
  "only.routine",
  "harin.log",
  "moa.review",
  "sua.pick",
  "raon.beauty",
  "jian.home",
  "serin.daily",
  "narae.shorts",
  "romi.review",
  "sodam.pick",
]);

export const isOperationalTestEmail = (value: unknown) => {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email.includes("@")) return false;

  const [local = "", domain = ""] = email.split("@");
  if (
    domain === "directsign.app" ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain === "test" ||
    domain.endsWith(".test")
  ) {
    return true;
  }

  if (
    /^(qa|test|demo|seed)[._-]/i.test(local) ||
    /[._-](qa|test|demo|seed)([._-]|$)/i.test(local)
  ) {
    return true;
  }

  return domain === "yeollock.me" && operationalTestEmailLocals.has(local);
};
