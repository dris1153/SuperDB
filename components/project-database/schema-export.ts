import { getViewportForBounds, type Rect } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { BRAND } from "@/components/brand-mark";

const PAD = 40;

/**
 * The whole graph as an image, not just what is on screen: the viewport is re-framed around the
 * nodes' bounds for the capture, the way xyflow's own export example does. Node menus carry
 * `data-export-hidden` and are left out.
 */
export async function downloadGraph(bounds: Rect, format: "png" | "svg", fileName: string) {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("There is no graph on screen to download.");

  const width = Math.ceil(bounds.width + PAD * 2);
  const height = Math.ceil(bounds.height + PAD * 2);
  const { x, y, zoom } = getViewportForBounds(bounds, width, height, 1, 1, 0);

  const options = {
    backgroundColor: BRAND.ink,
    width,
    height,
    pixelRatio: 2,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
    filter: (node: HTMLElement) => !(node instanceof HTMLElement && node.dataset.exportHidden !== undefined),
  };

  const url = format === "png" ? await toPng(viewport, options) : await toSvg(viewport, options);
  const a = document.createElement("a");
  a.download = `${fileName}.${format}`;
  a.href = url;
  a.click();
}
