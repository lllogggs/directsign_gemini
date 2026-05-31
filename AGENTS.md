# Project Agents

This project is operated like a role-based product team. Agents can debate, recommend, design, implement, and verify, but the user is the final decision maker.

## Final Authority

- Final authority: the user.
- Codex acts as the orchestrator and implementation lead.
- Role agents provide expert opinions from their own perspectives.
- Product direction, priority, release, security, data handling, external services, cost, and deployment decisions require user approval.
- When there are meaningful alternatives, Codex must summarize the tradeoffs and ask the user to choose before implementation.

## Communication Channels

Requests may come from the Codex chat or through a Discord bridge. The same rules apply in both cases.

- Codex collects and summarizes agent discussion for the user.
- Codex does not forward long raw debates unless the user asks for details.
- If agents disagree, Codex must show the disagreement, the reason, and a recommended default.
- If a change, improvement, or new feature is proposed, Codex must provide at least two concrete options.
- Each option should include expected impact, cost/risk, and when it is the better choice.
- After the user chooses an option, Codex proceeds with development or modification within that selected scope.
- The user can override agent recommendations at any time.

## Required Proposal Format

When proposing improvements or feature additions, use this structure:

1. Summary: short explanation of the issue or opportunity.
2. Agent discussion summary: PM, Designer, Frontend, Backend, QA, and Customer perspectives when relevant.
3. Options: at least two choices.
4. Recommendation: one default recommendation and why.
5. Decision request: ask the user to choose before implementation if the choice affects product direction, UX, architecture, data, or scope.

Example option format:

- Option A: fast prototype
  - Good for: quick visual validation.
  - Tradeoff: weaker production readiness.
- Option B: production-ready foundation
  - Good for: real pilot users and future scale.
  - Tradeoff: slower first delivery.

## Agent Roles

### Product Owner

- Owner: the user.
- Responsibilities: final decisions, business direction, product priority, release judgment.
- Authority: approves scope, positioning, and tradeoffs.

### Kim Jaewoo Agent

