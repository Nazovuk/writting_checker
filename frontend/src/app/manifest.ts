import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Polyglot Writing Coach",
    short_name: "Polyglot Coach",
    description: "Grammar correction and learning workspace for EN/TR/BG.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ef",
    theme_color: "#0f2730",
    lang: "en",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
