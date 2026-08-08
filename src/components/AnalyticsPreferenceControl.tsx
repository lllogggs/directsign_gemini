import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "../domain/analytics";

export function AnalyticsPreferenceControl() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() =>
    getAnalyticsConsent(),
  );
  const enabled = consent === "granted";

  useEffect(() => {
    const updateConsent = (event: Event) => {
      setConsent((event as CustomEvent<AnalyticsConsent>).detail);
    };
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, updateConsent);
    return () =>
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, updateConsent);
  }, []);

  const toggleConsent = () => {
    setAnalyticsConsent(enabled ? "denied" : "granted");
  };

  return (
    <div
      id="analytics-settings"
      className="flex scroll-mt-6 flex-col gap-4 border-y border-neutral-200 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-[14px] font-semibold text-neutral-900">
          서비스 분석 동의 {enabled ? "허용됨" : "안 함"}
        </p>
        <p className="mt-1 text-[13px] leading-6 text-neutral-500">
          선택하지 않으면 분석 도구를 불러오지 않으며 서비스 이용에는 영향이 없습니다.
          철회하면 새 수집은 중단되고, 철회 전 수집분은 위 표의 보유기간에 따라 삭제됩니다.
        </p>
      </div>
      <button
        type="button"
        onClick={toggleConsent}
        className={`h-10 shrink-0 rounded-lg px-4 text-[13px] font-semibold transition ${
          enabled
            ? "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-950"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {enabled ? "분석 동의 철회" : "분석 동의 허용"}
      </button>
    </div>
  );
}
