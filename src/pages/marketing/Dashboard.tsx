import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAppStore,
  Contract,
  ContractPlatform,
  ContractStatus,
} from "../../store";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Clock,
  FileText,
  LayoutGrid,
  List,
  PenTool,
  Plus,
  Search,
} from "lucide-react";
import { format } from "date-fns";

type StatusFilter = ContractStatus | "ALL";
type ViewMode = "list" | "board";

const STATUS_ORDER: ContractStatus[] = [
  "DRAFT",
  "REVIEWING",
  "NEGOTIATING",
  "APPROVED",
  "SIGNED",
];

const STATUS_META: Record<
  ContractStatus,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    tone: string;
  }
> = {
  DRAFT: {
    title: "초안",
    description: "공유 전 작성 중",
    icon: <FileText strokeWidth={1.5} className="h-4 w-4" />,
    tone: "text-neutral-500",
  },
  REVIEWING: {
    title: "검토 중",
    description: "상대방 응답 대기",
    icon: <Clock strokeWidth={1.5} className="h-4 w-4" />,
    tone: "text-neutral-500",
  },
  NEGOTIATING: {
    title: "수정 요청",
    description: "광고주 확인 필요",
    icon: <AlertCircle strokeWidth={1.5} className="h-4 w-4" />,
    tone: "text-amber-600",
  },
  APPROVED: {
    title: "서명 대기",
    description: "최종본 승인 완료",
    icon: <PenTool strokeWidth={1.5} className="h-4 w-4" />,
    tone: "text-neutral-500",
  },
  SIGNED: {
    title: "완료",
    description: "서명 완료",
    icon: <CheckCircle strokeWidth={1.5} className="h-4 w-4" />,
    tone: "text-emerald-600",
  },
};

const PLATFORM_META: Record<
  ContractPlatform,
  {
    label: string;
    shortLabel: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  NAVER_BLOG: {
    label: "네이버 블로그",
    shortLabel: "Blog",
    className: "border-[#03c75a]/20 bg-[#03c75a]/10 text-[#087a3a]",
    icon: <span className="text-[10px] font-black leading-none">B</span>,
  },
  YOUTUBE: {
    label: "유튜브",
    shortLabel: "YouTube",
    className: "border-[#ff0033]/20 bg-[#ff0033]/10 text-[#d70022]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 14.9V9.1l5.2 2.9L10 14.9Z" />
      </svg>
    ),
  },
  INSTAGRAM: {
    label: "인스타그램",
    shortLabel: "Instagram",
    className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current">
        <rect x="5" y="5" width="14" height="14" rx="4" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" strokeWidth="2" />
        <circle cx="16.5" cy="7.5" r="1" className="fill-current stroke-0" />
      </svg>
    ),
  },
  TIKTOK: {
    label: "틱톡",
    shortLabel: "TikTok",
    className: "border-neutral-200 bg-neutral-950 text-white",
    icon: <span className="text-[13px] font-black leading-none">♪</span>,
  },
  OTHER: {
    label: "기타",
    shortLabel: "Other",
    className: "border-neutral-200 bg-neutral-50 text-neutral-600",
    icon: <span className="text-[10px] font-black leading-none">+</span>,
  },
};