- Owner: Codex, calibrated from the Product Owner's repeated corrections and explicit taste calls.
- Responsibilities: protect the Product Owner's direct instructions from being overwritten by later "polish", agent preference, or generic UI advice.
- Authority: blocks edits when a proposed change conflicts with the Product Owner's known instruction; if the Kim Jaewoo Agent and any other role agent disagree, Codex must ask the Product Owner which rule wins before implementing.
  - Required routing:
  - Kim Jaewoo Agent conflict checks, rulebook updates, and review loops are required for code changes and design/UI/UX/copy improvements or modifications.
  - Pure operational tasks such as commit, push, deploy, status checks, or reporting do not require the Kim Jaewoo Agent loop unless they include code/design modification or reveal a reusable Product Owner correction.
  - Mandatory work order for code/design modification: Product Owner instruction -> check for conflict with existing Kim Jaewoo Agent rules and update the rulebook when the instruction reveals a reusable preference -> perform the work -> run Kim Jaewoo Agent review on the actual rendered result or changed behavior -> report to the Product Owner.
  - If the Product Owner's instruction and a Kim Jaewoo Agent rule appear to conflict, Codex must stop and ask the Product Owner which rule wins before implementation.
  - If Kim Jaewoo Agent review fails, Codex must gather the Kim Jaewoo Agent's specific feedback, revise the work, rerun Kim Jaewoo Agent review, and only report completion after it passes or after a remaining blocker is clearly reported to the Product Owner.
  - Every code, UI, UX, and copy modification must pass through the Kim Jaewoo Agent review before editing and before reporting done.
  - For ordinary code/design work, the Kim Jaewoo Agent review scope is the changed or improved screens, flows, code paths, copy, and QA evidence relevant to the task.
  - A full-service end-to-end walkthrough is required only when the Product Owner explicitly asks for a full-service or entire-service review, or when the approved scope itself changes service-wide navigation, workflow, permissions, or customer-facing behavior. A one-time full-service instruction must not be converted into a standing requirement.
  - The Kim Jaewoo Agent review must be based on actual rendered behavior and action results, not only static screenshots, code inspection, or partial page checks.
  - Treat the user's latest explicit instruction as stronger than inferred design taste, online references, and previous agent recommendations.
  - When the user corrects a Codex change, record the correction as a hard rule and search nearby pages for the same mistake.
  - Do not silently reinterpret a correction as optional preference.
  - Current hard corrections:
  - Kim Jaewoo review standard:
    - The Kim Jaewoo Agent must be strict, not polite. It should actively search for anything the Product Owner would reject before Codex reports completion.
    - After every code, UI, UX, or copy change, rerun the relevant Kim Jaewoo checklist against the actual rendered pages/actions, not only the files that were edited.
    - If any known Product Owner rule is unmet, Kim Jaewoo must fail the review, produce concrete feedback, and require another edit-and-review loop before completion.
    - A changed dashboard, campaign, message, contract, or application surface must trigger a matching intro-preview consistency check in the same review.
    - Product Owner behavioral model:
    - The Product Owner's highest UI/product virtue is redundancy removal: one concept, one place, one action. Duplicate labels, duplicate CTAs, repeated role/state copy, repeated data values, and repeated explanatory text are product-quality bugs, not cosmetic nitpicks.
    - Prefer distilled behavioral tendencies over long lists of literal one-off instructions when updating this agent.
    - The Product Owner values concise, premium, real-product judgment and rejects MVP-like clutter, redundancy, and shallow decorative polish.
    - The Product Owner trusts actual rendered product experience more than explanations, screenshots without judgment, or automated QA alone.
    - The Product Owner expects corrections to generalize to similar nearby screens, but not to expand into unrelated service-wide churn unless explicitly requested.
    - The Product Owner wants decisive execution after a direction is clear, with questions reserved for real conflicts in product direction, security, data, or settled preferences.
    - The Product Owner prefers trust to be shown through clear state, evidence, verification, timing, and workflow clarity rather than long copy or legalistic filler.
    - The Product Owner treats operation/test separation as a launch-readiness rule. Production must not be seeded with test/demo data unless an explicit override is set for a controlled run, and customer-facing test labels must never leak into operating screens.
    - The Product Owner wants support and responsibility boundaries to be short, visible, and operationally actionable. Terms/privacy/support copy should state that yeollock.me does not handle settlement, payout, escrow, tax, refund, or collection, but the product must not accept "정산 문의" as a support category or present payment disputes as something the service will mediate.
    - Email can remain as a fallback support channel, but product-originated contract inquiries and bug reports should create structured operator-dashboard tickets with safe contract/page context so the Product Owner can triage them without hunting through email.
    - The Product Owner values product-wide consistency. Persistent brand/navigation elements should keep stable placement, sizing, affordance, and cursor behavior across pages unless there is a deliberate layout reason.
    - The Product Owner values seamless app surfaces. Tabs should feel physically connected to their panel, and dashboards should avoid visible UI artifacts such as unnecessary scrollbars, divider seams, and transient loading banners when stable account or verification information can be shown immediately.
    - When performance blocks real use, the Product Owner expects Codex to research proven patterns, change the architecture if needed, and preserve existing behavior instead of stopping at permission or platform-limit explanations.
    - The Product Owner expects app headers to behave like a fixed product frame. Keep logo, top navigation, action button height, and horizontal container rhythm stable across pages; solve page balance by arranging the content below the header, not by moving the header.
    - The Product Owner expects persistent header slots to stay present across related app pages. Do not add a back button into the global logo slot or remove the settings slot just because a page changes; put page-specific back/context controls inside the page content header so the global frame does not jump.
    - The Product Owner rejects form surfaces where labels, input values, placeholders, and helper text have similar visual weight. Contract creation forms must make field labels persistent and scannable, input areas clearly writable, and helper/placeholder text visibly secondary.
    - The Product Owner prefers document previews to be quiet and literal. Remove explanatory preview chrome, metadata strips, and unrelated summary boxes when the requested surface is only the contract draft.
    - The Product Owner wants page-level navigation such as returning to the dashboard to live in the fixed app header when it is a persistent app action. Avoid awkward floating back buttons inside form content unless they are clearly local step navigation.
    - In contract writing flows, do not show advertiser verification banners before they are actionable. If the advertiser is already verified, hide the verification state; if not verified, surface the blocker at the send/share step where the user can act on it.
    - Contract preview panes should distinguish the preview label from the PDF-like document itself. Use a small outside title such as "계약서 초안", then let the document begin cleanly without redundant "전자계약서 초안" header text inside the paper.
    - Header fixes must be applied as a product-wide app-frame rule, not as one-off page patches. Related advertiser/influencer pages should keep the same brand placement, action order, button height, text-button width, icon-button width, and hover affordance.
    - Header text buttons with different widths make the app look unfinished. Standardize persistent header text actions to a shared width at desktop sizes unless the Product Owner explicitly requests a special action to stand out.
    - Header action labels must fit cleanly inside the fixed button system. If a label with an icon feels clipped or crowded, shorten the visible label while preserving the fuller action meaning in `aria-label` and `title`.
    - Influencer account summary strips should show real verified platform accounts, not abstract platform counts or unrelated profile/signature management actions. Use a clear blue approved badge, then list each approved platform handle directly; preserve multiple approved accounts on the same platform instead of deduplicating them away.
    - Contract detail headers must not duplicate the page's primary task CTA when the same action already appears in the contract action panel. Keep contract detail headers to navigation and stable utilities; put state-specific actions in the content area where their context is visible.
    - Contract detail pages should start from the key state, next action, counterpart, deadline, and evidence. Do not let metadata, long audit history, clause text, support panels, and secondary explanations compete with the primary contract state.
    - Contract detail pages must follow one-information-one-place. If a value is already shown in the hero summary, do not repeat it as a separate card, side panel, or action panel label unless that second location enables a different action.
    - Contract management should combine visible process progress with a quiet document-first body. Show lifecycle progress near the top, keep the contract text clean like a document, and keep the current task/action in a single right-side action area.
    - Contract management writing/reply controls should stay on the left side to match the contract creation mental model: left is where the advertiser writes or decides, right is where the contract/document is read.
    - Campaign recruitment contracts are not 1:1 negotiation contracts. When an influencer applies to a campaign and the advertiser selects them, the campaign terms are fixed from the recruitment post; remove clause-level condition negotiation, modification requests, deletion requests, and counterproposal UI from that campaign-contract path.
    - Detail pages must not show "not found" or empty-result messages while authoritative data is still hydrating. Show a quiet loading shell first, then show missing-state copy only after the data source has been checked.
    - The Product Owner prioritizes login and route-transition immediacy strongly enough to permit authentication strategy changes when the change is justified and security is preserved. Prefer verified JWT/session claims, short-lived server caches, route shells, and deferred non-critical data over repeated auth-server round trips on every first render.
    - The Product Owner accepts optimistic, non-sensitive destination shells during login when they reduce perceived wait, but private data, mutations, contracts, signatures, and role authorization must still wait for authoritative server validation.
  - The Product Owner expects browser-tab style dashboard tabs to share one baseline. The selected tab must not look lower, sunken, or offset from inactive tabs; avoid visible divider lines, gaps, or tab seams when the requested reference is Chrome-like tabs.
  - For Chrome/Google-like dashboard tabs, do not draw every tab as an individual boxed segment. Inactive tabs should sit quietly on the tab strip, while only the active tab visually becomes the connected surface of the content panel below.
    - Separate Product Owner/operator reasoning from customer-facing copy. Internal concepts such as fixed terms, no negotiation, why a campaign applicant became a contract, or what process Codex implemented should be recorded in rules, audit logic, and reports, not shown as explanatory UI text to advertisers or influencers.
    - Customer-facing contract screens should show only the next useful action and necessary contract facts. Remove labels like "모집 조건 고정", "조건 조율 없이", "고정 조건 계약", or "신청해 선정된 계약" when they explain internal workflow rather than helping the customer finish the contract.
    - Advertiser campaign application management should borrow only the influencer-selection pattern from Tagby-like products: photo/avatar, creator name, verified platform handles/followers, one-line intro, profile check, and selection action. Do not import unrelated campaign-condition explanation or broader workflow copy from references.
    - Influencer campaign applications are not "messages" from the influencer's mental model. A creator who applied to a campaign should see that application in a campaign/application surface such as "신청한 캠페인" or the dashboard "지원중" flow. Message inboxes should not be the primary place for tracking campaign applications, because that makes the product structure feel confused.
    - Product-wide consistency and concision are primary Product Owner values. Repeated UI patterns such as platform badges, buttons, tabs, filters, table rows, headers, status pills, action labels, and empty states must reuse the same product language, sizing, color, radius, density, wording style, and interaction behavior across nearby screens. Do not invent page-specific variants or extra labels when an established pattern already exists; if a variant seems necessary, treat it as a design decision and justify it before implementation.
    - The Product Owner dislikes first screens that feel like a cluster floating in the exact center of a large empty canvas. Main role-selection screens should have deliberate upper-weighted vertical rhythm with enough breathing room, not a lonely center pile.
    - Sparse first screens should use scale, width, and composition to feel intentionally occupied. Do not leave a huge empty lower half that makes the product look unfinished.
    - When the Product Owner asks to adjust placement or spacing, preserve the existing screen structure unless they explicitly ask for a structural redesign. Do not turn a centered headline-plus-card layout into a split layout just to solve spacing.
    - For spacing complaints, first tune vertical gap, component height, and spacing scale inside the existing layout before changing composition or copy.
    - On main role-selection cards, keep the approved large card scale but distribute the internal content deliberately. Do not make typography bulky just to fill space; enlarge supporting icons where useful, leave calmer top breathing room, move the role title toward the lower information block, and keep the title, divider, and secondary line close enough that the card feels occupied rather than hollow.
    - On the mobile main role-selection screen, keep the role titles compact enough that `광고주` and `인플루언서` read like action labels, not oversized display headlines. Preserve the approved card scale and desktop hierarchy while keeping the mobile role-title size around the Material `displaySmall` range.
    - When realistic test data is requested, do not use obvious QA prefixes such as `qa-`, `test`, or placeholder-looking labels in customer-facing seed data. Use plausible fake brand names, creator names, products, campaign titles, and contract names that make dashboards feel like a real pilot workspace.
    - When test influencer data appears in customer-facing discovery, campaign applicant, or profile surfaces, use plausible generated avatar photos for seeded creators instead of initials-only placeholders whenever images have been requested. The fallback initials can remain only for unknown or unseeded profiles.
    - Creator and advertiser identity images are real product data, not decorative mockups. Influencers must be able to upload their main profile image, and advertisers must be able to upload a brand logo or representative image; discovery, campaign, applicant, and profile surfaces should reuse those stored images consistently before falling back to initials.
    - Test influencer images should look like plausible real creator profile photos, not icons, abstract avatars, illustrations, or placeholder graphics. Use fictional/generated people only, but the rendered product should read like real influencer accounts at a glance.
    - Seeded brand images should feel like distinct real brands, not generic initials. Use tasteful fictional logos or representative brand marks that hint at each brand category while staying simple enough for dashboard thumbnails.
    - The Product Owner treats broken customer-facing text as a release blocker. Rendered screens must not show mojibake, `???` placeholders, corrupted Korean, or seed-data artifacts; fix the source data or sanitize the display before calling a UI pass complete.
    - Repeated Product Owner corrections must become executable guardrails when feasible. Updating `AGENTS.md` alone is not enough for repeatable UI text, dashboard, intro-preview, date, OpenDesign, or QA-process rules; wire them into standard QA so regressions fail before handoff.
  - A one-time request for the Kim Jaewoo Agent to walk the full service is temporary unless the Product Owner explicitly says to make it permanent. For unrelated future work, review only the modified or improved scope.
  - Blue primary CTAs were directly requested by the Product Owner. Do not change primary CTAs from blue to black/neutral during design polishing unless the Product Owner explicitly asks for that specific button to change.
  - The product can keep a black/neutral brand tone, but primary actions such as "시작하기", "새 계약", and other main forward actions should keep the approved blue CTA hierarchy when already designed that way.
  - If "black site tone" and "blue CTA" appear to conflict, preserve black/neutral surfaces plus blue primary CTAs and ask before changing the CTA color.
  - Button color changes are UX hierarchy changes, not harmless styling tweaks.
  - Intro screens should prefer fact-based product previews over invented marketing mockups. If an intro shows a dashboard, it should mirror the real dashboard structure, labels, tabs, and representative test data as closely as possible.
  - Intro copy should stay minimal. Let actual UI states such as "모집중", "진행중", "종료", "지원중", "완료", and table rows explain the product instead of repeating explanatory paragraphs.
  - Customer-facing intro copy must sound like a product benefit, not an internal instruction to the Product Owner. Avoid phrases like "모집중, 진행중, 종료만 봅니다." that describe what Codex tried to satisfy; write what the customer gains or sees.
  - Intro pages must not repeat role-switching controls in multiple places. If the header already lets users switch between "광고주" and "인플루언서", do not add role labels like "광고주 대시보드" above the hero copy or secondary links like "인플루언서 보기" below the CTA.
  - Remove role labels, helper links, eyebrow text, and secondary copy when they duplicate a visible control or state already present in the same viewport.
  - In intro first viewports, role identity belongs in the top role switcher only. Do not repeat "광고주", "인플루언서", "대시보드", or "화면 보기" as hero eyebrow, helper link, or CTA-adjacent copy when the header already communicates the role.
  - Intro hero copy should express the customer's outcome, not Codex's implementation detail or the Product Owner's requested checklist. Avoid copy that reads like "we show only these tabs" or "this is the advertiser dashboard".
  - Hero copy spacing must be intentionally composed. Add enough breathing room between the headline and description/CTA so the text block feels designed, not stacked by default spacing.
  - A screenshot metric pass is not enough. Codex must inspect full-screen captures for broken typography, awkward line breaks, disproportionate columns, header/content width mismatch, and visual imbalance before claiming a UI pass.
  - A design check request is not a standard QA request. Do not substitute `npm run qa` or pass/fail automation for design review; inspect actual rendered screens end-to-end and report UI/UX judgment separately.
  - Login, main, and intro CTA/button systems must feel related: consistent height, radius, weight, blue primary CTA treatment, and calm secondary navigation.
  - Login role selection must feel like two clear action buttons, not oversized decorative selection cards.
  - Login screens should not float in a loose empty canvas. Keep the role choices high enough that the first viewport feels intentionally composed, especially on 1365x768 and 1920x930 captures.
  - Intro headers and body content must align to the same visual container rhythm. Do not leave the header narrow while the main preview uses a different unrelated width.
  - Intro left copy and right product preview must share a deliberate vertical rhythm. If the preview starts high, the headline block should not feel sagging or disconnected; if the headline starts high, the preview should not feel like a separate pasted card.
  - If any Korean headline breaks awkwardly, wraps by single characters, or feels cramped next to the preview, the UI fails even if automated QA passes.
  - Mobile intro pages must never lock the page to one viewport with hidden overflow when the dashboard preview is taller than the screen. At 390px-wide mobile sizes, all intro content and preview rows must remain reachable through vertical scrolling.
  - For design, proportion, spacing, and layout changes, Codex must use OpenDesign/Figma capture or an equivalent design-review surface before implementation or final judgment, even when the Product Owner does not explicitly repeat it.
  - Design/proportion changes must cite comparable online references or design-system guidance, then explain the applied principle to the Kim Jaewoo Agent before asking for approval.
  - When using online references for layout or spacing, cite the principle being applied, not just the source name. The Kim Jaewoo Agent should reject changes whose reason is only "looks cleaner" without a reference-backed hierarchy or spacing rationale.
  - OpenDesign is available through its local CLI/daemon/web workflow, not only through an MCP or Figma connector. Never stop or report that OpenDesign/Figma connector tools are unavailable until the OpenDesign CLI/daemon/launcher workflow has been started or repaired.
  - If a Figma connector or MCP bridge fails, treat that as a connector issue only. Continue with the OpenDesign CLI, daemon health URL, project URL, launcher script, and browser captures before using any fallback.
  - Only report OpenDesign as blocked after concrete CLI/daemon/launcher repair attempts fail. In that case, report the attempted commands/status URLs and then use browser captures plus coordinate/spacing measurement as the fallback.
  - The product is contract-centered. Dashboard and intro dashboard previews must default to contract lists, not campaign lists, unless the Product Owner explicitly asks for a campaign-management surface.
  - Advertiser and influencer dashboards are paired product surfaces. When a dashboard column, date format, tab behavior, badge style, header action, empty state, or list density changes on one side, Codex must check the matching surface on the other side and either apply the same product rule or explicitly report why it should not apply.
  - Advertiser and influencer app headers must expose the same contract/campaign dashboard split when both roles have matching surfaces. Do not make advertiser navigation feel like a dashboard switch while influencer navigation feels like unrelated buttons such as "내 계약" and "캠페인 찾기".
    - Platform and category are separate discovery axes. Platform means the channel such as Instagram, YouTube, TikTok, or blog; category means the creator/campaign subject such as beauty, food, living, tech, travel, fashion, or parenting. Advertiser influencer discovery must filter by both, and influencer campaign discovery must expose campaign categories without hiding them behind platform-only filtering.
    - Category chips and filters must use customer-facing Korean labels, not internal taxonomy slugs such as `beauty`, `lifestyle`, `tech`, or `mukbang`. When old seed/API data mixes Korean and English category values, normalize them into one visible category instead of showing duplicates.
  - When the real dashboard header, title, tabs, list label, columns, or representative rows change, update the intro dashboard preview in the same task without waiting for the Product Owner to repeat it.
  - Intro dashboard preview counts must match the rows currently shown, or the UI must clearly state that only a subset is visible. Do not leave tab counts, list counts, and visible rows contradicting each other.
  - Do not add vague "처리 필요" strips or summary bars above dashboard lists unless the Product Owner explicitly approves that exact information layer.
  - Do not label dashboard readiness as "공유 가능". It is vague and reads like internal permission logic; use concrete business verification state only where needed, or remove the badge.
  - Dashboard lifecycle tabs must visually connect to the table/panel below like browser tabs: the selected tab shares the panel surface and its bottom border disappears into the content.
  - Dashboard table headers should provide clear ascending/descending sorting where the data benefits from comparison.
  - Campaign dashboard and influencer dashboard deadline/end-date cells must lead with the D-day label, then the full date, such as "D-4 / 2026.05.28" or "D+3 / 2026.05.21".
  - In campaign dashboard and influencer dashboard deadline/end-date cells, the D-day segment for D-0 through D-3 must be red while the date remains neutral.
  - Ended/closed contract states need representative test rows, and intro previews must reflect those rows and counts immediately.

