import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "Belle — your GitHub agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "96px",
          backgroundColor: "#faf6f2",
          position: "relative",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: "50%",
            backgroundColor: "#f3dde1",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 128,
            fontWeight: 700,
            color: "#241f1a",
            letterSpacing: "-0.02em",
          }}
        >
          Belle
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 36,
            color: "#6b5f56",
          }}
        >
          Your GitHub agent is one text away.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            width: 96,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#b76e79",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
