// Virality metrics — separates genuinely viral content from paid reach.
//
// Why: platforms count paid ad impressions as views. A brand Short with 18M views
// and 73 likes was bought, not earned. Sorting by raw views pushes those ads to the
// top and the AI then "explains" virality that never happened.
//
// The algorithm itself judges engagement (watch time, likes/comments/shares per
// reach), so we rank on engagement and on outlier performance vs. the creator's
// own baseline instead of raw views.

export type ViralityVerdict = "organic-viral" | "strong" | "average" | "likely-paid";

export interface ViralityMetrics {
  /** (likes + comments) / views, as a percentage */
  engagementRate: number;
  /** likes / views, as a percentage */
  likeRate: number;
  /** comments / views, as a percentage */
  commentRate: number;
  /** views ÷ creator's average views per video (null when baseline unknown) */
  outlierScore: number | null;
  /** views ÷ subscribers/followers (null when unknown) */
  viewsPerFollower: number | null;
  /** true when the numbers look like paid/ad reach rather than organic */
  likelyPaid: boolean;
  /** human-readable reason for the paid flag */
  paidReason: string | null;
  /** 0–100 composite score used for default ranking */
  viralityScore: number;
  verdict: ViralityVerdict;
}

export interface MetricsInput {
  views: number;
  likes: number;
  comments: number;
  /** channel subscribers / IG followers, if known */
  followers?: number | null;
  /** creator's average views per video, if known */
  baselineViews?: number | null;
}

// Thresholds (tuned for Shorts/Reels; organic viral content is usually 2–10% likes)
const PAID_LIKE_RATE = 0.05;      // % — below this with big reach = almost certainly ads
const SUSPECT_LIKE_RATE = 0.3;    // % — weak engagement
const MIN_VIEWS_FOR_PAID = 100_000;
const PAID_VIEWS_PER_FOLLOWER = 300; // views ≫ audience size + weak engagement

export function computeViralityMetrics(input: MetricsInput): ViralityMetrics {
  const views = Math.max(0, input.views || 0);
  const likes = Math.max(0, input.likes || 0);
  const comments = Math.max(0, input.comments || 0);

  const pct = (n: number) => (views > 0 ? (n / views) * 100 : 0);
  const likeRate = pct(likes);
  const commentRate = pct(comments);
  const engagementRate = pct(likes + comments);

  const followers = input.followers && input.followers > 0 ? input.followers : null;
  const baseline = input.baselineViews && input.baselineViews > 0 ? input.baselineViews : null;

  const outlierScore = baseline ? views / baseline : null;
  const viewsPerFollower = followers ? views / followers : null;

  // ── Paid / ad detection ─────────────────────────────────────────────
  let likelyPaid = false;
  let paidReason: string | null = null;
  if (views >= MIN_VIEWS_FOR_PAID && likeRate < PAID_LIKE_RATE) {
    likelyPaid = true;
    paidReason = `Only ${likeRate.toFixed(3)}% of viewers liked it — typical of ad impressions, not organic reach`;
  } else if (
    views >= MIN_VIEWS_FOR_PAID &&
    viewsPerFollower !== null &&
    viewsPerFollower > PAID_VIEWS_PER_FOLLOWER &&
    likeRate < SUSPECT_LIKE_RATE
  ) {
    likelyPaid = true;
    paidReason = `${Math.round(viewsPerFollower)}× more views than followers with weak engagement — likely promoted`;
  }

  // ── Composite virality score (0–100) ────────────────────────────────
  // Engagement quality (max 50): 5% engagement ≈ full marks
  const engagementPts = Math.min(50, (engagementRate / 5) * 50);
  // Comment depth (max 10): comments signal conversation/debate
  const commentPts = Math.min(10, (commentRate / 0.2) * 10);
  // Outlier performance (max 25): 10× the creator's average ≈ full marks (log scale)
  const outlierPts = outlierScore !== null
    ? Math.max(0, Math.min(25, (Math.log10(Math.max(outlierScore, 1)) / 1) * 25))
    : 10; // neutral when unknown
  // Reach (max 15): log scale, 10M views ≈ full marks
  const reachPts = views > 0 ? Math.min(15, (Math.log10(views) / 7) * 15) : 0;

  let viralityScore = engagementPts + commentPts + outlierPts + reachPts;
  if (likelyPaid) viralityScore = Math.min(viralityScore, 10);
  viralityScore = Math.round(Math.max(0, Math.min(100, viralityScore)));

  let verdict: ViralityVerdict;
  if (likelyPaid) verdict = "likely-paid";
  else if (viralityScore >= 65 && engagementRate >= 2) verdict = "organic-viral";
  else if (viralityScore >= 45) verdict = "strong";
  else verdict = "average";

  return {
    engagementRate: round(engagementRate, 2),
    likeRate: round(likeRate, 3),
    commentRate: round(commentRate, 3),
    outlierScore: outlierScore !== null ? round(outlierScore, 1) : null,
    viewsPerFollower: viewsPerFollower !== null ? round(viewsPerFollower, 1) : null,
    likelyPaid,
    paidReason,
    viralityScore,
    verdict,
  };
}

/** Channel-level check: huge total views but a tiny audience usually means ad spend. */
export function isLikelyAdDrivenChannel(subscribers: number, totalViews: number): boolean {
  if (!subscribers || !totalViews) return false;
  return totalViews / subscribers > 1000 && subscribers < 50_000;
}

export const VERDICT_LABEL: Record<ViralityVerdict, string> = {
  "organic-viral": "Organic viral",
  strong: "Strong performer",
  average: "Average",
  "likely-paid": "Likely paid ad",
};

/** Plain-language summary of the numbers, for feeding to the AI analyst. */
export function describeMetricsForPrompt(m: ViralityMetrics, views: number): string {
  const lines = [
    `Views: ${views.toLocaleString()}`,
    `Engagement rate: ${m.engagementRate}% (likes ${m.likeRate}%, comments ${m.commentRate}%)`,
  ];
  if (m.outlierScore !== null) lines.push(`Outlier score: ${m.outlierScore}× the creator's average views`);
  if (m.viewsPerFollower !== null) lines.push(`Views per follower: ${m.viewsPerFollower}`);
  lines.push(`Virality score: ${m.viralityScore}/100 — verdict: ${VERDICT_LABEL[m.verdict]}`);
  if (m.likelyPaid && m.paidReason) lines.push(`PAID-REACH WARNING: ${m.paidReason}`);
  return lines.join("\n");
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