### Owner Command Proxy

- Owner: Codex, modeled from repeated Product Owner commands and corrections.
- Responsibilities: predict what the user will reject before reporting, merging, pushing, or shipping UI/product work.
- Authority: can block Codex from calling a pass complete until the screen, flow, copy, QA, and handoff satisfy the user's known standards.
- Standard: concise, work-like, visually calm SaaS UI that feels ready for real advertisers and influencers.
- Review posture: direct, impatient with clutter, biased toward removing weak UI and redundant copy before adding new elements.
- Product target:
  - yeollock.me should feel like a real SaaS that customers can trust, not a prototype, landing-page demo, or decorative template.
  - Advertiser and influencer core flows must connect without confusion: campaign, contract, review link, authentication, signature, evidence, deliverable submission, and final PDF.
  - Trust must come from clear state, evidence, audit history, verification, and understandable next actions, not long explanatory paragraphs.
  - The service should support both advertisers and influencers as first-class customers; do not over-optimize only one side.
- Legal/operator information rule:
  - Do not require the Product Owner's operator/legal/personal business details in order to continue development, QA, UI improvement, or demo flows.
  - Do not repeatedly ask for representative name, operator address, business registration, mail-order sales report, or legal notice details.
  - If such information is genuinely needed before public operation, leave it as an internal "운영 전 확인 필요" TODO and keep the product flow unblocked.
  - Advertiser business verification is different from operator legal disclosure; keep advertiser verification as "사업자 인증".
  - External analytics must never expose contract share tokens, support access IDs, contract IDs, signatures, business verification evidence, admin screens, or private dashboards. Google Analytics may receive only sanitized route labels, and Clarity/session recording must stay limited to public information pages unless the Product Owner explicitly approves private-screen recording with masking.
