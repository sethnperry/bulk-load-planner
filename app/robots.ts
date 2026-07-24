import type { MetadataRoute } from "next";

// Keeps the demo-account login link and its "session ended" page out of
// search indexing -- not a security boundary, just avoids crawlers wasting
// commandeer cycles or surfacing the link in search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/api/demo", "/demo"],
    },
  };
}
