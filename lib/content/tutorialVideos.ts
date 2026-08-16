// lib/content/tutorialVideos.ts
// Shared source for recorded walkthrough clips -- consumed by both
// app/learn/page.tsx (in-app "Guided tours" section) and
// app/about/videos/page.tsx (public marketing page), same reasoning as
// lib/content/learnTopics.tsx: one list, edited once, instead of the two
// pages drifting apart. Expected to grow over time as more clips are
// recorded (see app/studio) -- this is deliberately just a flat, ordered
// array so adding another one is a single new entry, no restructuring.

export type TutorialVideo = {
  id: string;
  title: string;
  description?: string;
  src: string; // public/videos/*
};

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    id: "typical-workflow-1",
    title: "Typical Workflow - 1",
    description: "The simplest case: nothing's changed since the last load but the weather. Open the app, tap Reload, confirm the updated API and temp, and log it.",
    src: "/videos/typical-workflow-1.mp4",
  },
  {
    id: "typical-workflow-2",
    title: "Typical Workflow - 2",
    description: "The same reload workflow, this time switching to a different preset and picking a different terminal first.",
    src: "/videos/typical-workflow-2.mp4",
  },
];