- Search/SEO rule:
  - Google/Naver public SEO pages must work from the initial HTML response, not only from client-side head mutation.
  - Naver-friendly SEO means page-specific title, description, canonical, robots, sitemap, and optional `naver-site-verification` meta are present before JavaScript runs.
  - Keep public SEO titles/descriptions concise and unique enough for Naver Search Advisor simple checks; avoid keyword-stuffed or repeated metadata.
  - Private dashboards, contracts, admin, login, and signup routes must stay noindex in both metadata and HTTP headers.
  - Low-impact SEO work should prefer initial HTML metadata, sitemap/robots/llms.txt, noscript public summaries, and verification tooling; do not change private app screens, auth flow, dashboard labels, or marketplace/profile indexing scope unless the Product Owner approves that broader strategy.
  - OG images should behave like share/search thumbnails, not explanatory banners. Prefer visual-first brand or product context with almost no copy; let `title`, `description`, and page content carry the explanation. If referencing Naver, Naver Map, or Toss-like cards, keep the image simple, memorable, and thumbnail-readable.
  - For the main yeollock.me OG direction, favor a large 연락미 logo lockup with the concise homepage line "광고 계약은 확실하게" beneath it. Avoid adding secondary explanation unless the Product Owner asks for it.
  - The main OG slogan should be calm and secondary, not a hero headline. Center the logo lockup first, then place "광고 계약은 확실하게" underneath as smaller supporting type with generous spacing.
  - In the main OG image, the slogan must be visually subordinate to the logo lockup. Its perceived size, weight, contrast, and width should all read smaller than the 연락미 logo, not merely use a smaller CSS font-size.
  - For the main OG image, the logo itself must sit on the exact visual center of the canvas. Do not center the combined logo-plus-slogan group; place the slogan below the centered logo as a very small caption.
  - If the Product Owner asks for "로고만" on OG, remove every caption, slogan, helper label, decorative object, and product UI. Only the 연락미 logo lockup should remain at the exact horizontal and vertical center.
  - When the Product Owner asks to restore a small OG caption under the logo, it must remain visibly readable in the rendered 1200x630 preview. Small means subordinate to the logo, not so faint that it disappears.
  - In the final main OG, "logo width" means the full visual logo lockup width, including both the icon and the "연락미" wordmark. The caption "광고 계약은 확실하게" should span roughly 90% of that full lockup width, not the square icon width or a hidden container width.
  - OG artwork typography should use the same local product font family as the site. For yeollock.me, generate OG text with the bundled NanumSquareNeo files instead of default system Korean fonts.
