import { createCanvas } from "./canvas.js";

export const settings = {
  duration: 5,
  fps: 60,
  dimensions: [1920, 1080],
};

export function sketch(width = 256, height = 256) {
  const { canvas, context } = createCanvas(
    "2d",
    width,
    height,
    {
      antialias: true,
      alpha: false,
      desynchronized: true,
      powerPreference: "high-performance",
    },
    true
  );

  return { canvas, context, render, width, height };

  function render({ playhead }) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "tomato";
    context.fillRect(0, 0, width, height);
    const x = width / 2;
    const y = height / 2;
    context.beginPath();
    const arc = Math.PI * 2 * playhead;
    const dim = Math.min(width, height);
    context.arc(x, y, dim * 0.33, 0, arc);
    context.lineWidth = dim * 0.05;
    context.strokeStyle = "white";
    context.stroke();
  }
}

export const show = (data, width, height) => {
  const url = URL.createObjectURL(new Blob([data], { type: "video/mp4" }));
  const video = document.createElement("video");
  video.setAttribute("muted", "muted");
  video.setAttribute("autoplay", "autoplay");
  video.setAttribute("controls", "controls");
  const min = Math.min(width, window.innerWidth, window.innerHeight);
  const aspect = width / height;
  const size = min * 0.75;
  video.style.width = `${size}px`;
  video.style.height = `${size / aspect}px`;

  const container = document.body;
  container.appendChild(video);
  video.src = url;

  const text = document.createElement("div");
  const anchor = document.createElement("a");
  text.appendChild(anchor);
  anchor.href = url;
  anchor.id = "download";
  anchor.textContent = "Click here to download MP4 file...";
  anchor.download = "download.mp4";
  container.appendChild(text);
};