export function Dashboard() {
  const navigate = useNavigate();
  const contracts = useAppStore((state) => state.contracts);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [compact, setCompact] = useState(false);

  const statusCounts = useMemo(() => {
    return STATUS_ORDER.reduce(
      (acc, status) => {
        acc[status] = contracts.filter((contract) => contract.status === status).length;
        return acc;
      },
      {} as Record<ContractStatus, number>,
    );
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return contracts
      .filter((contract) => {
        if (statusFilter !== "ALL" && contract.status !== statusFilter) {
          return false;
        }

        if (!normalizedQuery) return true;

        return [
          contract.title,
          contract.influencer_info.name,
          contract.influencer_info.contact,
          contract.influencer_info.channel_url,
          formatPlatform(contract),
          contract.campaign?.budget,
          contract.campaign?.period,
          STATUS_META[contract.status].title,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
  }, [contracts, query, statusFilter]);

  const groupedContracts = useMemo(() => {
    return STATUS_ORDER.reduce(
      (acc, status) => {
        acc[status] = filteredContracts.filter(
          (contract) => contract.status === status,
        );
        return acc;
      },
      {} as Record<ContractStatus, Contract[]>,
    );
  }, [filteredContracts]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900 font-sans">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-neutral-900 text-white">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
                strokeLinejoin="miter"
              >
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="text-lg font-heading tracking-widest uppercase text-neutral-900">
              DirectSign
            </span>
          </div>
          <Button
            onClick={() => navigate("/marketing/builder")}
            className="h-11 rounded-none bg-neutral-900 px-5 text-[12px] font-medium uppercase tracking-wider text-white shadow-none transition-colors hover:bg-neutral-800"
          >
            <Plus className="mr-2 h-4 w-4" /> 새 계약
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-12">
        <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
              Marketing workspace
            </p>
            <h1 className="text-3xl font-light tracking-tight text-neutral-950 sm:text-4xl">
              계약 보관함
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-neutral-500">
              계약명, 인플루언서, 플랫폼, 금액, 기간, 현 단계를 같은 규칙으로 확인하세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ViewButton
              active={viewMode === "list"}
              icon={<List className="h-4 w-4" />}
              label="목록"
              onClick={() => setViewMode("list")}
            />
            <ViewButton
              active={viewMode === "board"}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="칸반"
              onClick={() => setViewMode("board")}
            />
            <button
              type="button"
              onClick={() => setCompact((value) => !value)}
              className={`h-10 border px-4 text-[12px] font-medium transition-colors ${
                compact
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              간단히 보기
            </button>
          </div>
        </section>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="계약명, 인플루언서, 플랫폼으로 검색"
              className="h-12 w-full border border-neutral-200 bg-white pl-11 pr-4 text-[14px] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip
              active={statusFilter === "ALL"}
              label="전체"
              count={contracts.length}
              onClick={() => setStatusFilter("ALL")}
            />
            {STATUS_ORDER.map((status) => (
              <StatusChip
                key={status}
                active={statusFilter === status}
                label={STATUS_META[status].title}
                count={statusCounts[status]}
                onClick={() => setStatusFilter(status)}
              />
            ))}
          </div>
        </section>

        {viewMode === "list" ? (
          <ContractArchiveList
            contracts={filteredContracts}
            compact={compact}
            onOpen={(contract) => navigate(`/marketing/contract/${contract.id}`)}
          />
        ) : (
          <ContractBoard
            groupedContracts={groupedContracts}
            compact={compact}
            onOpen={(contract) => navigate(`/marketing/contract/${contract.id}`)}
          />
        )}
      </main>
    </div>
  );
}

interface ViewButtonProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const ViewButton: React.FC<ViewButtonProps> = ({
  active,
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-10 items-center gap-2 border px-4 text-[12px] font-medium transition-colors ${
      active
        ? "border-neutral-900 bg-neutral-900 text-white"
        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
    }`}
  >
    {icon}
    {label}
  </button>
);

interface StatusChipProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}

const StatusChip: React.FC<StatusChipProps> = ({
  active,
  label,
  count,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-12 items-center gap-2 border px-4 text-[12px] font-medium transition-colors ${
      active
        ? "border-neutral-900 bg-neutral-900 text-white"
        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
    }`}
  >
    <span>{label}</span>
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
        active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      {count}
    </span>
  </button>
);

interface ContractArchiveListProps {
  contracts: Contract[];
  compact: boolean;
  onOpen: (contract: Contract) => void;
}

const ContractArchiveList: React.FC<ContractArchiveListProps> = ({
  contracts,
  compact,
  onOpen,
}) => {
  if (contracts.length === 0) {
    return <EmptyState />;
  }

  return (
    <section className="overflow-hidden border border-neutral-200 bg-white">
      <div
        className={`hidden border-b border-neutral-100 bg-neutral-50 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400 lg:grid ${
          compact
            ? "grid-cols-[minmax(260px,1fr)_220px_80px]"
            : "grid-cols-[minmax(280px,1.4fr)_200px_190px_150px_180px_140px_56px]"
        }`}
      >
        <span>계약명</span>
        <span>인플루언서</span>
        {!compact && <span>플랫폼</span>}
        {!compact && <span>금액</span>}
        {!compact && <span>기간</span>}
        <span>현 단계</span>
        <span />
      </div>

      <div className="divide-y divide-neutral-100">
        {contracts.map((contract) => (
          <ContractListRow
            key={contract.id}
            contract={contract}
            compact={compact}
            onOpen={() => onOpen(contract)}
          />
        ))}
      </div>
    </section>
  );
};

interface ContractListRowProps {
  contract: Contract;
  compact: boolean;
  onOpen: () => void;
}

const ContractListRow: React.FC<ContractListRowProps> = ({
  contract,
  compact,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    className={`group grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-neutral-50 lg:items-center ${
      compact
        ? "lg:grid-cols-[minmax(260px,1fr)_220px_80px]"
        : "lg:grid-cols-[minmax(280px,1.4fr)_200px_190px_150px_180px_140px_56px]"
    }`}
  >
    <div className="min-w-0">
      <p className="truncate text-[15px] font-semibold text-neutral-950">
        {contract.title}
      </p>
      <p className="mt-1 text-[12px] text-neutral-400 lg:hidden">
        {contract.influencer_info.name}
      </p>
    </div>

    <div className="min-w-0">
      <p className="truncate text-[13px] font-medium text-neutral-800">
        {contract.influencer_info.name}
      </p>
      <p className="truncate text-[12px] text-neutral-400">
        {contract.influencer_info.contact}
      </p>
    </div>

    {!compact && (
      <>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-300 lg:hidden">
            플랫폼
          </p>
          <PlatformBadges contract={contract} />
        </div>
        <FieldValue label="금액" value={contract.campaign?.budget ?? "미정"} />
        <FieldValue label="기간" value={formatPeriod(contract)} />
      </>
    )}

    <StatusBadge status={contract.status} />

    <div className="hidden justify-end lg:flex">
      <ChevronDown className="-rotate-90 h-4 w-4 text-neutral-300 transition-transform group-hover:translate-x-1 group-hover:text-neutral-900" />
    </div>
  </button>
);

interface FieldValueProps {
  label: string;
  value: string;
}

const FieldValue: React.FC<FieldValueProps> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-300 lg:hidden">
      {label}
    </p>
    <p className="truncate text-[13px] text-neutral-700">{value}</p>
  </div>
);

interface PlatformBadgesProps {
  contract: Contract;
  compact?: boolean;
}

const PlatformBadges: React.FC<PlatformBadgesProps> = ({
  contract,
  compact = false,
}) => {
  const platforms = getContractPlatforms(contract);

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {platforms.map((platform) => {
        const meta = PLATFORM_META[platform];

        return (
          <span
            key={platform}
            className={`inline-flex h-7 max-w-full items-center gap-1.5 border px-2 text-[11px] font-semibold ${meta.className}`}
            title={meta.label}
          >
            {meta.icon}
            <span className="truncate">
              {compact ? meta.shortLabel : meta.label}
            </span>
          </span>
        );
      })}
    </div>
  );
};

interface StatusBadgeProps {
  status: ContractStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const meta = STATUS_META[status];
  const activeClass =
    status === "NEGOTIATING"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : status === "SIGNED"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-neutral-200 bg-neutral-50 text-neutral-700";

  return (
    <div className={`inline-flex h-8 items-center gap-2 border px-3 ${activeClass}`}>
      <span className={meta.tone}>{meta.icon}</span>
      <span className="whitespace-nowrap text-[12px] font-semibold">
        {meta.title}
      </span>
    </div>
  );
};

interface ContractBoardProps {
  groupedContracts: Record<ContractStatus, Contract[]>;
  compact: boolean;
  onOpen: (contract: Contract) => void;
}

const ContractBoard: React.FC<ContractBoardProps> = ({
  groupedContracts,
  compact,
  onOpen,
}) => (
  <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
    {STATUS_ORDER.map((status) => {
      const meta = STATUS_META[status];
      const contracts = groupedContracts[status];

      return (
        <div key={status} className="min-w-0">
          <div className="mb-4 flex items-start justify-between px-1">
            <div className="flex gap-3">
              <span className={`mt-0.5 ${meta.tone}`}>{meta.icon}</span>
              <div>
                <h2 className="text-[13px] font-semibold text-neutral-900">
                  {meta.title}
                </h2>
                <p className="mt-1 text-[12px] text-neutral-400">
                  {meta.description}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[12px] font-medium text-neutral-500 ring-1 ring-neutral-200">
              {contracts.length}
            </span>
          </div>

          <div className="space-y-3">
            {contracts.map((contract) => (
              <ContractBoardCard
                key={contract.id}
                contract={contract}
                compact={compact}
                onOpen={() => onOpen(contract)}
              />
            ))}
            {contracts.length === 0 && (
              <div className="flex min-h-[120px] items-center justify-center border border-dashed border-neutral-200 bg-white/40 px-4 text-center text-[13px] text-neutral-300">
                계약 없음
              </div>
            )}
          </div>
        </div>
      );
    })}
  </section>
);

interface ContractBoardCardProps {
  contract: Contract;
  compact: boolean;
  onOpen: () => void;
}

const ContractBoardCard: React.FC<ContractBoardCardProps> = ({
  contract,
  compact,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="group w-full border border-neutral-100 bg-white p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.025)] transition-colors hover:border-neutral-300"
  >
    <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-neutral-950">
      {contract.title}
    </p>
    <p className="mt-2 truncate text-[12px] font-medium text-neutral-600">
      {contract.influencer_info.name}
    </p>
    {!compact && (
      <div className="mt-4 space-y-2 text-[12px] text-neutral-500">
        <PlatformBadges contract={contract} compact />
        <p className="truncate">{contract.campaign?.budget ?? "금액 미정"}</p>
        <p className="truncate">{formatPeriod(contract)}</p>
      </div>
    )}
  </button>
);

const EmptyState = () => (
  <section className="flex min-h-[260px] flex-col items-center justify-center border border-dashed border-neutral-200 bg-white/50 px-6 text-center">
    <p className="text-[15px] font-semibold text-neutral-900">
      조건에 맞는 계약이 없습니다
    </p>
    <p className="mt-2 text-[13px] text-neutral-400">
      검색어를 줄이거나 상태 필터를 전체로 변경해보세요.
    </p>
  </section>
);

const formatPlatform = (contract: Contract) =>
  getContractPlatforms(contract)
    .map((platform) => PLATFORM_META[platform].label)
    .join(", ");

const getContractPlatforms = (contract: Contract): ContractPlatform[] => {
  if (contract.campaign?.platforms?.length) {
    return contract.campaign.platforms;
  }

  const source = [
    contract.influencer_info.channel_url,
    ...(contract.campaign?.deliverables ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const platforms = new Set<ContractPlatform>();

  if (source.includes("instagram") || source.includes("인스타")) {
    platforms.add("INSTAGRAM");
  }
  if (source.includes("youtube") || source.includes("유튜브")) {
    platforms.add("YOUTUBE");
  }
  if (source.includes("tiktok") || source.includes("틱톡")) {
    platforms.add("TIKTOK");
  }
  if (source.includes("naver") || source.includes("blog") || source.includes("블로그")) {
    platforms.add("NAVER_BLOG");
  }

  return platforms.size > 0 ? Array.from(platforms) : ["OTHER"];
};

const formatPeriod = (contract: Contract) => {
  if (contract.campaign?.period) return contract.campaign.period;
  if (contract.campaign?.deadline) {
    return `${format(new Date(contract.campaign.deadline), "yyyy.MM.dd")}까지`;
  }
  if (contract.workflow?.due_at) {
    return `${format(new Date(contract.workflow.due_at), "yyyy.MM.dd")}까지`;
  }

  return "미정";
};