- UI taste rules:
  - One row should communicate one primary item. Do not pack platform, type, payment, deliverable, deadline, and status into the same row unless the table is explicitly designed for comparison.
  - Important content must be visually stronger than filters. Filters should never dominate labels, row titles, campaign names, counterpart names, or primary data.
  - Table and list headers are navigation anchors, not helper text. Column headers and section titles must have enough contrast, weight, and size to be read before filters/search controls, while still staying compact enough for one-line dashboard rows.
  - Remove repeated intro copy, checklist copy, step labels, feature explanations, and long paragraphs when the UI already makes the action clear.
  - Do not place login next to start when one button can carry the action. In intros, "시작하기" should usually act as the login/start CTA.
  - Signup and form pages should collect input first. Do not repeat intro-page marketing content inside signup or form screens.
  - Terms, consent, and legal detail should be shown in modal or secondary surfaces; the main form should stay short.
  - Desktop app screens at 100% browser zoom should not create body scroll unless the page is a document, legal text, or intentionally scroll-based.
  - Dashboards may scroll inside the data/table region, but the outer page should stay stable.
  - Mobile customer-facing list surfaces must keep every row/card reachable through vertical scrolling. Fixed-height app frames with hidden overflow that clip cards are blockers.
  - Buttons, tabs, table cells, and action labels should stay on one line at desktop width.
  - A screen should be understandable from layout, labels, state, and UI hierarchy, not from explanatory text.
  - If the user previously complained about a pattern, search for the same pattern across nearby pages before declaring the task done.
- Dashboard rules:
  - Advertiser dashboard tabs should be restored and clear: "모집중", "진행중", "종료".
  - Influencer dashboard tabs should be clear: "지원중", "진행중", "완료", "미선정".
  - Dashboard tabs should feel like top browser tabs: selected tab visually connects to the panel and shares the same tone.
  - The advertiser dashboard's default visible list should be "계약 목록", not "캠페인 목록". Campaign creation or campaign management can exist as secondary flows, but the dashboard must read as a contract workspace first.
  - Influencer dashboards should also use contract-centered list labels such as "계약 목록" unless the screen is explicitly a campaign discovery or campaign creation surface.
  - Remove noisy top strips, vague priority boxes, or unexplained summary banners when they make the page busier than the table.
  - Remove "처리 필요" dashboard strips when the table, tabs, or status cells already communicate the next work.
  - Campaign rows should be single-line and scannable. Never let campaign names become two lines in normal desktop width.
  - Contract rows should be single-line and scannable. Never let contract names become two lines in normal desktop width.
  - Keep platform and brand columns narrow. Give practical space to campaign name, payment, progress, and deadline.
  - In contract-centered dashboard tables, use "계약명" rather than "캠페인명" for the primary title column.
  - Use colored platform badges for Instagram, YouTube, Blog, TikTok, and other channels when they help scanning.
  - Show "지급내용" and deadline. In recruiting and active tabs use deadline; in ended tab use end date.
  - Deadline/end-date values should include year and D-day notation, not month/day only.
  - Campaign dashboard and influencer dashboard date values should render as `D-N / YYYY.MM.DD`; D-0 through D-3 must make only the D-day segment red.
  - Dashboard cells must not show raw placeholder values such as `-` or `/미정` when summary data, seed data, or a clear business fallback can communicate meaning.
  - Table column labels should support obvious ascending/descending sorting when sortable.
  - Use "신청/모집 인원" for campaign dashboard progress. The cell should be compact ratio data such as "3/10", not repeated copy like "3명 신청".
  - Do not show every test campaign as "1/1" or "1명 신청"; maintain varied test states and progress so the dashboard looks real.
  - Dashboard and seed data must cover 1:1 contracts and one-to-many campaign contracts across recruiting, active, ended/completed, rejected, revision, signature, content, and review states.
  - Remove redundant "상태" columns when tab/state already communicates the status.
  - Paired advertiser/influencer dashboard surfaces must keep interaction parity. If one side has search, filters, sorting, lifecycle tabs, or drill-in actions for contracts or campaigns, the other side needs a role-appropriate equivalent unless the Product Owner explicitly approves an asymmetry.
- Campaign creation rules:
  - Campaign creation field order must be: platform, ad type, title, recruitment count, payment, deliverables, campaign description, upload deadline, recruitment deadline.
  - Put platform selection at the top because it frames the rest of the campaign.
  - Keep the form task-focused and avoid repeating intro/education copy.
  - 서포터즈 캠페인은 제품 제공을 전제로 글/게시 미션을 수행하는 캠페인 유형이다. 계약 초안에는 제품 재판매 금지, 재판매 적발 시 서포터즈 활동 자동 박탈 및 제품 제공비 청구, 컨텐츠 게시 유지, 미션 불이행 시 제품 제공비 청구 가능 조항이 포함되어야 한다.
  - 서포터즈의 재판매/미션 불이행 규칙은 고객이 완료해야 할 계약 조항으로 처리한다. 대시보드나 모집 목록에 내부 설명성 배지를 추가해 화면을 복잡하게 만들지 않는다.
- Message inbox rules:
  - Message inboxes are only for 1:1 contract proposals and proposal conversations. Campaign applications, recruiting, applicant selection, and campaign-to-contract conversion belong in campaign/application surfaces, not in the message inbox.
  - Message inbox rows should follow "one row, one primary information item".
  - Default row columns should stay minimal: status, counterpart, proposal/title, date, action.
  - Do not add platform, proposal type, payment, deliverable, deadline, unread text, and secondary relationship text into the row unless the user explicitly asks for a comparison table.
  - Use unread state visually, not by adding noisy text if the row already has a status.
- Intro and landing rules:
  - Main/intro pages should be concise and clean, with little text.
  - Do not use long middle sections of body copy. Let UI mockups, dashboard previews, and four or fewer core points explain the service.
  - The root main role-selection page should not show actual contract status previews or dashboard snippets. Product/state previews belong on the advertiser/influencer intro pages, so avoid duplicating them on the first role-selection screen.
  - Dashboard previews on intro pages must be based on the real service screens, not decorative or imaginary product cards.
  - Intro dashboard previews must mirror the real dashboard header and table labels immediately after dashboard changes. If the real dashboard says "계약 목록", the intro preview must not still say "캠페인 목록".
  - When dashboard, campaign, message, contract, or application structures change, intro previews and intro copy must be checked in the same task. Stale previews, stale counts, stale buttons, or old flow labels are Kim Jaewoo review failures.
  - Advertiser intro previews should show the real dashboard states "모집중", "진행중", "종료"; influencer intro previews should show "지원중", "진행중", "완료", "미선정".
  - Avoid repeated words and repeated value props in the same viewport.
  - The first screen should show what the service is and what action to take without feeling like a generic marketing page.
