import { v4 as uuid } from "uuid";
import { listConfigs, listCreators, listVideos, saveVideos } from "./pipeline-data";
import { instagramAnalysisKey } from "./analysis-cache";
import { scrapeReels } from "./apify";
import { uploadVideo, analyzeVideo } from "./gemini";
import { generateNewConcepts } from "./claude";
import type { PipelineParams, PipelineProgress, Video, ActiveTask } from "./types";

const VIDEO_CONCURRENCY = 3;

export interface ScrapedVideo {
  videoUrl: string;
  postUrl: string;
  views: number;
  likes: number;
  comments: number;
  username: string;
  thumbnail: string;
  datePosted: string;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

/**
 * Splits the top reels into ones this config hasn't analyzed yet and ones it has.
 * Already-analyzed ones come back as their saved record with today's counts.
 * The same reel appearing twice in one run is only analyzed once.
 */
export function splitAlreadyAnalyzed(top: ScrapedVideo[], saved: Video[], configName: string): { toAnalyze: ScrapedVideo[]; refreshed: Video[] } {
  const done = new Map(saved.filter((v) => v.configName === configName).map((v) => [instagramAnalysisKey(v.link), v]));
  const seen = new Set<string>();
  const toAnalyze: ScrapedVideo[] = [];
  const refreshed: Video[] = [];
  for (const v of top) {
    const key = instagramAnalysisKey(v.postUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = done.get(key);
    if (prev) refreshed.push({ ...prev, views: v.views, likes: v.likes, comments: v.comments });
    else toAnalyze.push(v);
  }
  return { toAnalyze, refreshed };
}

export async function runPipeline(
  params: PipelineParams,
  onProgress: (progress: PipelineProgress) => void
): Promise<void> {
  const progress: PipelineProgress = {
    status: "running",
    phase: "scraping",
    activeTasks: [],
    creatorsCompleted: 0,
    creatorsTotal: 0,
    creatorsScraped: 0,
    videosAnalyzed: 0,
    videosTotal: 0,
    videosSkipped: 0,
    errors: [],
    log: [],
  };

  const emit = () => {
    onProgress({ ...progress, activeTasks: [...progress.activeTasks], log: [...progress.log], errors: [...progress.errors] });
  };

  const log = (msg: string) => {
    progress.log.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    emit();
  };

  const addTask = (task: ActiveTask) => {
    progress.activeTasks.push(task);
    emit();
  };

  const updateTask = (id: string, step: string) => {
    const t = progress.activeTasks.find((t) => t.id === id);
    if (t) { t.step = step; emit(); }
  };

  const removeTask = (id: string) => {
    progress.activeTasks = progress.activeTasks.filter((t) => t.id !== id);
    emit();
  };

  try {
    // Load config
    const configs = await listConfigs();
    const config = configs.find((c) => c.configName === params.configName);
    if (!config) throw new Error(`Config "${params.configName}" not found`);

    log(`Loaded config: ${config.configName}`);

    // Load creators
    const allCreators = await listCreators();
    const creators = allCreators.filter((c) => c.category === config.creatorsCategory);
    if (creators.length === 0) throw new Error(`No creators found for category "${config.creatorsCategory}"`);

    progress.creatorsTotal = creators.length;
    log(`Found ${creators.length} creators — scraping all in parallel`);
    emit();

    // Phase 1: Scrape all creators in parallel
    progress.phase = "scraping";
    const cutoffDate = new Date(Date.now() - params.nDays * 24 * 60 * 60 * 1000);
    const allTopVideos: ScrapedVideo[] = [];

    const scrapeResults = await Promise.allSettled(
      creators.map(async (creator) => {
        const taskId = `scrape-${creator.username}`;
        addTask({ id: taskId, creator: creator.username, step: "Scraping reels" });

        const reels = await scrapeReels(creator.username, params.maxVideos, params.nDays);
        updateTask(taskId, `Found ${reels.length} reels`);

        const videos = reels
          .filter((r) => r.videoUrl && r.timestamp)
          .map((r) => ({
            videoUrl: r.videoUrl,
            postUrl: r.url,
            views: r.videoPlayCount || 0,
            likes: r.likesCount || 0,
            comments: r.commentsCount || 0,
            username: r.ownerUsername || creator.username,
            thumbnail: r.images?.[0] || "",
            datePosted: r.timestamp?.split("T")[0] || "",
            timestamp: new Date(r.timestamp),
          }))
          .filter((v) => v.timestamp >= cutoffDate);

        videos.sort((a, b) => b.views - a.views);
        const topVideos = videos.slice(0, params.topK);

        updateTask(taskId, `Top ${topVideos.length} selected`);
        log(`@${creator.username}: ${reels.length} reels → top ${topVideos.length} selected`);

        removeTask(taskId);
        progress.creatorsScraped++;
        emit();

        return { creator: creator.username, videos: topVideos };
      })
    );

    for (const result of scrapeResults) {
      if (result.status === "fulfilled") {
        for (const v of result.value.videos) {
          allTopVideos.push(v);
        }
        progress.creatorsCompleted++;
      } else {
        const msg = `Scraping error: ${result.reason instanceof Error ? result.reason.message : result.reason}`;
        progress.errors.push(msg);
        log(msg);
        progress.creatorsCompleted++;
      }
    }

    // Skip reels this config already analyzed: no Gemini cost, no duplicate rows.
    // Their saved records get today's view/like/comment counts (already fetched, so free).
    const { toAnalyze, refreshed } = splitAlreadyAnalyzed(allTopVideos, await listVideos(), params.configName);
    progress.videosSkipped = refreshed.length;
    if (refreshed.length) {
      try {
        await saveVideos(refreshed);
      } catch (err) {
        console.warn("[pipeline] couldn't update counts on already-analyzed videos", err);
      }
    }

    progress.videosTotal = toAnalyze.length;
    log(
      `Scraping done. ${toAnalyze.length} new videos to analyze (${VIDEO_CONCURRENCY} workers)` +
        (refreshed.length ? `, ${refreshed.length} already analyzed for this config, skipped (free)` : "")
    );
    emit();

    // Phase 2: Process videos concurrently
    progress.phase = "analyzing";
    emit();

    await runWithConcurrency(toAnalyze, VIDEO_CONCURRENCY, async (video) => {
      const taskId = `video-${uuid().slice(0, 8)}`;
      const label = `${video.views.toLocaleString()} views`;

      try {
        addTask({ id: taskId, creator: video.username, step: "Downloading", views: video.views });

        const videoResponse = await fetch(video.videoUrl);
        if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        const contentType = videoResponse.headers.get("content-type") || "video/mp4";

        updateTask(taskId, "Uploading to Gemini");
        log(`@${video.username} (${label}): uploading to Gemini`);

        const fileData = await uploadVideo(videoBuffer, contentType);

        updateTask(taskId, "Gemini analyzing");
        log(`@${video.username} (${label}): Gemini analyzing`);

        const analysis = await analyzeVideo(
          fileData.uri,
          fileData.mimeType,
          config.analysisInstruction
        );

        updateTask(taskId, "Writing new concepts");
        log(`@${video.username} (${label}): writing new concepts`);

        const newConcepts = await generateNewConcepts(analysis, config.newConceptsInstruction);

        const videoRecord: Video = {
          id: uuid(),
          link: video.postUrl,
          thumbnail: video.thumbnail,
          creator: video.username,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          analysis,
          newConcepts,
          datePosted: video.datePosted,
          dateAdded: new Date().toISOString().slice(0, 10),
          configName: params.configName,
          starred: false,
        };

        // Save right away, so a run that gets cut off (e.g. Vercel's 5-minute limit) keeps finished videos.
        await saveVideos([videoRecord]);
        progress.videosAnalyzed++;
        removeTask(taskId);
        log(`@${video.username} (${label}): done`);
        emit();
      } catch (err) {
        removeTask(taskId);
        const msg = `@${video.username} (${label}): ${err instanceof Error ? err.message : err}`;
        progress.errors.push(msg);
        log(`Error — ${msg}`);
        emit();
      }
    });

    progress.phase = "done";
    progress.status = "completed";
    log(
      `Pipeline complete! ${progress.videosAnalyzed}/${progress.videosTotal} new videos analyzed` +
        (progress.videosSkipped ? `, ${progress.videosSkipped} skipped (already analyzed)` : "") +
        `, ${progress.errors.length} errors.`
    );
    emit();
  } catch (err) {
    progress.status = "error";
    const msg = `Pipeline error: ${err instanceof Error ? err.message : err}`;
    progress.errors.push(msg);
    log(msg);
    emit();
  }
}