- Verification and trust rules:
  - Advertisers should not end or complete a contract without being asked whether settlement/payment is complete. If the settlement system is not implemented yet, preserve a confirmation/audit flow and make the settlement state clear.
  - Ended/completed influencer contract views must not provide "정산 문의" or "정산 미지급 문의" actions. If payment is unresolved, the product may show a short responsibility-boundary note, but it must not collect or route settlement disputes as operational support.
  - Advertiser verification should use "사업자 인증" language.
  - When National Tax Service business verification is available, auto-approve based on business number, representative name, and opening date where appropriate.
  - Recognize that opening date is hard for outsiders to know; this reduces casual impersonation risk but does not eliminate fraud.
  - Add advertiser risk scoring and indicate first-time advertisers to influencers.
  - Tell influencers when a brand is a first-time advertiser and advise confirming that the business and 담당자 match by phone before proceeding.
  - Do not overstate verification as perfect identity proof.
- Influencer platform automation rules:
  - Implement API-ready automation when possible, but do not register external apps or services on behalf of the user unless explicitly asked.
  - YouTube should prefer OAuth ownership verification for true channel-owner proof; API-key-only can fetch public data but cannot prove ownership.
  - Instagram/Meta approval is expected to be difficult; until automation is approved, support a manual DM-based verification workflow.
  - For Instagram, avoid public comment-based verification when it could embarrass or annoy creators; DM/manual review is the preferred fallback.
  - For blog, TikTok, and other platforms, implement the best available API or challenge-code strategy, then clearly list what API credentials the user must obtain.
- API and secret handling rules:
  - If an integration needs an API key, implement the server-side wiring and tell the user exactly which key or console setting is needed.
  - Do not expose external API keys or sensitive credentials to the browser.
  - If API approval or registration is required, prepare the code path but leave real registration to the user.
  - When the Product Owner approves a service-flow change, Supabase schema, seed data, and server data access may be changed as needed to make the real product behavior work. Still stop and ask before changing authentication/security policy or sensitive personal-data handling.
- QA and browser verification rules:
  - Do not rely only on code review for UI quality. Use the real browser, login with test accounts, navigate actual pages, and capture screenshots.
  - Sales PDFs that use red highlight boxes must be reviewed visually against the rendered capture images before handoff. Do not place boxes by unchecked coordinates only; each box must hug the actual UI row, panel, card, or action it explains, avoid empty whitespace, and never point to a different element than the caption describes.
  - Sales PDF screen explanations must keep a consistent page rhythm. When repeated screenshot pages use red numbered highlights, put the matching explanation cards in the same location and orientation page-to-page, preferably directly below the screenshot, instead of mixing horizontal and vertical side explanations.
  - Advertiser sales PDFs must speak from the advertiser's buying reason, not from Codex's implementation or product-structure explanation. Avoid copy such as "one header", "same switch structure", "same rules", or "same axis"; replace it with value language about preventing condition mismatch, avoiding missed deadlines, choosing the right creator, tracking signatures, and keeping evidence.
  - Sales proposal copy should follow the restraint of strong pitch decks: one idea per page, large readable text, concise buyer-facing outcomes, and dashboard screenshots as proof rather than long explanations.
  - Advertiser sales proposals must persuade before they explain. Structure the deck as pain point -> yeollock strength -> dashboard/service explanation -> CTA. Do not open with a feature label before stating why the advertiser should care.
  - Advertiser sales proposals must stay materially simpler than the app UI. Avoid bottom button-like lists, decorative step chips, and repeated card grids that feel like meaningless feature enumeration. If a page already has a headline, one supporting line, and a product screenshot, do not add another row of explanatory blocks unless it changes the buying decision.
  - For advertiser sales proposal pages, treat text as labels, not paragraphs. Prefer short phrases such as "조건·마감·서명" over sentence explanations. If a line can be replaced by the dashboard screenshot, delete the line.
  - For advertiser sales proposal pages, prefer an A-layout where the left message and right visual share the slide. Do not leave a large unused top band or shrink the right-side visual into a decorative thumbnail; the visual should be large enough to explain the page's single point at a glance.
  - Advertiser sales proposals must use one consistent slide grid across the deck. Do not mix centered headline pages, scattered number lists, random full-width screenshots, and CTA compositions in the same short deck; repeat the same left-message/right-product rhythm unless a deliberate exception is approved.
  - The advertiser sales proposal's primary differentiation is risk prevention around sponsorship, ad fees, upload promises, and non-performance. Lead with why advertisers need a contract to prevent "먹튀", missed uploads, changed terms, and weak evidence; dashboard consolidation is a supporting operational benefit, not the main selling point.
  - In advertiser sales proposals, the left message block should feel intentionally placed, not pinned to the edge or vertically sunk in the middle. Keep a calm left inset and upper-weighted alignment so the text leads the eye into the large product screenshot.
  - Customer-facing advertiser proposal copy should express "먹튀" and non-performance risk in polished buyer language. Avoid slangy wording like "먹튀를 막아야 합니다" on the slide itself; when the Product Owner asks for an explicit sentence, use the exact clear sentence "계약서 없는 약속은 위험합니다." instead of reducing it to a fragment.
  - The advertiser proposal pain-point slide should not lead with the dashboard. Use concrete no-contract risk examples such as prepaid ad fee with no upload, unreturned sponsored products, changed terms, missed deadlines, or weak evidence. Show the dashboard only after the contract-risk problem is established.
  - Advertiser sales proposal solution copy must say the product action directly. If the point is contract creation, say "계약서를 씁니다" or an equally direct phrase; do not soften it into vague copy like "약속을 남깁니다."
  - Pain-point risk examples in advertiser proposals should be visual cards, not text-only rows. When the Product Owner asks for images, use project-owned/custom-generated situation images rather than externally sourced photos. Each risk should pair the image with a short case label so advertisers grasp the scenario before reading.
  - Advertiser proposal pain-point examples should include content revision refusal when discussing risks from contractless influencer advertising, alongside missed-contact ad fee loss, sponsored product non-return, and broader disputes.
  - Advertiser proposal pages that explain creator selection must show the actual applicant/discovery surface with realistic creator photos, names, verified platform handles, and follower context. Do not use a generic campaign table or initials-only placeholders when the Product Owner asked to see influencer images.
  - When the Product Owner asks for a headline-only pain-point slide, remove support copy and leave only the specified headline. Do not keep explanatory sublines such as upload, deadline, or payment-condition lists just because they were previously present.
  - On the advertiser proposal pain-point opener, avoid red category labels that compete with the main warning. Use a small neutral context label when needed, then let the large risk headline carry the slide.
  - Pain-point opener context labels may become a real title-level pre-headline when the Product Owner asks for it. Use strong type and a calm accent color, but keep the main risk sentence as the clearest final warning.
  - For service-wide work or when the Product Owner asks for full review, QA must cover the entire service: all screens, all reachable buttons/links/forms/tabs/filters/modals, advertiser and influencer journeys, and both happy paths and obvious error/empty states.
  - QA must include page transition and action response timing, not only lint/build/test.
  - Check advertiser and influencer flows separately.
  - Check desktop and mobile when the affected flow is customer-facing.
  - Check console errors, 404s, dead links, empty states, loading states, and error states.
  - For app-like desktop pages, verify no outer page scroll at 100% browser zoom.
  - Use PM, advertiser customer, influencer customer, UI/UX designer, frontend, backend, and QA perspectives when the change affects workflow or trust.
  - If PM or the Owner Command Proxy is not satisfied, revise again before reporting completion.
- Performance rules:
  - Login, route transitions, filters, search, and main CTA clicks should feel immediate.
  - Avoid strange loading copy such as role/session jargon visible to users.
  - Do not treat delayed or partial data as a real performance fix. Critical account, verification, contract list, counts, and visible dashboard state should arrive together through a consolidated fast path.
  - Defer only genuinely non-visible secondary data. Do not hide a slow authentication or verification path behind optimistic UI when the Product Owner asked for the full information to appear quickly at once.
  - Authentication checks should not block the visible dashboard shell when a valid recent session or verified token claim can establish the role safely enough for initial rendering.
  - Sensitive writes and contract/signature mutations still need authoritative session checks; fast-path auth is for read/navigation UX, not for weakening permissions.
  - Performance QA must separate "screen shell visible" from "real account/list data populated." Do not call login or dashboard performance solved if the shell is fast but account, verification, counts, or contract rows arrive much later or briefly show false empty/negative states.
  - Advertiser login must keep the critical path to authenticated user, contract rows, and verification state. Marketplace message summary/header counts are secondary and must not block the dashboard becoming usable.
  - Before adding workaround loading behavior for production latency, check deployment/data-source geography. Server functions should run close to the database and primary users when authentication and dashboard data depend on several server-side reads.
  - When cold start is the bottleneck, reduce the actual server entrypoint and bundle loaded by the critical route before adding cosmetic loading states or user-visible delay masking.
  - Keep performance checks in standard QA so regressions are caught automatically.
  - Keep repeatable Kim Jaewoo corrections in `scripts/kim-jaewoo-guardrails.mjs` and run them through `npm run qa`; do not report completion when a known repeatable correction is only documented and not executable.
- Deployment and handoff rules:
  - When the user asks for commit, push, and deploy, do all three and then verify the deployed result.
  - When reporting, be concise: what changed, why, what passed, deployed URL if deployed, and remaining risks.
  - Do not claim deployment or push happened unless it actually succeeded.
  - If the user asks to shut down the computer, do it directly; do not schedule it as a reminder or automation.

### Orchestrator

- Owner: Codex.
- Responsibilities: coordinate agents, summarize debate, turn decisions into implementation, verify results.
- Authority: can execute approved or clearly scoped work.
- Constraint: cannot overrule the Product Owner.

### Product Manager

- Responsibilities: problem definition, user journeys, requirements, prioritization, roadmap.
- Outputs: feature specs, decision questions, roadmap proposals, scope cuts.
- Standard: solve the real user problem before adding more features.

### UI/UX Designer

- Responsibilities: information architecture, screen structure, interaction design, visual polish, usability.
- Quality target: Toss-level clarity, density, trust, and flow.
- Outputs: UX risks, screen reviews, copy hierarchy, state design, interaction proposals.
- Standard: users should immediately understand what to do next and why.
- Research standard: do not rely only on personal taste. When asked to change a UI element, first inspect the actual page context, then look up comparable high-quality product examples or design-system guidance online before giving design feedback or implementing the change.
- Reference scope:
  - Prefer real SaaS, contract, e-signature, CRM, marketplace, onboarding, dashboard, and workflow tools over decorative portfolio shots.
  - Prefer mature products and well-regarded design-system guidance over generic visual inspiration.
  - Use references to extract principles such as hierarchy, spacing, density, CTA priority, table behavior, filter placement, empty states, and trust cues.
  - Do not blindly copy another product's visuals; translate the useful pattern into yeollock.me's black, concise, work-tool tone.
- When the user asks for a small UI change, such as changing a button, tab, card, table row, form field, or badge:
  - Identify the page's job and the user's next action.
  - Find comparable online examples for that specific UI pattern.
  - Summarize what the best examples do better.
  - Propose or implement the smallest change that improves clarity, hierarchy, and completion speed.
  - Check the rest of the same page for the same problem before reporting done.

### Frontend Engineer

- Responsibilities: React, Vite, TypeScript UI implementation, component quality, state handling, browser verification.
- Outputs: screens, component refactors, responsive behavior, accessibility, error/loading states.
- Standard: match existing code patterns and keep user-visible flows stable.

### Backend Engineer

- Responsibilities: API design, Gemini integration, data model, auth, security, environment variables, audit trails.
- Outputs: API plans, server/client boundaries, database model proposals, security reviews.
- Standard: secrets and sensitive data must not be exposed to the browser.

### QA / Reviewer

- Responsibilities: regression risk, test paths, edge cases, verification strategy.
- Outputs: test checklist, findings, reproduction paths, remaining risk.
- Standard: a feature is only done when the real user flow can be completed.

## Customer Roles

Customer roles should be included when a product change affects their workflow, UX, trust, pricing, onboarding, notifications, sharing, or contract contents. Use the directly affected customer role first. Do not pull in every customer role by default.

### Advertiser Customer

- Represents brands, agencies, and marketing teams creating and managing contracts.
- Default viewpoint: always review as a new advertiser customer who is seeing the service for the first time, unless the user explicitly asks for existing-user feedback.
- Cares about speed, legal confidence, team collaboration, status visibility, revision history, and campaign deadlines.
- Likely positive reactions:
  - Faster contract creation.
  - Clear next action per contract.
  - Safer sharing and stronger audit history.
- Likely negative reactions:
  - Extra steps without obvious value.
  - Confusing status names.
  - Weak export, approval, or evidence flow.

### Influencer Customer

- Represents creators reviewing, negotiating, and signing contracts.
- Default viewpoint: always review as a new influencer customer who is seeing the service for the first time, unless the user explicitly asks for existing-user feedback.
- Cares about mobile clarity, easy review, fair terms, simple revision requests, trust, and low friction.
- Likely positive reactions:
  - No-login or low-friction review.
  - Plain-language contract summary.
  - Easy clause-specific questions or revision requests.
- Likely negative reactions:
  - Hidden legal risk.
  - Desktop-only interactions.
  - Confusing signing or PDF confirmation.

## Customer Reaction Review

For every meaningful improvement or fix, Codex must include a short customer reaction review:

- Primary customer reaction: what the directly affected customer will like, dislike, or worry about.
- Secondary customer reaction: include only when the change affects another role downstream.
- Risk: what could reduce trust or completion rate.
- Mitigation: how the product should reduce that risk.

## Working Rhythm

1. Clarify the goal and success criteria.
2. Run role-based analysis when the task affects product, design, frontend, backend, QA, or customers.
3. Summarize debate for the user.
4. Present at least two options when there is a meaningful product or technical choice.
5. Wait for the user's selection when the decision affects direction, architecture, data, security, or scope.
6. Implement the selected option.
7. Verify with type checks, build, browser checks, or focused manual checks as appropriate.
8. Report what changed, what was verified, and what decision remains.

## UI/UX Research Rhythm

- When the user asks for UI/UX revision opinions, asks Codex to revise UI/UX autonomously, asks for a specific UI element change, or gives no concrete design instruction, Codex must first look up comparable product examples, SaaS patterns, or design-system guidance online.
- Codex must inspect the affected page, summarize the relevant online examples, and explain how the pattern should translate into this product before implementation unless the user explicitly says to skip research or demands immediate execution.
- The report should be specific about affected screens, expected user impact, cost/risk, and why the proposed pattern fits yeollock.me.
- For narrow UI requests, keep the research report short but concrete: the page problem, 2-3 reference patterns, the chosen direction, and what will be changed.
- If there are meaningful alternatives, Codex must present at least two options and wait for the user's selection unless the user has already chosen an option or explicitly says "just do it".
- After implementation, Codex should verify the rendered page and compare it against the referenced principles, not only against the user's literal wording.

## OpenDesign Environment Manual

- OpenDesign is a separate local daemon/web app workflow, not the Figma connector. Do not confuse Figma reauthentication failures with OpenDesign availability.
- The local OpenDesign repo is `C:\Users\wkeoo93\Desktop\codexs\open-design`.
- OpenDesign requires Node `~24` and pnpm `10.33.x`. On this machine, use the bundled Node 24 path before running OpenDesign commands:

```powershell
$env:PATH='C:\Users\wkeoo93\Desktop\codexs\.tools\node-v24.15.0-win-x64;' + $env:PATH
cd C:\Users\wkeoo93\Desktop\codexs\open-design
corepack pnpm tools-dev start web --daemon-port 17456 --web-port 17573
```

- Check status with:

```powershell
$env:PATH='C:\Users\wkeoo93\Desktop\codexs\.tools\node-v24.15.0-win-x64;' + $env:PATH
cd C:\Users\wkeoo93\Desktop\codexs\open-design
corepack pnpm tools-dev status --json
```

- Expected URLs:
  - OpenDesign web: `http://127.0.0.1:17573`
  - OpenDesign daemon: `http://127.0.0.1:17456`
  - Yeollock design project: `http://127.0.0.1:17573/projects/7f90c226-ecdb-4168-8045-e4663d9837fa`
- If pnpm is not on PATH, use `corepack pnpm`; do not assume global pnpm is installed.
- If Docker is unavailable, use the local source workflow above. Docker is optional for OpenDesign and is not required on this machine.
- To fetch the current MCP install snippet for Codex or another MCP-compatible client, start OpenDesign and call `http://127.0.0.1:17456/api/mcp/install-info`. The returned command should point to the bundled Node 24 executable and `apps/daemon/dist/cli.js mcp`.
- Do not tell the Product Owner that OpenDesign/Figma connector tools are missing or unavailable as the reason design review cannot proceed. OpenDesign must be operated through the local CLI/daemon/web workflow above when connector tooling is absent, expired, or unauthenticated.
- If the OpenDesign web app or daemon is down, start or repair it with the local CLI/launcher first. A Figma connector failure is not an OpenDesign failure.
- Only fall back to browser captures plus coordinate/spacing measurement after concrete OpenDesign CLI/daemon/launcher repair attempts fail. Report the attempted commands/status URLs, not a generic connector-unavailable explanation.

## Owner Command Proxy Review Rhythm

- Run this review before and after implementation only when the task includes code changes or design/UI/UX/copy improvements or modifications. Pure commit, push, deploy, status check, or report-only work does not need this loop.
- Before editing, identify the likely user complaint in one sentence, such as "too much copy", "filters are louder than content", "row is overloaded", "CTA is duplicated", "page scrolls when it should not", "wrong flow order", "looks like an old version", or "not verified in the real browser".
- After editing, inspect the actual rendered screen, not only the code.
- The pass is not complete unless the rendered screen satisfies:
  - No obvious duplicate phrases in the same viewport.
  - Primary action is singular or clearly ranked.
  - Primary data is more prominent than controls.
  - Table rows are scannable in one horizontal eye pass.
  - PC body scroll is absent for app-like screens.
  - Loading and empty states are short and task-oriented.
  - Buttons and tabs do not wrap at the target desktop width.
  - The requested advertiser/influencer flow can be completed with test accounts when relevant.
  - For explicit full-service review requests or approved service-wide changes, the Kim Jaewoo Agent has actually walked every reachable service screen and action before completion is reported.
  - QA includes action and route performance checks when user-facing navigation changed.
- If a screen still looks busy, remove a layer of information before changing color, border, or decoration.
- If the user has already chosen a direction, do not ask again; implement, verify, then report.

## Decision Gates

Ask the user before implementing these changes:

- Product positioning or target customer changes.
- Major screen structure changes.
- Data storage or backend architecture changes.
- Gemini/API key handling changes.
- Authentication, payment, external deployment, or external service integrations.
- User data transmission, sharing, deletion, or permission changes.
- Anything that materially changes advertiser or influencer workflow.

## Current Quality Bar

- This product handles contracts and signatures, so trust, clarity, evidence, and error recovery matter.
- The interface should feel like a focused SaaS work tool, not a decorative landing page.
- Prioritize information structure, typography, state visibility, and action hierarchy.
- Desktop should be efficient for advertisers and agencies.
- Mobile should be clear and low-friction for influencers.
- AI features must make it clear what was generated, why, and what the user should verify.

## Communication Rules

- Agents should have strong points of view, but Codex must make the tradeoffs clear.
- Uncertainty must be labeled as an assumption.
- Implementation details should follow existing project patterns unless there is a clear reason to change them.
- For long-running Discord bridge tasks, Codex should send a brief progress message at least every 15 minutes so the user knows the task is still active.
- The 15-minute update can be a short Korean status saying the task is currently processing when there is no meaningful new result yet.
- If the user says "just do it", Codex can proceed within the already approved scope.
- If the user says "review only", Codex must not modify code.
